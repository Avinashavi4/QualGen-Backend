import { Router, Request, Response } from 'express';
import { Database } from '../database/database';
import { RedisClient } from '../services/redis';
import { log } from '../../shared/logger';

export function healthRoutes(database: Database, redis: RedisClient): Router {
  const router = Router();

  // Health check endpoint
  router.get('/', async (req: Request, res: Response) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'unknown',
          redis: 'unknown'
        },
        version: '1.0.0'
      };

      // Check database connection
      try {
        await database.query('SELECT 1');
        health.services.database = 'healthy';
      } catch (error) {
        health.services.database = 'unhealthy';
        health.status = 'degraded';
      }

      // Check Redis connection
      try {
        await redis.ping();
        health.services.redis = 'healthy';
      } catch (error) {
        health.services.redis = 'unhealthy';
        health.status = 'degraded';
      }

      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);

    } catch (error) {
      log.error('Error in health check', { error });
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      });
    }
  });

  // Detailed system metrics
  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      // Get job statistics
      const [
        pendingJobs,
        queuedJobs,
        runningJobs,
        completedJobs,
        failedJobs
      ] = await Promise.all([
        database.listJobs({ status: 'pending', limit: 0 }),
        database.listJobs({ status: 'queued', limit: 0 }),
        database.listJobs({ status: 'running', limit: 0 }),
        database.listJobs({ status: 'completed', limit: 0 }),
        database.listJobs({ status: 'failed', limit: 0 })
      ]);

      // Get agent statistics
      const agentsResult = await database.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM agents 
        GROUP BY status
      `);

      const agentStats: Record<string, number> = {};
      agentsResult.rows.forEach((row: any) => {
        agentStats[row.status] = parseInt(row.count);
      });

      // Get Redis queue lengths
      const queueLengths = {
        scheduling: await redis.getPriorityQueueLength('groups:scheduling'),
        processing: await redis.getQueueLength('groups:processing')
      };

      const metrics = {
        timestamp: new Date().toISOString(),
        jobs: {
          pending: pendingJobs.total,
          queued: queuedJobs.total,
          running: runningJobs.total,
          completed: completedJobs.total,
          failed: failedJobs.total,
          total: pendingJobs.total + queuedJobs.total + runningJobs.total + completedJobs.total + failedJobs.total
        },
        agents: {
          online: agentStats.online || 0,
          busy: agentStats.busy || 0,
          offline: agentStats.offline || 0,
          maintenance: agentStats.maintenance || 0,
          total: Object.values(agentStats).reduce((sum, count) => sum + count, 0)
        },
        queues: queueLengths,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version
        }
      };

      res.json(metrics);

    } catch (error) {
      log.error('Error getting metrics', { error });
      res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
  });

  // Readiness check (for Kubernetes)
  router.get('/ready', async (req: Request, res: Response) => {
    try {
      // Check if all critical services are available
      await database.query('SELECT 1');
      await redis.ping();

      res.json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      log.error('Readiness check failed', { error });
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Liveness check (for Kubernetes)
  router.get('/live', async (req: Request, res: Response) => {
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  return router;
}
