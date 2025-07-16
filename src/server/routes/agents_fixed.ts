import { Router, Request, Response } from 'express';
import { Database } from '../database/database';
import { RedisClient } from '../services/redis';
import { log } from '@shared/logger';
import {
  Agent,
  AgentStatus,
  AgentHeartbeatRequest,
  ValidationError,
  NotFoundError
} from '@shared/types';

export function createAgentsRouter(database: Database, redis: RedisClient): Router {
  const router = Router();

  // Register a new agent
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { id, capabilities } = req.body;

      if (!id || !capabilities) {
        return res.status(400).json({ error: 'Agent ID and capabilities are required' });
      }

      const agent: Omit<Agent, 'last_heartbeat'> = {
        id,
        name: id,
        capabilities,
        status: AgentStatus.OFFLINE,
        current_jobs: [],
        max_concurrent_jobs: 3,
        metadata: {}
      };

      await database.createAgent(agent);

      log.info('Agent registered successfully', { agentId: id });
      
      return res.json({ 
        message: 'Agent registered successfully',
        agent_id: id 
      });

    } catch (error) {
      log.error('Error registering agent', { error });
      return res.status(500).json({ error: 'Failed to register agent' });
    }
  });

  // Agent heartbeat
  router.post('/:id/heartbeat', async (req: Request, res: Response) => {
    try {
      const agentId = req.params.id;
      if (!agentId) {
        return res.status(400).json({ error: 'Agent ID is required' });
      }

      const { status } = req.body;

      const agent = await database.getAgent(agentId);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      await database.updateAgent(agentId, { status });

      return res.json({
        message: 'Heartbeat received',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      log.error('Error processing agent heartbeat', { error, agentId: req.params.id });
      return res.status(500).json({ error: 'Failed to process heartbeat' });
    }
  });

  // Get agent details
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const agentId = req.params.id;
      if (!agentId) {
        return res.status(400).json({ error: 'Agent ID is required' });
      }
      
      const agent = await database.getAgent(agentId);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      return res.json({ agent });

    } catch (error) {
      log.error('Error getting agent details', { error, agentId: req.params.id });
      return res.status(500).json({ error: 'Failed to get agent details' });
    }
  });

  // List all agents
  router.get('/', async (req: Request, res: Response) => {
    try {
      const agents = await database.getAvailableAgents();
      return res.json(agents);
    } catch (error) {
      log.error('Error listing agents', { error });
      return res.status(500).json({ error: 'Failed to list agents' });
    }
  });

  return router;
}
