import { Database } from '../database/database';
import { RedisClient } from './redis';
import { Job, JobGroup, JobStatus, GroupStatus } from '../../shared/types';
import { log } from '../../shared/logger';
import { generateGroupId, calculatePriorityScore, isAgentCompatible } from '../../shared/utils';

export class JobScheduler {
  private database: Database;
  private redis: RedisClient;
  private isRunning: boolean = false;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor(database: Database, redis: RedisClient) {
    this.database = database;
    this.redis = redis;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('Job scheduler is already running');
      return;
    }

    this.isRunning = true;
    log.info('Starting job scheduler...');

    // Start the scheduling loop
    this.schedulerInterval = setInterval(async () => {
      try {
        await this.scheduleJobs();
      } catch (error) {
        log.error('Error in scheduler loop', { error });
      }
    }, 5000); // Run every 5 seconds

    // Initial schedule
    await this.scheduleJobs();

    log.info('Job scheduler started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }

    log.info('Job scheduler stopped');
  }

  private async scheduleJobs(): Promise<void> {
    try {
      // Get pending jobs
      const { jobs: pendingJobs } = await this.database.listJobs({
        status: 'pending',
        limit: 100
      });

      if (pendingJobs.length === 0) {
        return;
      }

      log.debug(`Found ${pendingJobs.length} pending jobs to schedule`);

      // Group jobs by app_version_id and target
      const jobGroups = this.groupJobsByAppVersionAndTarget(pendingJobs);

      // Process each group
      for (const [groupKey, groupJobs] of jobGroups) {
        await this.processJobGroup(groupJobs);
      }

    } catch (error) {
      log.error('Error scheduling jobs', { error });
    }
  }

  private groupJobsByAppVersionAndTarget(jobs: Job[]): Map<string, Job[]> {
    const groups = new Map<string, Job[]>();

    for (const job of jobs) {
      const groupKey = `${job.org_id}:${job.app_version_id}:${job.target}`;
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      
      groups.get(groupKey)!.push(job);
    }

    return groups;
  }

  private async processJobGroup(jobs: Job[]): Promise<void> {
    if (jobs.length === 0) return;

    const firstJob = jobs[0];
    if (!firstJob) return;
    
    const groupKey = `${firstJob.org_id}:${firstJob.app_version_id}:${firstJob.target}`;

    try {
      // Check if we already have a job group for this combination
      const existingGroupId = await this.redis.get(`group:${groupKey}`);
      
      if (existingGroupId) {
        // Add jobs to existing group
        await this.addJobsToExistingGroup(existingGroupId, jobs);
      } else {
        // Create new job group
        await this.createNewJobGroup(groupKey, jobs);
      }

    } catch (error) {
      log.error('Error processing job group', { error, groupKey });
    }
  }

  private async createNewJobGroup(groupKey: string, jobs: Job[]): Promise<void> {
    const firstJob = jobs[0];
    if (!firstJob) return;
    
    const groupId = generateGroupId();

    try {
      // Create job group in database
      const jobGroup: Omit<JobGroup, 'created_at' | 'jobs'> = {
        id: groupId,
        org_id: firstJob.org_id,
        app_version_id: firstJob.app_version_id,
        target: firstJob.target,
        status: GroupStatus.PENDING
      };

      await this.database.createJobGroup(jobGroup);

      // Store group mapping in Redis
      await this.redis.set(`group:${groupKey}`, groupId, 3600); // 1 hour TTL

      // Add group to scheduling queue
      await this.addGroupToSchedulingQueue(groupId, jobs);

      // Update job statuses to queued
      for (const job of jobs) {
        await this.database.updateJob(job.id, { status: 'queued' });
      }

      log.info('Created new job group', { 
        groupId, 
        groupKey, 
        jobCount: jobs.length 
      });

    } catch (error) {
      log.error('Error creating job group', { error, groupKey });
    }
  }

  private async addJobsToExistingGroup(groupId: string, jobs: Job[]): Promise<void> {
    try {
      // Update job statuses to queued
      for (const job of jobs) {
        await this.database.updateJob(job.id, { status: 'queued' });
      }

      log.info('Added jobs to existing group', { 
        groupId, 
        jobCount: jobs.length 
      });

    } catch (error) {
      log.error('Error adding jobs to existing group', { error, groupId });
    }
  }

  private async addGroupToSchedulingQueue(groupId: string, jobs: Job[]): Promise<void> {
    // Calculate group priority based on job priorities and organization priority
    const groupPriority = this.calculateGroupPriority(jobs);

    // Add to priority queue for scheduling
    const firstJobAgain = jobs[0];
    if (!firstJobAgain) return;

    await this.redis.addToPriorityQueue('groups:scheduling', {
      groupId,
      appVersionId: firstJobAgain.app_version_id,
      target: firstJobAgain.target,
      jobCount: jobs.length,
      priority: groupPriority,
      createdAt: new Date().toISOString()
    }, groupPriority);

    log.debug('Added group to scheduling queue', { 
      groupId, 
      priority: groupPriority 
    });
  }

  private calculateGroupPriority(jobs: Job[]): number {
    // Calculate average priority with time-based boost
    const avgPriority = jobs.reduce((sum, job) => sum + job.priority, 0) / jobs.length;
    const oldestJob = jobs.reduce((oldest, job) => 
      job.created_at < oldest.created_at ? job : oldest
    );
    
    return calculatePriorityScore(avgPriority, oldestJob.created_at);
  }

  async assignGroupToAgent(groupId: string): Promise<boolean> {
    try {
      const group = await this.database.getJobGroup(groupId);
      if (!group) {
        log.warn('Group not found for assignment', { groupId });
        return false;
      }

      // Find available agents that can handle this target
      const availableAgents = await this.database.getAvailableAgents(group.target);
      
      if (availableAgents.length === 0) {
        log.debug('No available agents for group', { groupId, target: group.target });
        return false;
      }

      // Select best agent (least loaded with compatible capabilities)
      const bestAgent = availableAgents
        .filter(agent => isAgentCompatible(agent.capabilities, group.target))
        .sort((a, b) => a.current_jobs.length - b.current_jobs.length)[0];

      if (!bestAgent) {
        log.debug('No compatible agents for group', { groupId, target: group.target });
        return false;
      }

      // Assign group to agent
      await this.database.updateAgent(bestAgent.id, {
        current_jobs: [...bestAgent.current_jobs, groupId]
      });

      // Update group status
      await this.database.query(
        'UPDATE job_groups SET status = $1, assigned_agent = $2, started_at = NOW() WHERE id = $3',
        [GroupStatus.ASSIGNED, bestAgent.id, groupId]
      );

      // Add to agent's work queue
      await this.redis.pushToQueue(`agent:${bestAgent.id}:work`, {
        groupId,
        type: 'job_group',
        assignedAt: new Date().toISOString()
      });

      log.info('Assigned group to agent', { 
        groupId, 
        agentId: bestAgent.id,
        target: group.target
      });

      return true;

    } catch (error) {
      log.error('Error assigning group to agent', { error, groupId });
      return false;
    }
  }

  async getSchedulingStats(): Promise<{
    pendingJobs: number;
    queuedJobs: number;
    runningJobs: number;
    pendingGroups: number;
    runningGroups: number;
  }> {
    try {
      const [
        pendingJobsResult,
        queuedJobsResult,
        runningJobsResult
      ] = await Promise.all([
        this.database.listJobs({ status: 'pending', limit: 0 }),
        this.database.listJobs({ status: 'queued', limit: 0 }),
        this.database.listJobs({ status: 'running', limit: 0 })
      ]);

      const pendingGroups = await this.redis.getPriorityQueueLength('groups:scheduling');
      const runningGroups = await this.redis.getQueueLength('groups:running');

      return {
        pendingJobs: pendingJobsResult.total,
        queuedJobs: queuedJobsResult.total,
        runningJobs: runningJobsResult.total,
        pendingGroups,
        runningGroups
      };

    } catch (error) {
      log.error('Error getting scheduling stats', { error });
      return {
        pendingJobs: 0,
        queuedJobs: 0,
        runningJobs: 0,
        pendingGroups: 0,
        runningGroups: 0
      };
    }
  }
}
