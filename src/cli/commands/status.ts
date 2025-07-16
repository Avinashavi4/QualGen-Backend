import axios from 'axios';
import chalk from 'chalk';
import { StatusCheckCLIOptions } from '../../shared/types';

export async function checkStatus(options: StatusCheckCLIOptions): Promise<void> {
  try {
    const response = await axios.get(`${options.serverUrl}/api/jobs/${options.jobId}`);
    const job = response.data; // Fix: job data is directly in response.data, not response.data.job

    console.log(chalk.green('\n📋 Job Status:'));
    console.log(`  Job ID: ${chalk.cyan(job.id)}`);
    console.log(`  Status: ${getStatusColor(job.status)}`);
    console.log(`  Organization: ${chalk.cyan(job.org_id)}`);
    console.log(`  App Version: ${chalk.cyan(job.app_version_id)}`);
    console.log(`  Test Path: ${chalk.cyan(job.test_path)}`);
    console.log(`  Priority: ${chalk.cyan(job.priority)}`);
    console.log(`  Target: ${chalk.cyan(job.target)}`);
    console.log(`  Created: ${chalk.cyan(new Date(job.created_at).toLocaleString())}`);
    
    if (job.started_at) {
      console.log(`  Started: ${chalk.cyan(new Date(job.started_at).toLocaleString())}`);
    }
    
    if (job.completed_at) {
      console.log(`  Completed: ${chalk.cyan(new Date(job.completed_at).toLocaleString())}`);
    }
    
    if (job.assigned_agent) {
      console.log(`  Agent: ${chalk.cyan(job.assigned_agent)}`);
    }
    
    if (job.retry_count > 0) {
      console.log(`  Retries: ${chalk.yellow(job.retry_count)}`);
    }
    
    if (job.error_message) {
      console.log(`  Error: ${chalk.red(job.error_message)}`);
    }
    
    if (job.result) {
      console.log(chalk.green('\n📊 Test Results:'));
      console.log(`  Tests Run: ${chalk.cyan(job.result.tests_run || 'N/A')}`);
      console.log(`  Tests Passed: ${chalk.green(job.result.tests_passed || 'N/A')}`);
      console.log(`  Tests Failed: ${chalk.red(job.result.tests_failed || 'N/A')}`);
      console.log(`  Duration: ${chalk.cyan(job.result.duration_ms ? `${job.result.duration_ms}ms` : 'N/A')}`);
    }

  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      console.error(chalk.red('Job not found'));
    } else if (error.response) {
      console.error(chalk.red(`Server error: ${error.response.data.error || error.response.statusText}`));
    } else if (error.request) {
      console.error(chalk.red('No response from server. Is the server running?'));
    } else {
      console.error(chalk.red(`Error: ${error.message}`));
    }
    throw error;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return chalk.yellow(status);
    case 'queued':
      return chalk.blue(status);
    case 'running':
      return chalk.cyan(status);
    case 'completed':
      return chalk.green(status);
    case 'failed':
      return chalk.red(status);
    case 'cancelled':
      return chalk.gray(status);
    default:
      return chalk.white(status);
  }
}
