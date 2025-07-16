import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import { CancelJobCLIOptions } from '../../shared/types';

export async function cancelJob(options: CancelJobCLIOptions): Promise<void> {
  const spinner = ora(`Cancelling job ${options.jobId}...`).start();

  try {
    // First, check if the job exists and get its current status
    const statusResponse = await axios.get(`${options.serverUrl}/api/jobs/${options.jobId}`);
    const job = statusResponse.data;

    if (job.status === 'completed') {
      spinner.fail();
      console.log(chalk.yellow('⚠️  Job has already completed and cannot be cancelled.'));
      return;
    }

    if (job.status === 'cancelled') {
      spinner.succeed();
      console.log(chalk.blue('ℹ️  Job is already cancelled.'));
      return;
    }

    // Cancel the job
    const cancelData: any = {};
    if (options.reason) {
      cancelData.reason = options.reason;
    }

    await axios.delete(`${options.serverUrl}/api/jobs/${options.jobId}`, {
      data: cancelData
    });

    spinner.succeed();
    console.log(chalk.green('✅ Job cancelled successfully!'));
    
    console.log(chalk.blue('\n📋 Cancellation Details:'));
    console.log(`  Job ID: ${chalk.cyan(options.jobId)}`);
    console.log(`  Previous Status: ${getStatusColor(job.status)}`);
    console.log(`  Organization: ${chalk.cyan(job.org_id)}`);
    console.log(`  App Version: ${chalk.cyan(job.app_version_id)}`);
    console.log(`  Test Path: ${chalk.cyan(job.test_path)}`);
    
    if (options.reason) {
      console.log(`  Reason: ${chalk.yellow(options.reason)}`);
    }
    
    console.log(`  Cancelled At: ${chalk.cyan(new Date().toLocaleString())}`);

  } catch (error: any) {
    spinner.fail();
    
    if (error.response?.status === 404) {
      console.log(chalk.red(`❌ Job with ID '${options.jobId}' not found.`));
      console.log(chalk.gray('💡 Use "qgjob list" to see available jobs.'));
    } else if (error.response?.status >= 500) {
      console.log(chalk.red('❌ Server error occurred while cancelling job.'));
      console.log(chalk.gray('Please try again later or contact support.'));
    } else {
      console.log(chalk.red('❌ Failed to cancel job'));
      console.log(chalk.red(`Error: ${error.message}`));
    }
    
    process.exit(1);
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return chalk.yellow('pending');
    case 'running':
      return chalk.blue('running');
    case 'completed':
      return chalk.green('completed');
    case 'failed':
      return chalk.red('failed');
    case 'cancelled':
      return chalk.gray('cancelled');
    default:
      return chalk.white(status);
  }
}
