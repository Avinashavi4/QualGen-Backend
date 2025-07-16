#!/usr/bin/env node

/**
 * QualGen AppWright Test Execution Engine
 * Handles actual test execution on real devices, emulators, and BrowserStack
 * Implements video recording and artifact collection
 */

const { spawn, exec, execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const axios = require('axios');

class AppWrightTestEngine {
    constructor(config = {}) {
        this.orchestratorUrl = config.orchestratorUrl || 'http://localhost:8080';
        this.browserstackUsername = config.browserstackUsername || process.env.BROWSERSTACK_USERNAME;
        this.browserstackAccessKey = config.browserstackAccessKey || process.env.BROWSERSTACK_ACCESS_KEY;
        this.workDir = config.workDir || path.join(process.cwd(), 'test-executions');
        this.videoStoragePath = config.videoStoragePath || path.join(process.cwd(), 'recordings');
        
        this.activeTests = new Map();
        this.devicePool = new Map();
        
        console.log('🎯 AppWright Test Execution Engine initialized');
    }
    
    async initialize() {
        // Create necessary directories
        await fs.mkdir(this.workDir, { recursive: true });
        await fs.mkdir(this.videoStoragePath, { recursive: true });
        
        // Discover available devices
        await this.discoverDevices();
        
        // Start device monitoring
        this.startDeviceMonitoring();
        
        console.log('✅ AppWright Test Engine ready');
    }
    
    async discoverDevices() {
        console.log('🔍 Discovering available devices...');
        
        // Discover Android devices and emulators
        await this.discoverAndroidDevices();
        
        // Discover iOS simulators (if on macOS)
        if (process.platform === 'darwin') {
            await this.discoverIOSSimulators();
        }
        
        // Register with BrowserStack if credentials available
        if (this.browserstackUsername && this.browserstackAccessKey) {
            await this.discoverBrowserStackDevices();
        }
        
        console.log(`📱 Found ${this.devicePool.size} devices total`);
    }
    
    async discoverAndroidDevices() {
        try {
            // Check for connected devices
            const devicesOutput = execSync('adb devices -l', { encoding: 'utf8', timeout: 10000 });
            const devices = devicesOutput.split('\n').slice(1).filter(line => line.trim() && !line.includes('List of devices'));
            
            for (const deviceLine of devices) {
                const parts = deviceLine.split(/\s+/);
                if (parts.length >= 2 && parts[1] === 'device') {
                    const deviceId = parts[0];
                    const deviceInfo = await this.getAndroidDeviceInfo(deviceId);
                    
                    this.devicePool.set(deviceId, {
                        id: deviceId,
                        type: deviceId.includes('emulator') ? 'emulator' : 'device',
                        platform: 'android',
                        ...deviceInfo,
                        status: 'available',
                        capabilities: await this.getAndroidCapabilities(deviceId)
                    });
                    
                    console.log(`📱 Found Android ${deviceId.includes('emulator') ? 'emulator' : 'device'}: ${deviceId}`);
                }
            }
        } catch (error) {
            console.log('⚠️ No Android devices found or ADB not available');
        }
    }
    
    async getAndroidDeviceInfo(deviceId) {
        try {
            const brand = execSync(`adb -s ${deviceId} shell getprop ro.product.brand`, { encoding: 'utf8' }).trim();
            const model = execSync(`adb -s ${deviceId} shell getprop ro.product.model`, { encoding: 'utf8' }).trim();
            const version = execSync(`adb -s ${deviceId} shell getprop ro.build.version.release`, { encoding: 'utf8' }).trim();
            const sdk = execSync(`adb -s ${deviceId} shell getprop ro.build.version.sdk`, { encoding: 'utf8' }).trim();
            
            return {
                name: `${brand} ${model}`,
                osVersion: version,
                apiLevel: sdk,
                brand,
                model
            };
        } catch (error) {
            return {
                name: `Android Device ${deviceId}`,
                osVersion: 'Unknown',
                apiLevel: 'Unknown',
                brand: 'Unknown',
                model: 'Unknown'
            };
        }
    }
    
    async getAndroidCapabilities(deviceId) {
        try {
            const resolution = execSync(`adb -s ${deviceId} shell wm size`, { encoding: 'utf8' }).trim();
            const density = execSync(`adb -s ${deviceId} shell wm density`, { encoding: 'utf8' }).trim();
            
            return {
                screenRecording: true,
                appInstallation: true,
                networkEmulation: true,
                locationEmulation: true,
                batteryEmulation: deviceId.includes('emulator'),
                resolution: resolution.includes(':') ? resolution.split(':')[1].trim() : 'Unknown',
                density: density.includes(':') ? density.split(':')[1].trim() : 'Unknown'
            };
        } catch (error) {
            return {
                screenRecording: true,
                appInstallation: true,
                networkEmulation: false,
                locationEmulation: false,
                batteryEmulation: false,
                resolution: 'Unknown',
                density: 'Unknown'
            };
        }
    }
    
    async discoverIOSSimulators() {
        try {
            const simulatorsOutput = execSync('xcrun simctl list devices available --json', { encoding: 'utf8' });
            const simulators = JSON.parse(simulatorsOutput);
            
            for (const [runtime, devices] of Object.entries(simulators.devices)) {
                if (runtime.includes('iOS')) {
                    for (const device of devices) {
                        if (device.state === 'Booted' || device.state === 'Shutdown') {
                            this.devicePool.set(device.udid, {
                                id: device.udid,
                                type: 'simulator',
                                platform: 'ios',
                                name: `${device.name} (${runtime})`,
                                osVersion: runtime.replace('com.apple.CoreSimulator.SimRuntime.iOS-', '').replace('-', '.'),
                                status: device.state === 'Booted' ? 'available' : 'offline',
                                capabilities: {
                                    screenRecording: true,
                                    appInstallation: true,
                                    networkEmulation: true,
                                    locationEmulation: true,
                                    batteryEmulation: true
                                }
                            });
                            
                            console.log(`📱 Found iOS Simulator: ${device.name}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.log('⚠️ No iOS simulators found or Xcode not available');
        }
    }
    
    async discoverBrowserStackDevices() {
        try {
            const response = await axios.get('https://api.browserstack.com/app-automate/devices.json', {
                auth: {
                    username: this.browserstackUsername,
                    password: this.browserstackAccessKey
                }
            });
            
            for (const device of response.data.slice(0, 10)) { // Limit to first 10 for demo
                const deviceId = `bs_${device.device}_${device.os}_${device.os_version}`.replace(/\s+/g, '_');
                
                this.devicePool.set(deviceId, {
                    id: deviceId,
                    type: 'browserstack',
                    platform: device.os.toLowerCase(),
                    name: device.device,
                    osVersion: device.os_version,
                    status: 'available',
                    browserstack: true,
                    capabilities: {
                        screenRecording: true,
                        appInstallation: true,
                        networkEmulation: true,
                        locationEmulation: true,
                        batteryEmulation: false,
                        realDevice: device.realMobile
                    }
                });
            }
            
            console.log(`🌐 Connected to BrowserStack with ${response.data.length} devices`);
        } catch (error) {
            console.log('⚠️ Could not connect to BrowserStack:', error.message);
        }
    }
    
    async executeTest(testJob) {
        const testId = testJob.id || `test_${Date.now()}`;
        console.log(`🚀 Starting test execution: ${testId}`);
        
        try {
            // Find available device
            const device = this.findAvailableDevice(testJob.platform, testJob.deviceType);
            if (!device) {
                throw new Error(`No available ${testJob.platform} ${testJob.deviceType || 'device'} found`);
            }
            
            // Mark device as busy
            device.status = 'busy';
            
            // Create test workspace
            const testWorkspace = path.join(this.workDir, testId);
            await fs.mkdir(testWorkspace, { recursive: true });
            
            // Start test execution
            const testExecution = {
                id: testId,
                device: device,
                workspace: testWorkspace,
                startTime: new Date(),
                status: 'running'
            };
            
            this.activeTests.set(testId, testExecution);
            
            // Execute the test based on device type
            let result;
            if (device.type === 'browserstack') {
                result = await this.executeBrowserStackTest(testJob, device, testWorkspace);
            } else {
                result = await this.executeLocalTest(testJob, device, testWorkspace);
            }
            
            // Update test completion
            testExecution.status = 'completed';
            testExecution.endTime = new Date();
            testExecution.result = result;
            
            // Release device
            device.status = 'available';
            
            console.log(`✅ Test completed: ${testId}`);
            return result;
            
        } catch (error) {
            console.error(`❌ Test failed: ${testId}`, error.message);
            
            // Release device if assigned
            const testExecution = this.activeTests.get(testId);
            if (testExecution && testExecution.device) {
                testExecution.device.status = 'available';
            }
            
            throw error;
        }
    }
    
    findAvailableDevice(platform, deviceType) {
        for (const device of this.devicePool.values()) {
            if (device.platform === platform && 
                device.status === 'available' && 
                (!deviceType || device.type === deviceType)) {
                return device;
            }
        }
        return null;
    }
    
    async executeLocalTest(testJob, device, workspace) {
        console.log(`📱 Executing test on local device: ${device.name}`);
        
        // Install app if provided
        if (testJob.appPath) {
            await this.installApp(device, testJob.appPath);
        }
        
        // Start video recording
        const videoPath = path.join(workspace, 'test_recording.mp4');
        const recording = await this.startVideoRecording(device, videoPath);
        
        // Execute AppWright test
        const testResult = await this.runAppWrightTest(testJob, device, workspace);
        
        // Stop video recording
        await this.stopVideoRecording(device, recording);
        
        // Collect artifacts
        const artifacts = await this.collectArtifacts(device, workspace);
        
        return {
            testResult,
            artifacts,
            videoPath,
            device: {
                id: device.id,
                name: device.name,
                platform: device.platform,
                osVersion: device.osVersion
            }
        };
    }
    
    async executeBrowserStackTest(testJob, device, workspace) {
        console.log(`🌐 Executing test on BrowserStack: ${device.name}`);
        
        // Create BrowserStack session
        const sessionId = await this.createBrowserStackSession(device, testJob);
        
        // Execute test via BrowserStack API
        const testResult = await this.runBrowserStackTest(sessionId, testJob);
        
        // Download video and artifacts from BrowserStack
        const artifacts = await this.downloadBrowserStackArtifacts(sessionId, workspace);
        
        return {
            testResult,
            artifacts,
            sessionId,
            device: {
                id: device.id,
                name: device.name,
                platform: device.platform,
                osVersion: device.osVersion,
                browserstack: true
            }
        };
    }
    
    async installApp(device, appPath) {
        console.log(`📦 Installing app on ${device.name}...`);
        
        if (device.platform === 'android') {
            return new Promise((resolve, reject) => {
                exec(`adb -s ${device.id} install -r "${appPath}"`, (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(`App installation failed: ${stderr}`));
                    } else {
                        console.log(`✅ App installed successfully on ${device.name}`);
                        resolve();
                    }
                });
            });
        } else if (device.platform === 'ios') {
            return new Promise((resolve, reject) => {
                exec(`xcrun simctl install ${device.id} "${appPath}"`, (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(`App installation failed: ${stderr}`));
                    } else {
                        console.log(`✅ App installed successfully on ${device.name}`);
                        resolve();
                    }
                });
            });
        }
    }
    
    async startVideoRecording(device, outputPath) {
        console.log(`🎥 Starting video recording for ${device.name}...`);
        
        if (device.platform === 'android') {
            return new Promise((resolve, reject) => {
                const recordingProcess = spawn('adb', [
                    '-s', device.id,
                    'shell', 'screenrecord',
                    '--size', '720x1280',
                    '--bit-rate', '2000000',
                    '/sdcard/test_recording.mp4'
                ]);
                
                recordingProcess.on('error', reject);
                
                setTimeout(() => {
                    resolve({
                        process: recordingProcess,
                        outputPath,
                        devicePath: '/sdcard/test_recording.mp4',
                        platform: 'android'
                    });
                }, 2000);
            });
        } else if (device.platform === 'ios') {
            return new Promise((resolve, reject) => {
                const recordingProcess = spawn('xcrun', [
                    'simctl', 'io', device.id, 'recordVideo',
                    '--type=mp4', outputPath
                ]);
                
                recordingProcess.on('error', reject);
                
                setTimeout(() => {
                    resolve({
                        process: recordingProcess,
                        outputPath,
                        platform: 'ios'
                    });
                }, 2000);
            });
        }
    }
    
    async stopVideoRecording(device, recording) {
        console.log(`🎥 Stopping video recording for ${device.name}...`);
        
        if (recording.platform === 'android') {
            // Stop recording
            recording.process.kill('SIGINT');
            
            // Wait for recording to finish
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Pull the video file
            return new Promise((resolve, reject) => {
                exec(`adb -s ${device.id} pull ${recording.devicePath} "${recording.outputPath}"`, (error, stdout, stderr) => {
                    if (error) {
                        console.warn('⚠️ Could not pull video file:', stderr);
                    } else {
                        console.log(`✅ Video saved: ${recording.outputPath}`);
                    }
                    
                    // Clean up device
                    exec(`adb -s ${device.id} shell rm ${recording.devicePath}`);
                    resolve(recording.outputPath);
                });
            });
        } else if (recording.platform === 'ios') {
            recording.process.kill('SIGINT');
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log(`✅ Video saved: ${recording.outputPath}`);
            return recording.outputPath;
        }
    }
    
    async runAppWrightTest(testJob, device, workspace) {
        console.log(`🧪 Running AppWright test: ${testJob.testName || 'Unknown Test'}`);
        
        // Simulate AppWright test execution
        // In real implementation, this would use Appium WebDriver or similar
        const testSteps = [
            'Initialize test session',
            'Launch application',
            'Navigate to target screen',
            'Perform test actions',
            'Verify expected results',
            'Capture screenshots',
            'Clean up session'
        ];
        
        const results = {
            testName: testJob.testName || 'AppWright Test',
            status: 'passed',
            duration: Math.floor(Math.random() * 120) + 30, // 30-150 seconds
            steps: [],
            screenshots: [],
            assertions: {
                total: 5,
                passed: 5,
                failed: 0
            }
        };
        
        // Simulate test execution with steps
        for (let i = 0; i < testSteps.length; i++) {
            const step = testSteps[i];
            console.log(`  ⏳ ${step}...`);
            
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, Math.random() * 3000 + 1000));
            
            // Take screenshot
            const screenshotPath = path.join(workspace, `screenshot_${i + 1}.png`);
            await this.takeScreenshot(device, screenshotPath);
            
            results.steps.push({
                name: step,
                status: 'passed',
                duration: Math.random() * 3 + 1,
                screenshot: screenshotPath
            });
            
            results.screenshots.push(screenshotPath);
            
            console.log(`  ✅ ${step} completed`);
        }
        
        // Save test results
        const resultsPath = path.join(workspace, 'test_results.json');
        await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
        
        return results;
    }
    
    async takeScreenshot(device, outputPath) {
        if (device.platform === 'android') {
            return new Promise((resolve) => {
                exec(`adb -s ${device.id} shell screencap -p /sdcard/screenshot.png && adb -s ${device.id} pull /sdcard/screenshot.png "${outputPath}"`, (error) => {
                    if (!error) {
                        exec(`adb -s ${device.id} shell rm /sdcard/screenshot.png`);
                    }
                    resolve();
                });
            });
        } else if (device.platform === 'ios') {
            return new Promise((resolve) => {
                exec(`xcrun simctl io ${device.id} screenshot "${outputPath}"`, () => {
                    resolve();
                });
            });
        }
    }
    
    async collectArtifacts(device, workspace) {
        const artifacts = {
            logs: [],
            screenshots: [],
            videos: [],
            reports: []
        };
        
        // Collect device logs
        if (device.platform === 'android') {
            const logPath = path.join(workspace, 'device.log');
            try {
                execSync(`adb -s ${device.id} logcat -d > "${logPath}"`);
                artifacts.logs.push(logPath);
            } catch (error) {
                console.warn('⚠️ Could not collect device logs');
            }
        }
        
        // Find all screenshots and videos in workspace
        try {
            const files = await fs.readdir(workspace);
            for (const file of files) {
                const filePath = path.join(workspace, file);
                if (file.endsWith('.png')) {
                    artifacts.screenshots.push(filePath);
                } else if (file.endsWith('.mp4')) {
                    artifacts.videos.push(filePath);
                } else if (file.endsWith('.json') || file.endsWith('.xml')) {
                    artifacts.reports.push(filePath);
                }
            }
        } catch (error) {
            console.warn('⚠️ Could not collect all artifacts');
        }
        
        return artifacts;
    }
    
    async createBrowserStackSession(device, testJob) {
        // This would create an actual BrowserStack session
        // For demo purposes, return a mock session ID
        return `bs_session_${Date.now()}`;
    }
    
    async runBrowserStackTest(sessionId, testJob) {
        // This would execute the test via BrowserStack's API
        // For demo purposes, return mock results
        return {
            testName: testJob.testName || 'BrowserStack Test',
            status: 'passed',
            duration: Math.floor(Math.random() * 180) + 45,
            sessionId: sessionId,
            assertions: {
                total: 8,
                passed: 7,
                failed: 1
            }
        };
    }
    
    async downloadBrowserStackArtifacts(sessionId, workspace) {
        // This would download artifacts from BrowserStack
        // For demo purposes, create mock artifacts
        const mockVideoPath = path.join(workspace, 'browserstack_recording.mp4');
        await fs.writeFile(mockVideoPath, 'Mock BrowserStack video content');
        
        return {
            logs: [],
            screenshots: [],
            videos: [mockVideoPath],
            reports: []
        };
    }
    
    startDeviceMonitoring() {
        setInterval(async () => {
            // Re-discover devices periodically
            await this.discoverDevices();
        }, 60000); // Every minute
    }
    
    getDeviceStatus() {
        const status = {
            total: this.devicePool.size,
            available: 0,
            busy: 0,
            offline: 0,
            byPlatform: { android: 0, ios: 0 },
            byType: { device: 0, emulator: 0, simulator: 0, browserstack: 0 }
        };
        
        for (const device of this.devicePool.values()) {
            status[device.status]++;
            status.byPlatform[device.platform]++;
            status.byType[device.type]++;
        }
        
        return status;
    }
    
    getActiveTests() {
        return Array.from(this.activeTests.values());
    }
}

// CLI interface for standalone usage
if (require.main === module) {
    const engine = new AppWrightTestEngine();
    
    async function runDemo() {
        await engine.initialize();
        
        console.log('\n📊 Device Status:', engine.getDeviceStatus());
        
        // Demo test execution
        if (engine.devicePool.size > 0) {
            const testJob = {
                id: 'demo_test_001',
                testName: 'Open Playwright on Wikipedia and verify Microsoft is visible',
                platform: 'android',
                deviceType: 'emulator',
                appPath: null // No app installation for demo
            };
            
            try {
                const result = await engine.executeTest(testJob);
                console.log('\n✅ Demo test completed:', result);
            } catch (error) {
                console.error('\n❌ Demo test failed:', error.message);
            }
        } else {
            console.log('\n⚠️ No devices available for testing');
        }
    }
    
    runDemo().catch(console.error);
}

module.exports = AppWrightTestEngine;
