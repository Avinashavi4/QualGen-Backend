import request from 'supertest';
import { Server } from '../src/server';

describe('API Integration Tests', () => {
  let server: Server;
  let app: any;

  beforeAll(async () => {
    server = new Server();
    await server.initialize();
    // Access the app property directly since getApp() doesn't exist
    app = (server as any).app;
  });

  afterAll(async () => {
    await server.shutdown();
  });

  describe('POST /api/jobs', () => {
    test('should create a new job', async () => {
      const jobPayload = {
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

      const response = await request(app)
        .post('/api/jobs')
        .send(jobPayload)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('pending');
      expect(response.body.org_id).toBe(jobPayload.org_id);
    });

    test('should validate job payload', async () => {
      const invalidPayload = {
        org_id: 'test-org',
        // Missing required fields
      };

      await request(app)
        .post('/api/jobs')
        .send(invalidPayload)
        .expect(400);
    });
  });

  describe('GET /api/jobs/:id', () => {
    test('should retrieve a job by ID', async () => {
      // First create a job
      const jobPayload = {
        org_id: 'test-org',
        app_version_id: 'v1.0.0',
        test_path: 'suite-1',
        priority: 5,
        target: 'device',
        metadata: {
          platform: 'iOS',
          device: 'iPhone 14',
          os_version: '16.0'
        }
      };

      const createResponse = await request(app)
        .post('/api/jobs')
        .send(jobPayload)
        .expect(201);

      const jobId = createResponse.body.id;

      const getResponse = await request(app)
        .get(`/api/jobs/${jobId}`)
        .expect(200);

      expect(getResponse.body.id).toBe(jobId);
      expect(getResponse.body.org_id).toBe(jobPayload.org_id);
    });

    test('should return 404 for non-existent job', async () => {
      await request(app)
        .get('/api/jobs/non-existent-id')
        .expect(404);
    });
  });

  describe('GET /api/jobs', () => {
    test('should list jobs with pagination', async () => {
      const response = await request(app)
        .get('/api/jobs?offset=0&limit=10')
        .expect(200);

      expect(response.body).toHaveProperty('jobs');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.jobs)).toBe(true);
    });
  });

  describe('POST /api/agents/register', () => {
    test('should register an agent', async () => {
      const agentData = {
        id: 'test-agent-1',
        capabilities: ['emulator', 'device']
      };

      const response = await request(app)
        .post('/api/agents/register')
        .send(agentData)
        .expect(200);

      expect(response.body.message).toBe('Agent registered successfully');
    });
  });

  describe('GET /api/agents', () => {
    test('should list agents', async () => {
      const response = await request(app)
        .get('/api/agents')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/agents/:id/heartbeat', () => {
    test('should update agent heartbeat', async () => {
      // First register an agent
      const agentData = {
        id: 'heartbeat-agent',
        capabilities: ['emulator']
      };

      await request(app)
        .post('/api/agents/register')
        .send(agentData)
        .expect(200);

      // Then send heartbeat
      const response = await request(app)
        .post('/api/agents/heartbeat-agent/heartbeat')
        .send({ status: 'idle' })
        .expect(200);

      expect(response.body.message).toBe('Heartbeat received');
    });
  });
});
