import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import { SubmitJobCLIOptions, JobPayload } from '../../shared/types';

export async function submitJob(options: SubmitJobCLIOptions): Promise<void> {
  const spinner = ora('Submitting job...').start();

  try {
    // Parse metadata if provided
    let metadata = {};
    if (options.metadata) {
      try {
        metadata = JSON.parse(options.metadata);
      } catch (error) {
        spinner.fail('Invalid metadata JSON format');
        return;
      }
    }

    const jobPayload: JobPayload = {
      org_id: options.orgId,
      app_version_id: options.appVersionId,
      test_path: options.testPath,
      priority: options.priority,
      target: options.target,
      metadata
    };

    const serverUrl = options.serverUrl || 'http://localhost:3000';
    const response = await axios.post(`${serverUrl}/api/jobs`, jobPayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const job = response.data;
    const jobIds = [job.id];

    spinner.succeed('Job submitted successfully!');

    // Display job information
    console.log(chalk.green('✨ Job Details:'));
    console.log(`  Job ID: ${chalk.cyan(job.id)}`);
    console.log(`  Status: ${chalk.yellow(job.status)}`);
    console.log(`  Organization: ${chalk.cyan(options.orgId)}`);
    console.log(`  App Version: ${chalk.cyan(options.appVersionId)}`);
    console.log(`  Test Path: ${chalk.cyan(options.testPath)}`);
    console.log(`  Priority: ${chalk.cyan(options.priority)}`);
    console.log(`  Target: ${chalk.cyan(options.target)}`);

    // Wait for completion if requested
    if (options.wait) {
      console.log(chalk.yellow('\n⏳ Waiting for job completion...'));
      const timeoutMs = options.timeout ? parseInt(options.timeout) * 1000 : 300000;
      await waitForCompletion(jobIds[0], options.serverUrl || 'http://localhost:3000', timeoutMs);
    } else {
      console.log(chalk.blue(`\n💡 Check status with: qgjob status --job-id ${jobIds[0]}`));
    }

  } catch (error: any) {
    spinner.fail('Failed to submit job');
    
    if (error.response) {
      console.error(chalk.red(`Error: ${error.response.data.error || error.response.statusText}`));
    } else if (error.request) {
      console.error(chalk.red('Error: Cannot connect to server. Please check if the server is running.'));
    } else {
      console.error(chalk.red(`Error: ${error.message}`));
    }
    
    process.exit(1);
  }
}

async function waitForCompletion(jobId: string, serverUrl: string, timeout: number): Promise<void> {
  const pollInterval = 2000; // 2 seconds
  const startTime = Date.now();
  
  const spinner = ora('Waiting for job to complete...').start();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await axios.get(`${serverUrl}/api/jobs/${jobId}`);
      const job = response.data.job;

      if (job.status === 'completed') {
        spinner.succeed('Job completed successfully!');
        
        if (job.result) {
          console.log(chalk.green('\n📊 Results:'));
          console.log(`  Tests Run: ${chalk.cyan(job.result.tests_run)}`);
          console.log(`  Tests Passed: ${chalk.green(job.result.tests_passed)}`);
          console.log(`  Tests Failed: ${chalk.red(job.result.tests_failed)}`);
          console.log(`  Duration: ${chalk.cyan(job.result.duration_ms)}ms`);
          
          if (job.result.artifacts && job.result.artifacts.length > 0) {
            console.log(`  Artifacts: ${chalk.cyan(job.result.artifacts.join(', '))}`);
          }
        }
        
        return;
      } else if (job.status === 'failed') {
        spinner.fail('Job failed');
        
        if (job.error_message) {
          console.error(chalk.red(`Error: ${job.error_message}`));
        }
        
        process.exit(1);
      } else if (job.status === 'cancelled') {
        spinner.warn('Job was cancelled');
        return;
      }

      // Update spinner text with current status
      spinner.text = `Job status: ${job.status}`;

    } catch (error) {
      spinner.fail('Error checking job status');
      console.error(chalk.red('Failed to check job status'));
      process.exit(1);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  spinner.warn('Timeout waiting for job completion');
  console.log(chalk.yellow(`Job is still running. Check status with: qgjob status --job-id ${jobId}`));
}
