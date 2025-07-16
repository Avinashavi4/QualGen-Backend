#!/usr/bin/env node

import { Command } from 'commander';
import { submitJob } from './commands/submit';
import { checkStatus } from './commands/status';
import { listJobs } from './commands/list';
import { cancelJob } from './commands/cancel';
import { log } from '../shared/logger';

const program = new Command();

program
  .name('qgjob')
  .description('QualGen Job Orchestrator CLI')
  .version('1.0.0');

// Submit job command
program
  .command('submit')
  .description('Submit a new test job')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .requiredOption('--app-version-id <appVersionId>', 'Application version ID')
  .requiredOption('--test-path <testPath>', 'Path to test file or directory')
  .requiredOption('--priority <priority>', 'Job priority (1-10)', parseInt)
  .requiredOption('--target <target>', 'Target environment (emulator|device|browserstack)')
  .option('--server-url <url>', 'Job server URL', process.env.QGJOB_SERVER_URL || 'http://localhost:3000')
  .option('--wait', 'Wait for job completion')
  .option('--timeout <seconds>', 'Timeout in seconds for --wait', '300')
  .option('--metadata <json>', 'Additional job metadata as JSON string')
  .action(async (options) => {
    try {
      await submitJob(options);
    } catch (error) {
      log.error('Submit command failed', { error });
      process.exit(1);
    }
  });

// Status check command
program
  .command('status')
  .description('Check job status')
  .requiredOption('--job-id <jobId>', 'Job ID to check')
  .option('--server-url <url>', 'Job server URL', process.env.QGJOB_SERVER_URL || 'http://localhost:3000')
  .option('--watch', 'Watch job status until completion')
  .option('--interval <seconds>', 'Watch interval in seconds', '5')
  .action(async (options) => {
    try {
      await checkStatus(options);
    } catch (error) {
      log.error('Status command failed', { error });
      process.exit(1);
    }
  });

// List jobs command
program
  .command('list')
  .description('List jobs')
  .option('--org-id <orgId>', 'Filter by organization ID')
  .option('--status <status>', 'Filter by job status')
  .option('--limit <number>', 'Maximum number of jobs to return', '50')
  .option('--offset <number>', 'Number of jobs to skip', '0')
  .option('--server-url <url>', 'Job server URL', process.env.QGJOB_SERVER_URL || 'http://localhost:3000')
  .action(async (options) => {
    try {
      await listJobs(options);
    } catch (error) {
      log.error('List command failed', { error });
      process.exit(1);
    }
  });

// Cancel job command
program
  .command('cancel')
  .description('Cancel a job')
  .requiredOption('--job-id <jobId>', 'Job ID to cancel')
  .option('--reason <reason>', 'Cancellation reason')
  .option('--server-url <url>', 'Job server URL', process.env.QGJOB_SERVER_URL || 'http://localhost:3000')
  .action(async (options) => {
    try {
      await cancelJob(options);
    } catch (error) {
      log.error('Cancel command failed', { error });
      process.exit(1);
    }
  });

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception', { error });
  process.exit(1);
});

// Parse arguments and execute
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
