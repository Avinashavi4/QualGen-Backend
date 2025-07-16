import axios from 'axios';
import chalk from 'chalk';
import { ListJobsCLIOptions } from '../../shared/types';

export async function listJobs(options: ListJobsCLIOptions): Promise<void> {
  try {
    // Build query parameters
    const params = new URLSearchParams();
    if (options.orgId) params.append('org_id', options.orgId);
    if (options.status) params.append('status', options.status);
    if (options.limit) params.append('limit', options.limit);
    if (options.offset) params.append('offset', options.offset);

    const url = `${options.serverUrl}/api/jobs?${params.toString()}`;
    const response = await axios.get(url);
    const { jobs, total, limit, offset } = response.data;

    console.log(chalk.blue('\n📋 Job List:'));
    console.log(`Showing ${jobs.length} of ${total} jobs (offset: ${offset}, limit: ${limit})\n`);

    if (jobs.length === 0) {
      console.log(chalk.yellow('No jobs found matching your criteria.'));
      return;
    }

    // Display jobs in a table format
    jobs.forEach((job: any, index: number) => {
      const statusColor = getStatusColor(job.status);
      const priorityColor = job.priority >= 8 ? chalk.red : job.priority >= 5 ? chalk.yellow : chalk.gray;
      
      console.log(`${chalk.cyan((offset + index + 1).toString().padStart(3))}. ${chalk.bold(job.id)}`);
      console.log(`     Status: ${statusColor} | Priority: ${priorityColor(job.priority)} | Target: ${chalk.magenta(job.target)}`);
      console.log(`     Org: ${chalk.cyan(job.org_id)} | App: ${chalk.cyan(job.app_version_id)}`);
      console.log(`     Test: ${chalk.gray(job.test_path)}`);
      console.log(`     Created: ${chalk.gray(new Date(job.created_at).toLocaleString())}`);
      
      if (job.assigned_agent) {
        console.log(`     Agent: ${chalk.green(job.assigned_agent)}`);
      }
      
      console.log(); // Empty line between jobs
    });

    // Show pagination info
    if (total > limit) {
      const currentPage = Math.floor(offset / limit) + 1;
      const totalPages = Math.ceil(total / limit);
      console.log(chalk.gray(`Page ${currentPage} of ${totalPages}`));
      
      if (offset + limit < total) {
        const nextOffset = offset + limit;
        console.log(chalk.blue(`💡 Next page: qgjob list --offset ${nextOffset} --limit ${limit}`));
      }
    }

  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log(chalk.red('❌ Server not found. Please check if the server is running.'));
    } else {
      console.log(chalk.red('❌ Failed to fetch jobs'));
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
