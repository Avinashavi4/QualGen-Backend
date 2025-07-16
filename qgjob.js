#!/usr/bin/env node

/**
 * QualGen CLI Tool (qgjob)
 * Submit and manage AppWright test jobs across devices, emulators, and BrowserStack
 */

const { Command } = require('commander');
const axios = require('axios');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');

class QualGenCLI {
  constructor() {
    this.program = new Command();
    this.apiUrl = process.env.QUALGEN_API_URL || 'http://localhost:8080';
    this.apiKey = process.env.QUALGEN_API_KEY || 'dev-key-12345';
    this.setupCommands();
  }

  setupCommands() {
    this.program
      .name('qgjob')
      .description('QualGen CLI - Submit and manage AppWright test jobs')
      .version('1.0.0');

    // Submit command
    this.program
      .command('submit')
      .description('Submit a new test job')
      .requiredOption('--org-id <orgId>', 'Organization ID')
      .requiredOption('--app-version-id <versionId>', 'App version identifier')
      .requiredOption('--test-path <path>', 'Path to test file or directory')
      .option('--priority <priority>', 'Job priority (low, medium, high)', 'medium')
      .option('--target <target>', 'Target environment (device, emulator, browserstack)', 'device')
      .option('--device-type <type>', 'Device type filter (phone, tablet)', 'phone')
      .option('--platform <platform>', 'Platform (android, ios)', 'android')
      .option('--timeout <seconds>', 'Test timeout in seconds', '300')
      .action(async (options) => {
        await this.submitJob(options);
      });

    // Status command
    this.program
      .command('status')
      .description('Check job status')
      .requiredOption('--job-id <jobId>', 'Job ID to check')
      .action(async (options) => {
        await this.checkStatus(options.jobId);
      });

    // List command
    this.program
      .command('list')
      .description('List jobs for organization')
      .requiredOption('--org-id <orgId>', 'Organization ID')
      .option('--status <status>', 'Filter by status (queued, running, completed, failed)')
      .option('--limit <limit>', 'Limit number of results', '10')
      .action(async (options) => {
        await this.listJobs(options);
      });

    // Wait command
    this.program
      .command('wait')
      .description('Wait for job completion')
      .requiredOption('--job-id <jobId>', 'Job ID to wait for')
      .option('--timeout <seconds>', 'Maximum wait time in seconds', '600')
      .action(async (options) => {
        await this.waitForCompletion(options);
      });

    // Cancel command
    this.program
      .command('cancel')
      .description('Cancel a job')
      .requiredOption('--job-id <jobId>', 'Job ID to cancel')
      .action(async (options) => {
        await this.cancelJob(options.jobId);
      });

    // Devices command
    this.program
      .command('devices')
      .description('List available devices')
      .option('--platform <platform>', 'Filter by platform (android, ios)')
      .option('--status <status>', 'Filter by status (available, busy, offline)')
      .action(async (options) => {
        await this.listDevices(options);
      });
  }

  async submitJob(options) {
    const spinner = ora('Submitting test job...').start();
    
    try {
      const jobPayload = {
        org_id: options.orgId,
        app_version_id: options.appVersionId,
        test_path: options.testPath,
        priority: options.priority,
        target: options.target,
        device_requirements: {
          platform: options.platform,
          device_type: options.deviceType
        },
        timeout: parseInt(options.timeout),
        metadata: {
          submitted_by: 'qgjob-cli',
          submitted_at: new Date().toISOString()
        }
      };

      const response = await this.apiRequest('POST', '/api/v1/jobs', jobPayload);
      
      spinner.succeed(chalk.green('✅ Job submitted successfully!'));
      
      console.log('\n' + chalk.bold('Job Details:'));
      console.log(`${chalk.cyan('Job ID:')} ${response.job_id}`);
      console.log(`${chalk.cyan('Status:')} ${response.status}`);
      console.log(`${chalk.cyan('Priority:')} ${response.priority}`);
      console.log(`${chalk.cyan('Target:')} ${response.target}`);
      console.log(`${chalk.cyan('Queue Position:')} ${response.queue_position || 'N/A'}`);
      
      if (response.estimated_start_time) {
        console.log(`${chalk.cyan('Estimated Start:')} ${new Date(response.estimated_start_time).toLocaleString()}`);
      }

      console.log(`\n${chalk.yellow('💡 Track progress:')} qgjob status --job-id ${response.job_id}`);
      console.log(`${chalk.yellow('💡 Wait for completion:')} qgjob wait --job-id ${response.job_id}`);

    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to submit job'));
      this.handleError(error);
    }
  }

  async checkStatus(jobId) {
    const spinner = ora('Fetching job status...').start();
    
    try {
      const job = await this.apiRequest('GET', `/api/v1/jobs/${jobId}`);
      
      spinner.succeed(chalk.green('✅ Job status retrieved'));
      
      console.log('\n' + chalk.bold('Job Status:'));
      console.log(`${chalk.cyan('Job ID:')} ${job.job_id}`);
      console.log(`${chalk.cyan('Status:')} ${this.formatStatus(job.status)}`);
      console.log(`${chalk.cyan('Progress:')} ${job.progress || 0}%`);
      console.log(`${chalk.cyan('Org ID:')} ${job.org_id}`);
      console.log(`${chalk.cyan('App Version:')} ${job.app_version_id}`);
      console.log(`${chalk.cyan('Test Path:')} ${job.test_path}`);
      console.log(`${chalk.cyan('Target:')} ${job.target}`);
      console.log(`${chalk.cyan('Priority:')} ${job.priority}`);
      
      if (job.device_id) {
        console.log(`${chalk.cyan('Device:')} ${job.device_id}`);
      }
      
      console.log(`${chalk.cyan('Created:')} ${new Date(job.created_at).toLocaleString()}`);
      
      if (job.started_at) {
        console.log(`${chalk.cyan('Started:')} ${new Date(job.started_at).toLocaleString()}`);
      }
      
      if (job.completed_at) {
        console.log(`${chalk.cyan('Completed:')} ${new Date(job.completed_at).toLocaleString()}`);
        console.log(`${chalk.cyan('Duration:')} ${this.formatDuration(job.started_at, job.completed_at)}`);
      }
      
      if (job.error_message) {
        console.log(`${chalk.red('Error:')} ${job.error_message}`);
      }
      
      if (job.test_results) {
        console.log('\n' + chalk.bold('Test Results:'));
        console.log(`${chalk.cyan('Tests Run:')} ${job.test_results.total}`);
        console.log(`${chalk.green('Passed:')} ${job.test_results.passed}`);
        console.log(`${chalk.red('Failed:')} ${job.test_results.failed}`);
        console.log(`${chalk.yellow('Skipped:')} ${job.test_results.skipped}`);
      }

    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to fetch job status'));
      this.handleError(error);
    }
  }

  async listJobs(options) {
    const spinner = ora('Fetching jobs...').start();
    
    try {
      const params = new URLSearchParams();
      params.append('org_id', options.orgId);
      if (options.status) params.append('status', options.status);
      params.append('limit', options.limit);
      
      const jobs = await this.apiRequest('GET', `/api/v1/jobs?${params}`);
      
      spinner.succeed(chalk.green(`✅ Found ${jobs.length} jobs`));
      
      if (jobs.length === 0) {
        console.log(chalk.yellow('No jobs found matching the criteria.'));
        return;
      }

      const table = new Table({
        head: ['Job ID', 'Status', 'App Version', 'Target', 'Priority', 'Created', 'Duration'].map(h => chalk.cyan(h)),
        style: { border: [], head: [] }
      });

      jobs.forEach(job => {
        const duration = job.completed_at 
          ? this.formatDuration(job.started_at, job.completed_at)
          : job.started_at 
            ? this.formatDuration(job.started_at, new Date().toISOString())
            : 'N/A';

        table.push([
          job.job_id.substring(0, 12) + '...',
          this.formatStatus(job.status),
          job.app_version_id,
          job.target,
          job.priority,
          new Date(job.created_at).toLocaleString(),
          duration
        ]);
      });

      console.log('\n' + table.toString());

    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to fetch jobs'));
      this.handleError(error);
    }
  }

  async waitForCompletion(options) {
    const jobId = options.jobId;
    const timeout = parseInt(options.timeout) * 1000; // Convert to milliseconds
    const startTime = Date.now();
    
    const spinner = ora(`Waiting for job ${jobId} to complete...`).start();
    
    try {
      while (Date.now() - startTime < timeout) {
        const job = await this.apiRequest('GET', `/api/v1/jobs/${jobId}`);
        
        if (job.status === 'completed') {
          spinner.succeed(chalk.green('✅ Job completed successfully!'));
          await this.checkStatus(jobId);
          process.exit(0);
        } else if (job.status === 'failed') {
          spinner.fail(chalk.red('❌ Job failed'));
          await this.checkStatus(jobId);
          process.exit(1);
        } else if (job.status === 'cancelled') {
          spinner.fail(chalk.yellow('⚠️ Job was cancelled'));
          await this.checkStatus(jobId);
          process.exit(1);
        }
        
        // Update spinner with current status
        spinner.text = `Waiting for job ${jobId} (${job.status}, ${job.progress || 0}%)...`;
        
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      }
      
      spinner.fail(chalk.red('❌ Timeout waiting for job completion'));
      process.exit(1);

    } catch (error) {
      spinner.fail(chalk.red('❌ Error waiting for job completion'));
      this.handleError(error);
    }
  }

  async cancelJob(jobId) {
    const spinner = ora(`Cancelling job ${jobId}...`).start();
    
    try {
      await this.apiRequest('POST', `/api/v1/jobs/${jobId}/cancel`);
      
      spinner.succeed(chalk.green('✅ Job cancelled successfully'));

    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to cancel job'));
      this.handleError(error);
    }
  }

  async listDevices(options) {
    const spinner = ora('Fetching device list...').start();
    
    try {
      const params = new URLSearchParams();
      if (options.platform) params.append('platform', options.platform);
      if (options.status) params.append('status', options.status);
      
      const devices = await this.apiRequest('GET', `/api/v1/devices?${params}`);
      
      spinner.succeed(chalk.green(`✅ Found ${devices.length} devices`));
      
      if (devices.length === 0) {
        console.log(chalk.yellow('No devices found matching the criteria.'));
        return;
      }

      const table = new Table({
        head: ['Device ID', 'Name', 'Platform', 'Status', 'Type', 'Location', 'Current Job'].map(h => chalk.cyan(h)),
        style: { border: [], head: [] }
      });

      devices.forEach(device => {
        table.push([
          device.device_id,
          device.name,
          device.platform,
          this.formatDeviceStatus(device.status),
          device.device_type,
          device.location || 'Local',
          device.current_job_id || 'None'
        ]);
      });

      console.log('\n' + table.toString());

    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to fetch devices'));
      this.handleError(error);
    }
  }

  async apiRequest(method, path, data = null) {
    try {
      const config = {
        method,
        url: `${this.apiUrl}${path}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;

    } catch (error) {
      if (error.response) {
        throw new Error(`API Error: ${error.response.status} - ${error.response.data.message || error.response.statusText}`);
      } else if (error.request) {
        throw new Error(`Network Error: Unable to connect to ${this.apiUrl}`);
      } else {
        throw new Error(`Request Error: ${error.message}`);
      }
    }
  }

  formatStatus(status) {
    const statusColors = {
      'queued': chalk.yellow,
      'running': chalk.blue,
      'completed': chalk.green,
      'failed': chalk.red,
      'cancelled': chalk.gray
    };
    
    return (statusColors[status] || chalk.white)(status.toUpperCase());
  }

  formatDeviceStatus(status) {
    const statusColors = {
      'available': chalk.green,
      'busy': chalk.yellow,
      'offline': chalk.red,
      'maintenance': chalk.gray
    };
    
    return (statusColors[status] || chalk.white)(status.toUpperCase());
  }

  formatDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = Math.round((end - start) / 1000); // seconds
    
    if (duration < 60) {
      return `${duration}s`;
    } else if (duration < 3600) {
      return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    } else {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  handleError(error) {
    console.error('\n' + chalk.red('Error:'), error.message);
    
    if (error.message.includes('Network Error')) {
      console.log(chalk.yellow('\n💡 Tips:'));
      console.log(`• Check if the job server is running: ${this.apiUrl}`);
      console.log('• Verify QUALGEN_API_URL environment variable');
      console.log('• Ensure network connectivity');
    } else if (error.message.includes('401')) {
      console.log(chalk.yellow('\n💡 Authentication issue:'));
      console.log('• Check QUALGEN_API_KEY environment variable');
      console.log('• Verify API key is valid');
    }
    
    process.exit(1);
  }

  run() {
    this.program.parse();
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  const cli = new QualGenCLI();
  cli.run();
}

module.exports = QualGenCLI;
