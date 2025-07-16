#!/usr/bin/env node

/**
 * QualGen Device Agent
 * Runs on devices/emulators to execute AppWright tests
 * Communicates with Job Orchestrator via gRPC
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

class DeviceAgent {
    constructor(config = {}) {
        this.deviceId = config.deviceId || this.generateDeviceId();
        this.deviceType = config.deviceType || this.detectDeviceType();
        this.platform = config.platform || this.detectPlatform();
        this.orchestratorUrl = config.orchestratorUrl || 'localhost:50051';
        this.wsUrl = config.wsUrl || 'ws://localhost:8080/ws';
        this.workDir = config.workDir || path.join(os.tmpdir(), 'qualgen-agent');
        
        this.capabilities = {
            platform: this.platform,
            device_type: this.deviceType,
            screen_resolution: '1920x1080',
            os_version: this.getOSVersion(),
            available_storage: '10GB',
            supports_video_recording: true,
            supports_app_installation: true,
            max_parallel_jobs: 1
        };
        
        this.currentJobs = new Map();
        this.client = null;
        this.ws = null;
        this.heartbeatInterval = null;
        
        console.log(`🤖 Device Agent initialized: ${this.deviceId}`);
        console.log(`📱 Platform: ${this.platform}, Type: ${this.deviceType}`);
    }
    
    generateDeviceId() {
        const hostname = os.hostname();
        const platform = os.platform();
        const arch = os.arch();
        return `${hostname}-${platform}-${arch}-${Date.now()}`;
    }
    
    detectDeviceType() {
        // Check if running on emulator
        if (process.env.ANDROID_EMULATOR || process.env.IOS_SIMULATOR) {
            return 'emulator';
        }
        
        // Check if BrowserStack
        if (process.env.BROWSERSTACK_BUILD_NAME) {
            return 'browserstack';
        }
        
        // Default to real device
        return 'device';
    }
    
    detectPlatform() {
        if (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) {
            return 'android';
        }
        if (process.env.IOS_SIMULATOR_ROOT || process.platform === 'darwin') {
            return 'ios';
        }
        return 'unknown';
    }
    
    getOSVersion() {
        const platform = os.platform();
        const release = os.release();
        return `${platform} ${release}`;
    }
    
    async initialize() {
        try {
            // Create work directory
            await fs.mkdir(this.workDir, { recursive: true });
            
            // Connect to orchestrator
            await this.connectToOrchestrator();
            
            // Connect to WebSocket for real-time updates
            await this.connectWebSocket();
            
            // Register device
            await this.registerDevice();
            
            // Start heartbeat
            this.startHeartbeat();
            
            console.log('✅ Device agent initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize device agent:', error.message);
            process.exit(1);
        }
    }
    
    async connectToOrchestrator() {
        // Load gRPC proto definition
        const packageDefinition = protoLoader.loadSync(
            path.join(__dirname, 'job-orchestrator.proto'), {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            }
        );
        
        const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
        const JobService = protoDescriptor.qualgen.JobService;
        
        this.client = new JobService(this.orchestratorUrl, grpc.credentials.createInsecure());
        
        console.log(`🔗 Connected to orchestrator: ${this.orchestratorUrl}`);
    }
    
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl);
            
            this.ws.on('open', () => {
                console.log('🔗 WebSocket connected');
                resolve();
            });
            
            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    console.error('❌ Invalid WebSocket message:', error.message);
                }
            });
            
            this.ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error.message);
                reject(error);
            });
            
            this.ws.on('close', () => {
                console.log('🔌 WebSocket disconnected, attempting to reconnect...');
                setTimeout(() => this.connectWebSocket(), 5000);
            });
        });
    }
    
    async registerDevice() {
        return new Promise((resolve, reject) => {
            const request = {
                device_id: this.deviceId,
                device_type: this.deviceType,
                platform: this.platform,
                capabilities: JSON.stringify(this.capabilities),
                status: 'available'
            };
            
            this.client.RegisterDevice(request, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    console.log('✅ Device registered successfully');
                    resolve(response);
                }
            });
        });
    }
    
    startHeartbeat() {
        this.heartbeatInterval = setInterval(async () => {
            try {
                await this.sendHeartbeat();
            } catch (error) {
                console.error('❌ Heartbeat failed:', error.message);
            }
        }, 30000); // Every 30 seconds
    }
    
    async sendHeartbeat() {
        return new Promise((resolve, reject) => {
            const request = {
                device_id: this.deviceId,
                status: this.currentJobs.size > 0 ? 'busy' : 'available',
                active_jobs: this.currentJobs.size,
                system_info: JSON.stringify({
                    cpu_usage: this.getCPUUsage(),
                    memory_usage: this.getMemoryUsage(),
                    disk_usage: this.getDiskUsage()
                })
            };
            
            this.client.Heartbeat(request, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }
    
    async pollForJobs() {
        return new Promise((resolve, reject) => {
            const request = {
                device_id: this.deviceId,
                max_jobs: 1
            };
            
            this.client.PollForJobs(request, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response.jobs || []);
                }
            });
        });
    }
    
    async executeJob(job) {
        const jobId = job.job_id;
        console.log(`🚀 Starting job execution: ${jobId}`);
        
        try {
            // Update job status to running
            await this.updateJobStatus(jobId, 'running', 'Test execution started');
            
            // Create job workspace
            const jobWorkDir = path.join(this.workDir, jobId);
            await fs.mkdir(jobWorkDir, { recursive: true });
            
            // Download app if needed
            let appPath = null;
            if (job.app_url) {
                appPath = await this.downloadApp(job.app_url, jobWorkDir);
                console.log(`📱 Downloaded app: ${appPath}`);
            }
            
            // Install app if needed
            if (appPath) {
                await this.installApp(appPath);
                console.log(`📱 Installed app successfully`);
            }
            
            // Start video recording
            const videoPath = path.join(jobWorkDir, 'execution.mp4');
            const videoRecording = await this.startVideoRecording(videoPath);
            
            // Execute the actual test
            const testResults = await this.runAppWrightTest(job, jobWorkDir);
            
            // Stop video recording
            await this.stopVideoRecording(videoRecording);
            
            // Upload artifacts
            const artifacts = await this.uploadArtifacts(jobWorkDir, job);
            
            // Update job status to completed
            await this.updateJobStatus(jobId, 'completed', 'Test execution completed', {
                test_results: testResults,
                artifacts: artifacts,
                video_url: artifacts.video_url
            });
            
            console.log(`✅ Job completed successfully: ${jobId}`);
            
        } catch (error) {
            console.error(`❌ Job failed: ${jobId}`, error.message);
            
            // Update job status to failed
            await this.updateJobStatus(jobId, 'failed', error.message);
        } finally {
            // Cleanup
            this.currentJobs.delete(jobId);
        }
    }
    
    async downloadApp(appUrl, workDir) {
        // Mock implementation - in reality would download from S3/GCS
        const appName = path.basename(appUrl) || 'app.apk';
        const appPath = path.join(workDir, appName);
        
        console.log(`📥 Downloading app from: ${appUrl}`);
        
        // Simulate download
        await fs.writeFile(appPath, `Mock app binary for ${appUrl}`);
        
        return appPath;
    }
    
    async installApp(appPath) {
        // Platform-specific app installation
        if (this.platform === 'android') {
            return this.installAndroidApp(appPath);
        } else if (this.platform === 'ios') {
            return this.installIOSApp(appPath);
        }
        
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
    
    async installAndroidApp(appPath) {
        return new Promise((resolve, reject) => {
            const cmd = `adb install -r "${appPath}"`;
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`App installation failed: ${stderr}`));
                } else {
                    resolve(stdout);
                }
            });
        });
    }
    
    async installIOSApp(appPath) {
        return new Promise((resolve, reject) => {
            const cmd = `xcrun simctl install booted "${appPath}"`;
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`App installation failed: ${stderr}`));
                } else {
                    resolve(stdout);
                }
            });
        });
    }
    
    async startVideoRecording(outputPath) {
        console.log(`🎥 Starting video recording: ${outputPath}`);
        
        if (this.platform === 'android') {
            return this.startAndroidRecording(outputPath);
        } else if (this.platform === 'ios') {
            return this.startIOSRecording(outputPath);
        }
        
        // Mock recording for unsupported platforms
        return { mockRecording: true };
    }
    
    async startAndroidRecording(outputPath) {
        return new Promise((resolve, reject) => {
            const recordingProcess = spawn('adb', [
                'shell', 'screenrecord',
                '--size', '720x1280',
                '--bit-rate', '2000000',
                '/sdcard/recording.mp4'
            ]);
            
            recordingProcess.on('error', reject);
            
            // Give it a moment to start
            setTimeout(() => {
                resolve({
                    process: recordingProcess,
                    outputPath,
                    platform: 'android'
                });
            }, 1000);
        });
    }
    
    async startIOSRecording(outputPath) {
        return new Promise((resolve, reject) => {
            const cmd = 'xcrun simctl io booted recordVideo --type=mp4';
            const recordingProcess = spawn('sh', ['-c', `${cmd} "${outputPath}"`]);
            
            recordingProcess.on('error', reject);
            
            setTimeout(() => {
                resolve({
                    process: recordingProcess,
                    outputPath,
                    platform: 'ios'
                });
            }, 1000);
        });
    }
    
    async stopVideoRecording(recording) {
        if (recording.mockRecording) {
            return recording.outputPath;
        }
        
        console.log(`🎥 Stopping video recording`);
        
        if (recording.platform === 'android') {
            // Stop recording and pull file
            recording.process.kill('SIGINT');
            
            // Wait a moment for recording to stop
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Pull the recording
            await new Promise((resolve, reject) => {
                exec(`adb pull /sdcard/recording.mp4 "${recording.outputPath}"`, (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
            
            // Clean up device
            exec('adb shell rm /sdcard/recording.mp4');
            
        } else {
            // For iOS, just kill the process
            recording.process.kill('SIGINT');
        }
        
        return recording.outputPath;
    }
    
    async runAppWrightTest(job, workDir) {
        console.log(`🧪 Running AppWright test: ${job.test_path}`);
        
        // Mock test execution - in reality would run actual AppWright tests
        const testResults = {
            total: 15,
            passed: 12,
            failed: 2,
            skipped: 1,
            duration: Math.floor(Math.random() * 300) + 60, // 60-360 seconds
            test_cases: [
                {
                    name: 'Login Flow Test',
                    status: 'passed',
                    duration: 15.2,
                    assertions: 8
                },
                {
                    name: 'Navigation Test',
                    status: 'passed',
                    duration: 22.5,
                    assertions: 12
                },
                {
                    name: 'Form Validation Test',
                    status: 'failed',
                    duration: 8.3,
                    error: 'Element not found: #submit-button',
                    assertions: 5
                },
                {
                    name: 'Network Error Handling',
                    status: 'passed',
                    duration: 31.1,
                    assertions: 6
                },
                {
                    name: 'Performance Test',
                    status: 'failed',
                    duration: 45.8,
                    error: 'App startup time exceeded 3 seconds',
                    assertions: 3
                }
            ]
        };
        
        // Simulate test execution delay
        await new Promise(resolve => 
            setTimeout(resolve, testResults.duration * 100)
        );
        
        // Save test results to file
        const resultsPath = path.join(workDir, 'test-results.json');
        await fs.writeFile(resultsPath, JSON.stringify(testResults, null, 2));
        
        console.log(`✅ Test execution completed: ${testResults.passed}/${testResults.total} passed`);
        
        return testResults;
    }
    
    async uploadArtifacts(workDir, job) {
        console.log(`📤 Uploading artifacts for job: ${job.job_id}`);
        
        // Mock artifact upload - in reality would upload to S3/GCS
        const artifacts = {
            video_url: `https://qualgen-artifacts.s3.amazonaws.com/${job.job_id}/execution.mp4`,
            screenshots: [
                `https://qualgen-artifacts.s3.amazonaws.com/${job.job_id}/screenshot-1.png`,
                `https://qualgen-artifacts.s3.amazonaws.com/${job.job_id}/screenshot-2.png`
            ],
            logs_url: `https://qualgen-artifacts.s3.amazonaws.com/${job.job_id}/test-logs.txt`,
            results_url: `https://qualgen-artifacts.s3.amazonaws.com/${job.job_id}/test-results.json`
        };
        
        return artifacts;
    }
    
    async updateJobStatus(jobId, status, message, extra = {}) {
        return new Promise((resolve, reject) => {
            const request = {
                job_id: jobId,
                status: status,
                message: message,
                extra_data: JSON.stringify(extra)
            };
            
            this.client.UpdateJobStatus(request, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }
    
    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'job_assigned':
                console.log(`📨 New job assigned: ${message.job_id}`);
                this.executeJob(message.job).catch(console.error);
                break;
                
            case 'job_cancelled':
                console.log(`❌ Job cancelled: ${message.job_id}`);
                this.cancelJob(message.job_id);
                break;
                
            case 'device_command':
                console.log(`📝 Device command: ${message.command}`);
                this.handleDeviceCommand(message);
                break;
                
            default:
                console.log(`📨 Unknown message type: ${message.type}`);
        }
    }
    
    async cancelJob(jobId) {
        if (this.currentJobs.has(jobId)) {
            const job = this.currentJobs.get(jobId);
            // Kill any running processes
            if (job.process) {
                job.process.kill();
            }
            this.currentJobs.delete(jobId);
            await this.updateJobStatus(jobId, 'cancelled', 'Job cancelled by user');
        }
    }
    
    async handleDeviceCommand(message) {
        switch (message.command) {
            case 'restart':
                console.log('🔄 Restarting device agent...');
                process.exit(0);
                break;
                
            case 'status':
                const status = {
                    device_id: this.deviceId,
                    active_jobs: this.currentJobs.size,
                    capabilities: this.capabilities,
                    uptime: process.uptime()
                };
                this.ws.send(JSON.stringify({
                    type: 'device_status',
                    status: status
                }));
                break;
        }
    }
    
    getCPUUsage() {
        // Mock CPU usage
        return Math.floor(Math.random() * 80) + 10;
    }
    
    getMemoryUsage() {
        const used = process.memoryUsage();
        return Math.floor((used.heapUsed / used.heapTotal) * 100);
    }
    
    getDiskUsage() {
        // Mock disk usage
        return Math.floor(Math.random() * 60) + 20;
    }
    
    async start() {
        console.log('🚀 Starting QualGen Device Agent...');
        
        await this.initialize();
        
        // Main polling loop
        const pollLoop = async () => {
            try {
                if (this.currentJobs.size < this.capabilities.max_parallel_jobs) {
                    const jobs = await this.pollForJobs();
                    
                    for (const job of jobs) {
                        if (this.currentJobs.size >= this.capabilities.max_parallel_jobs) {
                            break;
                        }
                        
                        this.currentJobs.set(job.job_id, job);
                        this.executeJob(job).catch(console.error);
                    }
                }
            } catch (error) {
                console.error('❌ Polling error:', error.message);
            }
            
            // Poll every 5 seconds
            setTimeout(pollLoop, 5000);
        };
        
        pollLoop();
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down device agent...');
            
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
            }
            
            if (this.ws) {
                this.ws.close();
            }
            
            process.exit(0);
        });
        
        console.log('✅ Device agent started successfully');
        console.log(`📱 Device ID: ${this.deviceId}`);
        console.log(`🔄 Polling for jobs every 5 seconds...`);
    }
}

// CLI interface
if (require.main === module) {
    const config = {
        deviceId: process.env.DEVICE_ID,
        deviceType: process.env.DEVICE_TYPE,
        platform: process.env.PLATFORM,
        orchestratorUrl: process.env.ORCHESTRATOR_URL,
        wsUrl: process.env.WS_URL,
        workDir: process.env.WORK_DIR
    };
    
    const agent = new DeviceAgent(config);
    agent.start().catch(error => {
        console.error('❌ Failed to start device agent:', error);
        process.exit(1);
    });
}

module.exports = DeviceAgent;
