#!/usr/bin/env node

/**
 * QualGen Platform Startup Script
 * Starts all QualGen services in the correct order
 */

const { spawn } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const axios = require('axios');

class QualGenStarter {
    constructor() {
        this.services = new Map();
        this.shutdownInProgress = false;
    }
    
    async start() {
        console.log(chalk.blue.bold('\n🚀 Starting QualGen Platform...\n'));
        
        try {
            // Start services in order
            await this.startDashboard();
            await this.startOrchestrator();
            await this.startDeviceAgent();
            
            console.log(chalk.green.bold('\n✅ QualGen Platform started successfully!\n'));
            this.printServiceStatus();
            this.setupGracefulShutdown();
            
        } catch (error) {
            console.error(chalk.red.bold('❌ Failed to start QualGen Platform:'), error.message);
            await this.shutdown();
            process.exit(1);
        }
    }
    
    async startDashboard() {
        const spinner = ora('Starting QualGen Dashboard...').start();
        
        try {
            const dashboard = spawn('node', ['qualgen-complete-platform.js'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, PORT: '3007' }
            });
            
            this.services.set('dashboard', {
                process: dashboard,
                name: 'QualGen Dashboard',
                port: 3007,
                url: 'http://localhost:3007'
            });
            
            // Wait for service to be ready
            await this.waitForService('http://localhost:3007', 30000);
            
            dashboard.stdout.on('data', (data) => {
                console.log(chalk.cyan('[Dashboard]'), data.toString().trim());
            });
            
            dashboard.stderr.on('data', (data) => {
                console.error(chalk.red('[Dashboard Error]'), data.toString().trim());
            });
            
            spinner.succeed('Dashboard started on http://localhost:3007');
            
        } catch (error) {
            spinner.fail('Failed to start Dashboard');
            throw error;
        }
    }
    
    async startOrchestrator() {
        const spinner = ora('Starting Job Orchestrator...').start();
        
        try {
            const orchestrator = spawn('node', ['job-orchestrator.js'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, PORT: '8080', GRPC_PORT: '50051' }
            });
            
            this.services.set('orchestrator', {
                process: orchestrator,
                name: 'Job Orchestrator',
                port: 8080,
                url: 'http://localhost:8080'
            });
            
            // Wait for service to be ready
            await this.waitForService('http://localhost:8080/health', 30000);
            
            orchestrator.stdout.on('data', (data) => {
                console.log(chalk.yellow('[Orchestrator]'), data.toString().trim());
            });
            
            orchestrator.stderr.on('data', (data) => {
                console.error(chalk.red('[Orchestrator Error]'), data.toString().trim());
            });
            
            spinner.succeed('Orchestrator started on http://localhost:8080');
            
        } catch (error) {
            spinner.fail('Failed to start Orchestrator');
            throw error;
        }
    }
    
    async startDeviceAgent() {
        const spinner = ora('Starting Device Agent...').start();
        
        try {
            const agent = spawn('node', ['device-agent.js'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { 
                    ...process.env, 
                    ORCHESTRATOR_URL: 'localhost:50051',
                    WS_URL: 'ws://localhost:8080/ws'
                }
            });
            
            this.services.set('agent', {
                process: agent,
                name: 'Device Agent',
                port: null,
                url: null
            });
            
            // Give agent time to register
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            agent.stdout.on('data', (data) => {
                console.log(chalk.magenta('[Agent]'), data.toString().trim());
            });
            
            agent.stderr.on('data', (data) => {
                console.error(chalk.red('[Agent Error]'), data.toString().trim());
            });
            
            spinner.succeed('Device Agent started and registered');
            
        } catch (error) {
            spinner.fail('Failed to start Device Agent');
            throw error;
        }
    }
    
    async waitForService(url, timeout = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                const response = await axios.get(url, { timeout: 2000 });
                if (response.status === 200) {
                    return;
                }
            } catch (error) {
                // Service not ready yet
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        throw new Error(`Service at ${url} did not become ready within ${timeout}ms`);
    }
    
    printServiceStatus() {
        console.log(chalk.blue.bold('📊 Service Status:'));
        console.log(chalk.blue('─'.repeat(60)));
        
        for (const [key, service] of this.services) {
            const status = service.process && !service.process.killed ? 
                chalk.green('● RUNNING') : chalk.red('● STOPPED');
            
            console.log(`${status} ${service.name}`);
            if (service.url) {
                console.log(`   ${chalk.dim('URL:')} ${chalk.cyan(service.url)}`);
            }
        }
        
        console.log(chalk.blue('─'.repeat(60)));
        console.log(chalk.green('\n🎯 Quick Access:'));
        console.log(`   Dashboard: ${chalk.cyan('http://localhost:3007')}`);
        console.log(`   API:       ${chalk.cyan('http://localhost:8080')}`);
        console.log(`   CLI:       ${chalk.cyan('./qgjob.js --help')}`);
        console.log(`\n${chalk.dim('Press Ctrl+C to stop all services')}\n`);
    }
    
    setupGracefulShutdown() {
        process.on('SIGINT', async () => {
            if (this.shutdownInProgress) {
                return;
            }
            
            console.log(chalk.yellow('\n🛑 Shutting down QualGen Platform...'));
            await this.shutdown();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            if (this.shutdownInProgress) {
                return;
            }
            
            console.log(chalk.yellow('\n🛑 Shutting down QualGen Platform...'));
            await this.shutdown();
            process.exit(0);
        });
    }
    
    async shutdown() {
        if (this.shutdownInProgress) {
            return;
        }
        
        this.shutdownInProgress = true;
        const spinner = ora('Stopping services...').start();
        
        try {
            // Stop services in reverse order
            const serviceKeys = Array.from(this.services.keys()).reverse();
            
            for (const key of serviceKeys) {
                const service = this.services.get(key);
                if (service.process && !service.process.killed) {
                    service.process.kill('SIGTERM');
                    
                    // Wait for graceful shutdown
                    await new Promise((resolve) => {
                        const timeout = setTimeout(() => {
                            service.process.kill('SIGKILL');
                            resolve();
                        }, 5000);
                        
                        service.process.on('exit', () => {
                            clearTimeout(timeout);
                            resolve();
                        });
                    });
                }
            }
            
            spinner.succeed('All services stopped');
            
        } catch (error) {
            spinner.fail('Error during shutdown');
            console.error(chalk.red('Shutdown error:'), error.message);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const starter = new QualGenStarter();
    starter.start().catch(error => {
        console.error(chalk.red.bold('Startup failed:'), error);
        process.exit(1);
    });
}

module.exports = QualGenStarter;
