import { Database } from '../database/database';
import { RedisClient } from './redis';
import { JobScheduler } from './scheduler';
import { Job, JobStatus } from '../../shared/types';
import { log } from '../../shared/logger';
import { sleep, retry } from '../../shared/utils';

export class JobProcessor {
  private database: Database;
  private redis: RedisClient;
  private scheduler: JobScheduler;
  private isRunning: boolean = false;
  private processorInterval: any = null;

  constructor(database: Database, redis: RedisClient) {
    this.database = database;
    this.redis = redis;
    this.scheduler = new JobScheduler(database, redis);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('Job processor is already running');
      return;
    }

    this.isRunning = true;
    log.info('Starting job processor...');

    // Start the processing loop
    this.processorInterval = setInterval(async () => {
      try {
        await this.processSchedulingQueue();
      } catch (error) {
        log.error('Error in processor loop', { error });
      }
    }, 2000); // Run every 2 seconds

    // Start monitoring failed jobs for retry
    this.startRetryMonitor();

    log.info('Job processor started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.processorInterval) {
      clearInterval(this.processorInterval);
      this.processorInterval = null;
    }

    log.info('Job processor stopped');
  }

  private async processSchedulingQueue(): Promise<void> {
    try {
      // Process groups waiting for assignment
      const groupToAssign = await this.redis.popFromPriorityQueue('groups:scheduling');
      
      if (groupToAssign) {
        const assigned = await this.scheduler.assignGroupToAgent(groupToAssign.groupId);
        
        if (!assigned) {
          // Put back in queue with slightly lower priority for retry
          await this.redis.addToPriorityQueue('groups:scheduling', groupToAssign, groupToAssign.priority - 0.1);
        }
      }

    } catch (error) {
      log.error('Error processing scheduling queue', { error });
    }
  }

  private startRetryMonitor(): void {
    const retryInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(retryInterval);
        return;
      }

      try {
        await this.processFailedJobs();
      } catch (error) {
        log.error('Error in retry monitor', { error });
      }
    }, 30000); // Run every 30 seconds
  }

  private async processFailedJobs(): Promise<void> {
    try {
      const { jobs: failedJobs } = await this.database.listJobs({
        status: 'failed',
        limit: 50
      });

      for (const job of failedJobs) {
        await this.retryJobIfEligible(job);
      }

    } catch (error) {
      log.error('Error processing failed jobs', { error });
    }
  }

  private async retryJobIfEligible(job: Job): Promise<void> {
    const maxRetries = 3;
    const retryDelayMs = 60000; // 1 minute

    if (job.retry_count >= maxRetries) {
      log.debug('Job exceeded max retries', { jobId: job.id, retryCount: job.retry_count });
      return;
    }

    // Check if enough time has passed since last failure
    const timeSinceUpdate = Date.now() - job.updated_at.getTime();
    if (timeSinceUpdate < retryDelayMs) {
      return;
    }

    try {
      await this.database.updateJob(job.id, {
        status: 'pending',
        retry_count: job.retry_count + 1,
        error_message: null
      });

      log.info('Retrying failed job', { 
        jobId: job.id, 
        retryCount: job.retry_count + 1 
      });

    } catch (error) {
      log.error('Error retrying job', { error, jobId: job.id });
    }
  }

  async processJobResult(jobId: string, result: {
    success: boolean;
    tests_run: number;
    tests_passed: number;
    tests_failed: number;
    duration_ms: number;
    artifacts?: string[];
    logs?: string;
    error?: string;
  }): Promise<void> {
    try {
      const job = await this.database.getJob(jobId);
      if (!job) {
        log.warn('Job not found for result processing', { jobId });
        return;
      }

      const status = result.success ? JobStatus.COMPLETED : JobStatus.FAILED;
      
      await this.database.updateJob(jobId, {
        status,
        completed_at: new Date(),
        result: {
          success: result.success,
          tests_run: result.tests_run,
          tests_passed: result.tests_passed,
          tests_failed: result.tests_failed,
          duration_ms: result.duration_ms,
          artifacts: result.artifacts,
          logs: result.logs
        },
        error_message: result.error || null
      });

      // Publish job completion event
      await this.redis.publish('job:completed', {
        jobId,
        status,
        result: result.success,
        duration: result.duration_ms
      });

      log.info('Processed job result', { 
        jobId, 
        status, 
        success: result.success,
        duration: result.duration_ms
      });

    } catch (error) {
      log.error('Error processing job result', { error, jobId });
    }
  }

  async handleAgentHeartbeat(agentId: string, status: string, currentJobs: string[]): Promise<void> {
    try {
      await this.database.updateAgent(agentId, {
        status,
        current_jobs: currentJobs,
        last_heartbeat: new Date()
      });

      // Check for stale jobs and clean them up
      await this.cleanupStaleJobs(agentId, currentJobs);

    } catch (error) {
      log.error('Error handling agent heartbeat', { error, agentId });
    }
  }

  private async cleanupStaleJobs(agentId: string, currentJobs: string[]): Promise<void> {
    try {
      // Get all jobs assigned to this agent
      const { jobs: assignedJobs } = await this.database.listJobs({ limit: 1000 });
      const agentJobs = assignedJobs.filter(job => job.assigned_agent === agentId);

      for (const job of agentJobs) {
        // If job is running but not in agent's current jobs, mark as failed
        if (job.status === JobStatus.RUNNING && !currentJobs.includes(job.id)) {
          await this.database.updateJob(job.id, {
            status: JobStatus.FAILED,
            error_message: 'Job lost connection with agent',
            completed_at: new Date()
          });

          log.warn('Marked orphaned job as failed', { 
            jobId: job.id, 
            agentId 
          });
        }
      }

    } catch (error) {
      log.error('Error cleaning up stale jobs', { error, agentId });
    }
  }

  async getProcessingStats(): Promise<{
    queueLength: number;
    processingRate: number;
    averageProcessingTime: number;
    errorRate: number;
  }> {
    try {
      const queueLength = await this.redis.getPriorityQueueLength('groups:scheduling');
      
      // Get recent job statistics
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentJobs = await this.database.query(
        'SELECT status, completed_at - started_at as duration FROM jobs WHERE created_at > $1',
        [oneHourAgo]
      );

      const completedJobs = recentJobs.rows.filter((job: any) => job.status === 'completed');
      const failedJobs = recentJobs.rows.filter((job: any) => job.status === 'failed');
      
      const processingRate = completedJobs.length; // jobs per hour
      const averageProcessingTime = completedJobs.length > 0 
        ? completedJobs.reduce((sum: number, job: any) => sum + (job.duration || 0), 0) / completedJobs.length
        : 0;
      const errorRate = recentJobs.rows.length > 0 
        ? (failedJobs.length / recentJobs.rows.length) * 100
        : 0;

      return {
        queueLength,
        processingRate,
        averageProcessingTime,
        errorRate
      };

    } catch (error) {
      log.error('Error getting processing stats', { error });
      return {
        queueLength: 0,
        processingRate: 0,
        averageProcessingTime: 0,
        errorRate: 0
      };
    }
  }

  async cancelJob(jobId: string, reason?: string): Promise<boolean> {
    try {
      const job = await this.database.getJob(jobId);
      if (!job) {
        return false;
      }

      if ([JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED].includes(job.status)) {
        return false; // Cannot cancel already finished jobs
      }

      await this.database.updateJob(jobId, {
        status: JobStatus.CANCELLED,
        error_message: reason || 'Job cancelled by user',
        completed_at: new Date()
      });

      // Notify agent if job is running
      if (job.status === JobStatus.RUNNING && job.assigned_agent) {
        await this.redis.publish(`agent:${job.assigned_agent}:cancel`, {
          jobId,
          reason: reason || 'Job cancelled by user'
        });
      }

      log.info('Cancelled job', { jobId, reason });
      return true;

    } catch (error) {
      log.error('Error cancelling job', { error, jobId });
      return false;
    }
  }
}
