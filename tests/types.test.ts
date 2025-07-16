import { JobStatus, AgentStatus, JobPayload, Agent, AgentCapability } from '../src/shared/types';

describe('Types Tests', () => {
  describe('JobStatus Enum', () => {
    test('should have correct values', () => {
      expect(JobStatus.PENDING).toBe('pending');
      expect(JobStatus.RUNNING).toBe('running');
      expect(JobStatus.COMPLETED).toBe('completed');
      expect(JobStatus.FAILED).toBe('failed');
      expect(JobStatus.CANCELLED).toBe('cancelled');
    });
  });

  describe('AgentStatus Enum', () => {
    test('should have correct values', () => {
      expect(AgentStatus.ONLINE).toBe('online');
      expect(AgentStatus.BUSY).toBe('busy');
      expect(AgentStatus.OFFLINE).toBe('offline');
      expect(AgentStatus.MAINTENANCE).toBe('maintenance');
    });
  });

  describe('JobPayload Interface', () => {
    test('should create valid job payload', () => {
      const payload: JobPayload = {
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

      expect(payload.org_id).toBe('test-org');
      expect(payload.app_version_id).toBe('v1.0.0');
      expect(payload.test_path).toBe('suite-1');
      expect(payload.priority).toBe(5);
      expect(payload.target).toBe('emulator');
      expect(payload.metadata?.platform).toBe('Android');
    });
  });

  describe('Agent Interface', () => {
    test('should create valid agent', () => {
      const capabilities: AgentCapability[] = [
        { target: 'emulator', platform: 'Android' },
        { target: 'device', platform: 'iOS', device_name: 'iPhone 14' }
      ];

      const agent: Agent = {
        id: 'test-agent',
        name: 'Test Agent',
        capabilities,
        status: AgentStatus.ONLINE,
        current_jobs: [],
        max_concurrent_jobs: 3,
        metadata: {},
        last_heartbeat: new Date()
      };

      expect(agent.id).toBe('test-agent');
      expect(agent.name).toBe('Test Agent');
      expect(agent.capabilities).toEqual(capabilities);
      expect(agent.status).toBe(AgentStatus.ONLINE);
      expect(agent.current_jobs).toEqual([]);
      expect(agent.max_concurrent_jobs).toBe(3);
      expect(agent.last_heartbeat).toBeInstanceOf(Date);
    });
  });
});
