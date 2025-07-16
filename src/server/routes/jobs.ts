import { Router, Request, Response } from 'express';
import { Database } from '../database/database';
import { RedisClient } from '../services/redis';
import { JobScheduler } from '../services/scheduler';
import { 
  SubmitJobRequest, 
  SubmitJobResponse, 
  JobStatusResponse, 
  ListJobsRequest, 
  ListJobsResponse,
  Job,
  JobStatus,
  ValidationError,
  NotFoundError
} from '../../shared/types';
import { generateJobId, validateJobPayload } from '../../shared/utils';
import { log } from '../../shared/logger';

export function jobRoutes(
  database: Database, 
  redis: RedisClient, 
  scheduler: JobScheduler
): Router {
  const router = Router();

  // Submit new job(s)
  router.post('/', async (req: Request, res: Response) => {
    try {
      const submitRequest: SubmitJobRequest = req.body;
      
      if (!submitRequest.jobs) {
        throw new ValidationError('Jobs payload is required');
      }

      const jobsArray = Array.isArray(submitRequest.jobs) 
        ? submitRequest.jobs 
        : [submitRequest.jobs];

      const createdJobs: Job[] = [];
      const jobIds: string[] = [];

      for (const jobPayload of jobsArray) {
        // Validate job payload
        const validationErrors = validateJobPayload(jobPayload);
        if (validationErrors.length > 0) {
          throw new ValidationError(`Invalid job payload: ${validationErrors.join(', ')}`);
        }

        // Create job
        const jobId = generateJobId();
        const job: Omit<Job, 'created_at' | 'updated_at'> = {
          id: jobId,
          org_id: jobPayload.org_id,
          app_version_id: jobPayload.app_version_id,
          test_path: jobPayload.test_path,
          priority: jobPayload.priority,
          target: jobPayload.target,
          status: JobStatus.PENDING,
          retry_count: 0,
          metadata: jobPayload.metadata || {}
        };

        const createdJob = await database.createJob(job);
        createdJobs.push(createdJob);
        jobIds.push(jobId);

        log.info('Job submitted', { 
          jobId, 
          orgId: jobPayload.org_id,
          appVersionId: jobPayload.app_version_id,
          target: jobPayload.target
        });
      }

      const response: SubmitJobResponse = {
        job_ids: jobIds,
        message: `Successfully submitted ${jobIds.length} job(s)`
      };

      return res.status(201).json(response);

    } catch (error) {
      log.error('Error submitting jobs', { error });
      
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      } else {
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Get job status
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
      }

      const job = await database.getJob(jobId);

      if (!job) {
        throw new NotFoundError('Job');
      }

      const response: JobStatusResponse = { job };
      return res.json(response);

    } catch (error) {
      log.error('Error getting job status', { error, jobId: req.params.id });
      
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: error.message });
      } else {
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // List jobs with filters
  router.get('/', async (req: Request, res: Response) => {
    try {
      const filters: ListJobsRequest = {
        org_id: req.query.org_id as string,
        status: req.query.status as JobStatus,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      const { jobs, total } = await database.listJobs(filters);
      const hasMore = (filters.offset || 0) + jobs.length < total;

      const response: ListJobsResponse = {
        jobs,
        total,
        has_more: hasMore
      };

      return res.json(response);

    } catch (error) {
      log.error('Error listing jobs', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update job status (for agents)
  router.put('/:id/status', async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
      }

      const { status, error_message, result } = req.body;

      if (!Object.values(JobStatus).includes(status)) {
        throw new ValidationError('Invalid job status');
      }

      const updateData: any = { status };

      if (status === JobStatus.RUNNING) {
        updateData.started_at = new Date();
      } else if ([JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED].includes(status)) {
        updateData.completed_at = new Date();
      }

      if (error_message) {
        updateData.error_message = error_message;
      }

      if (result) {
        updateData.result = result;
      }

      const updatedJob = await database.updateJob(jobId, updateData);

      if (!updatedJob) {
        throw new NotFoundError('Job');
      }

      // Publish status update event
      await redis.publish('job:status:updated', {
        jobId,
        oldStatus: updatedJob.status,
        newStatus: status,
        timestamp: new Date().toISOString()
      });

      return res.json({ job: updatedJob });

    } catch (error) {
      log.error('Error updating job status', { error, jobId: req.params.id });
      
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      } else if (error instanceof NotFoundError) {
        return res.status(404).json({ error: error.message });
      } else {
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Cancel job
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
      }

      const { reason } = req.body;

      const job = await database.getJob(jobId);
      if (!job) {
        throw new NotFoundError('Job');
      }

      if ([JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED].includes(job.status)) {
        res.status(400).json({ error: 'Cannot cancel a job that is already completed' });
        return;
      }

      await database.updateJob(jobId, {
        status: JobStatus.CANCELLED,
        error_message: reason || 'Job cancelled by user',
        completed_at: new Date()
      });

      // Notify agent if job is running
      if (job.status === JobStatus.RUNNING && job.assigned_agent) {
        await redis.publish(`agent:${job.assigned_agent}:cancel`, {
          jobId,
          reason: reason || 'Job cancelled by user'
        });
      }

      return res.json({ message: 'Job cancelled successfully' });

    } catch (error) {
      log.error('Error cancelling job', { error, jobId: req.params.id });
      
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: error.message });
      } else {
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Get job metrics
  router.get('/:id/metrics', async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
      }

      const job = await database.getJob(jobId);

      if (!job) {
        throw new NotFoundError('Job');
      }

      const metrics = {
        id: job.id,
        status: job.status,
        priority: job.priority,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        duration_ms: job.started_at && job.completed_at 
          ? job.completed_at.getTime() - job.started_at.getTime()
          : null,
        queue_time_ms: job.started_at 
          ? job.started_at.getTime() - job.created_at.getTime()
          : Date.now() - job.created_at.getTime(),
        retry_count: job.retry_count,
        result: job.result
      };

      return res.json(metrics);

    } catch (error) {
      log.error('Error getting job metrics', { error, jobId: req.params.id });
      
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: error.message });
      } else {
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  return router;
}
