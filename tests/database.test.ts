import { Database } from '../src/server/database/database';
import { JobPayload, JobStatus, AgentStatus, AgentCapability } from '../src/shared/types';

describe('Database Integration Tests', () => {
  let db: Database;

  beforeAll(async () => {
    db = new Database();
    await db.connect();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    // Clean up tables before each test
    await db.query('DELETE FROM jobs');
    await db.query('DELETE FROM agents');
  });

  describe('Job Operations', () => {
    test('should create and retrieve a job', async () => {
      const jobPayload: JobPayload = {
        org_id: 'test-org',
        app_version_id: 'v1.0.0',
        test_path: 'suite-1',
        priority: 5,
        target: 'browserstack',
        metadata: {
          platform: 'iOS',
          device: 'iPhone 14',
          os_version: '16.0'
        }
      };

      const jobData = {
        id: 'test-job-id',
        ...jobPayload,
        status: JobStatus.PENDING,
        retry_count: 0
      };

      const job = await db.createJob(jobData);
      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.status).toBe('pending');

      const retrievedJob = await db.getJob(job.id);
      expect(retrievedJob).toBeDefined();
      expect(retrievedJob?.id).toBe(job.id);
      expect(retrievedJob?.org_id).toBe(jobPayload.org_id);
    });

    test('should list jobs with pagination', async () => {
      // Create multiple jobs
      const jobPayloads = Array.from({ length: 5 }, (_, i) => {
        const jobPayload: JobPayload = {
          org_id: `project-${i}`,
          app_version_id: 'v1.0.0',
          test_path: `suite-${i}`,
          priority: 5,
          target: 'device',
          metadata: {
            platform: 'Android',
            device: 'Pixel 7',
            os_version: '13'
          }
        };
        
        return {
          id: `job-${i}`,
          ...jobPayload,
          status: JobStatus.PENDING,
          retry_count: 0
        };
      });

      for (const payload of jobPayloads) {
        await db.createJob(payload);
      }

      const jobs = await db.listJobs({ limit: 3, offset: 0 });
      expect(jobs.jobs).toHaveLength(3);

      const allJobs = await db.listJobs({ limit: 10, offset: 0 });
      expect(allJobs.jobs).toHaveLength(5);
    });

    test('should update job status', async () => {
      const jobPayload: JobPayload = {
        org_id: 'test-org',
        app_version_id: 'v1.0.0',
        test_path: 'suite-1',
        priority: 5,
        target: 'emulator',
        metadata: {
          platform: 'Android',
          device: 'Pixel 6',
          os_version: '12'
        }
      };

      const jobData = {
        id: 'test-job-update',
        ...jobPayload,
        status: JobStatus.PENDING,
        retry_count: 0
      };

      const job = await db.createJob(jobData);
      await db.updateJob(job.id, { 
        status: 'running', 
        assigned_agent: 'agent-1',
        started_at: new Date()
      });

      const updatedJob = await db.getJob(job.id);
      expect(updatedJob?.status).toBe('running');
      expect(updatedJob?.assigned_agent).toBe('agent-1');
    });
  });

  describe('Agent Operations', () => {
    test('should register and retrieve an agent', async () => {
      const agentData = {
        id: 'test-agent-1',
        name: 'Test Agent 1',
        capabilities: [
          { target: 'emulator' as const, platform: 'Android' },
          { target: 'device' as const, platform: 'iOS' }
        ],
        status: AgentStatus.ONLINE,
        current_jobs: [],
        max_concurrent_jobs: 3,
        metadata: {}
      };

      await db.createAgent(agentData);
      const agent = await db.getAgent(agentData.id);

      expect(agent).toBeDefined();
      expect(agent?.id).toBe(agentData.id);
      expect(agent?.capabilities).toEqual(agentData.capabilities);
      expect(agent?.status).toBe(AgentStatus.ONLINE);
    });

    test('should list available agents by capability', async () => {
      const agents = [
        { 
          id: 'agent-1', 
          name: 'Agent 1', 
          capabilities: [{ target: 'emulator' as const }], 
          status: AgentStatus.ONLINE, 
          current_jobs: [], 
          max_concurrent_jobs: 3, 
          metadata: {} 
        },
        { 
          id: 'agent-2', 
          name: 'Agent 2', 
          capabilities: [
            { target: 'device' as const }, 
            { target: 'browserstack' as const }
          ], 
          status: AgentStatus.ONLINE, 
          current_jobs: [], 
          max_concurrent_jobs: 3, 
          metadata: {} 
        },
        { 
          id: 'agent-3', 
          name: 'Agent 3', 
          capabilities: [
            { target: 'emulator' as const }, 
            { target: 'device' as const }
          ], 
          status: AgentStatus.ONLINE, 
          current_jobs: [], 
          max_concurrent_jobs: 3, 
          metadata: {} 
        }
      ];

      for (const agent of agents) {
        await db.createAgent(agent);
      }

      const emulatorAgents = await db.getAvailableAgents('emulator');
      expect(emulatorAgents).toHaveLength(2);

      const browserstackAgents = await db.getAvailableAgents('browserstack');
      expect(browserstackAgents).toHaveLength(1);
    });

    test('should update agent status', async () => {
      const agentData = {
        id: 'agent-status-test',
        name: 'Status Test Agent',
        capabilities: [{ target: 'emulator' as const }],
        status: AgentStatus.ONLINE,
        current_jobs: [],
        max_concurrent_jobs: 3,
        metadata: {}
      };

      await db.createAgent(agentData);
      await db.updateAgent('agent-status-test', { status: AgentStatus.BUSY });

      const agent = await db.getAgent('agent-status-test');
      expect(agent?.status).toBe(AgentStatus.BUSY);
    });
  });
});
