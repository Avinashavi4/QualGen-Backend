/**
 * QualGen Job Orchestrator
 * Backend service for queuing, grouping, and scheduling AppWright tests
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const Redis = require('redis');
const { Pool } = require('pg');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

class JobOrchestrator {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 8080;
    this.setupMiddleware();
    this.setupDatabase();
    this.setupRedis();
    this.setupRoutes();
    this.setupGrpcServer();
    this.jobs = new Map(); // In-memory job cache
    this.devices = new Map(); // Device registry
    this.jobGroups = new Map(); // App version groups
    this.startScheduler();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  async setupDatabase() {
    this.db = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'qualgen',
      user: process.env.DB_USER || 'qualgen',
      password: process.env.DB_PASSWORD || 'password'
    });

    // Initialize database schema
    await this.initializeSchema();
  }

  async setupRedis() {
    this.redis = Redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    });

    this.redis.on('error', (err) => {
      console.error('Redis error:', err);
    });

    await this.redis.connect();
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        services: {
          database: this.db ? 'connected' : 'disconnected',
          redis: this.redis.isReady ? 'connected' : 'disconnected'
        }
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', async (req, res) => {
      const metrics = await this.getMetrics();
      res.json(metrics);
    });

    // Job submission
    this.app.post('/api/v1/jobs', async (req, res) => {
      try {
        const job = await this.submitJob(req.body);
        res.status(201).json(job);
      } catch (error) {
        console.error('Job submission error:', error);
        res.status(400).json({ error: error.message });
      }
    });

    // Get job status
    this.app.get('/api/v1/jobs/:jobId', async (req, res) => {
      try {
        const job = await this.getJobStatus(req.params.jobId);
        if (!job) {
          return res.status(404).json({ error: 'Job not found' });
        }
        res.json(job);
      } catch (error) {
        console.error('Get job error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List jobs
    this.app.get('/api/v1/jobs', async (req, res) => {
      try {
        const jobs = await this.listJobs(req.query);
        res.json(jobs);
      } catch (error) {
        console.error('List jobs error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Cancel job
    this.app.post('/api/v1/jobs/:jobId/cancel', async (req, res) => {
      try {
        await this.cancelJob(req.params.jobId);
        res.json({ message: 'Job cancelled successfully' });
      } catch (error) {
        console.error('Cancel job error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List devices
    this.app.get('/api/v1/devices', async (req, res) => {
      try {
        const devices = await this.listDevices(req.query);
        res.json(devices);
      } catch (error) {
        console.error('List devices error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Device registration (for agents)
    this.app.post('/api/v1/devices/register', async (req, res) => {
      try {
        const device = await this.registerDevice(req.body);
        res.status(201).json(device);
      } catch (error) {
        console.error('Device registration error:', error);
        res.status(400).json({ error: error.message });
      }
    });

    // Device heartbeat
    this.app.post('/api/v1/devices/:deviceId/heartbeat', async (req, res) => {
      try {
        await this.updateDeviceHeartbeat(req.params.deviceId, req.body);
        res.json({ message: 'Heartbeat received' });
      } catch (error) {
        console.error('Device heartbeat error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Job result submission (from agents)
    this.app.post('/api/v1/jobs/:jobId/result', async (req, res) => {
      try {
        await this.submitJobResult(req.params.jobId, req.body);
        res.json({ message: 'Result received' });
      } catch (error) {
        console.error('Job result error:', error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  setupGrpcServer() {
    // gRPC for high-performance agent communication
    const packageDefinition = protoLoader.loadSync('./proto/qualgen.proto', {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });

    const qualgenProto = grpc.loadPackageDefinition(packageDefinition).qualgen;
    
    this.grpcServer = new grpc.Server();
    this.grpcServer.addService(qualgenProto.JobService.service, {
      GetNextJob: this.getNextJobGrpc.bind(this),
      UpdateJobProgress: this.updateJobProgressGrpc.bind(this),
      CompleteJob: this.completeJobGrpc.bind(this)
    });

    const grpcPort = process.env.GRPC_PORT || 9090;
    this.grpcServer.bindAsync(`0.0.0.0:${grpcPort}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
      if (err) {
        console.error('gRPC server failed to start:', err);
      } else {
        console.log(`🚀 gRPC server running on port ${port}`);
        this.grpcServer.start();
      }
    });
  }

  async initializeSchema() {
    const schema = `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      
      CREATE TABLE IF NOT EXISTS jobs (
        job_id VARCHAR(50) PRIMARY KEY,
        org_id VARCHAR(100) NOT NULL,
        app_version_id VARCHAR(100) NOT NULL,
        test_path TEXT NOT NULL,
        priority VARCHAR(20) DEFAULT 'medium',
        target VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'queued',
        device_requirements JSONB,
        device_id VARCHAR(100),
        progress INTEGER DEFAULT 0,
        error_message TEXT,
        test_results JSONB,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        timeout_seconds INTEGER DEFAULT 300
      );

      CREATE TABLE IF NOT EXISTS devices (
        device_id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        device_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'available',
        location VARCHAR(100),
        capabilities JSONB,
        current_job_id VARCHAR(50),
        last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS job_groups (
        group_id VARCHAR(50) PRIMARY KEY,
        app_version_id VARCHAR(100) NOT NULL,
        org_id VARCHAR(100) NOT NULL,
        target VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        job_ids TEXT[],
        assigned_device_id VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_org_status ON jobs(org_id, status);
      CREATE INDEX IF NOT EXISTS idx_jobs_app_version ON jobs(app_version_id);
      CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
      CREATE INDEX IF NOT EXISTS idx_job_groups_app_version ON job_groups(app_version_id);
    `;

    try {
      await this.db.query(schema);
      console.log('✅ Database schema initialized');
    } catch (error) {
      console.error('❌ Database schema initialization failed:', error);
    }
  }

  async submitJob(jobData) {
    const jobId = `qj_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    
    // Validate required fields
    const required = ['org_id', 'app_version_id', 'test_path', 'target'];
    for (const field of required) {
      if (!jobData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    const job = {
      job_id: jobId,
      org_id: jobData.org_id,
      app_version_id: jobData.app_version_id,
      test_path: jobData.test_path,
      priority: jobData.priority || 'medium',
      target: jobData.target,
      status: 'queued',
      device_requirements: jobData.device_requirements || {},
      timeout_seconds: jobData.timeout || 300,
      metadata: jobData.metadata || {},
      created_at: new Date().toISOString()
    };

    // Store in database
    await this.db.query(`
      INSERT INTO jobs (job_id, org_id, app_version_id, test_path, priority, target, status, device_requirements, timeout_seconds, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      job.job_id, job.org_id, job.app_version_id, job.test_path, job.priority, 
      job.target, job.status, JSON.stringify(job.device_requirements), 
      job.timeout_seconds, JSON.stringify(job.metadata), job.created_at
    ]);

    // Add to Redis queue with priority
    const queueKey = `queue:${job.target}:${job.priority}`;
    await this.redis.lpush(queueKey, jobId);

    // Cache in memory
    this.jobs.set(jobId, job);

    // Trigger job grouping
    await this.groupJobs(job.app_version_id, job.org_id, job.target);

    console.log(`📝 Job submitted: ${jobId} (${job.org_id}/${job.app_version_id})`);

    return {
      job_id: jobId,
      status: job.status,
      priority: job.priority,
      target: job.target,
      queue_position: await this.getQueuePosition(jobId),
      estimated_start_time: await this.estimateStartTime(job)
    };
  }

  async groupJobs(appVersionId, orgId, target) {
    // Find or create job group for this app version
    const groupId = `qg_${appVersionId}_${target}_${Date.now()}`;
    
    // Get all queued jobs for this app version
    const result = await this.db.query(`
      SELECT job_id FROM jobs 
      WHERE app_version_id = $1 AND org_id = $2 AND target = $3 AND status = 'queued'
      ORDER BY priority DESC, created_at ASC
    `, [appVersionId, orgId, target]);

    if (result.rows.length > 1) {
      const jobIds = result.rows.map(row => row.job_id);
      
      // Create or update job group
      await this.db.query(`
        INSERT INTO job_groups (group_id, app_version_id, org_id, target, job_ids)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (group_id) DO UPDATE SET job_ids = $5
      `, [groupId, appVersionId, orgId, target, jobIds]);

      console.log(`👥 Grouped ${jobIds.length} jobs for app version ${appVersionId}`);
    }
  }

  async getJobStatus(jobId) {
    const result = await this.db.query('SELECT * FROM jobs WHERE job_id = $1', [jobId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const job = result.rows[0];
    
    // Parse JSON fields
    job.device_requirements = typeof job.device_requirements === 'string' 
      ? JSON.parse(job.device_requirements) 
      : job.device_requirements;
    job.test_results = typeof job.test_results === 'string' 
      ? JSON.parse(job.test_results) 
      : job.test_results;
    job.metadata = typeof job.metadata === 'string' 
      ? JSON.parse(job.metadata) 
      : job.metadata;

    return job;
  }

  async listJobs(filters) {
    let query = 'SELECT * FROM jobs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.org_id) {
      query += ` AND org_id = $${paramIndex++}`;
      params.push(filters.org_id);
    }

    if (filters.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters.app_version_id) {
      query += ` AND app_version_id = $${paramIndex++}`;
      params.push(filters.app_version_id);
    }

    query += ` ORDER BY created_at DESC LIMIT ${parseInt(filters.limit) || 10}`;

    const result = await this.db.query(query, params);
    return result.rows;
  }

  async cancelJob(jobId) {
    await this.db.query(`
      UPDATE jobs SET status = 'cancelled', completed_at = NOW() 
      WHERE job_id = $1 AND status IN ('queued', 'running')
    `, [jobId]);

    // Remove from Redis queue
    const job = await this.getJobStatus(jobId);
    if (job) {
      const queueKey = `queue:${job.target}:${job.priority}`;
      await this.redis.lrem(queueKey, 0, jobId);
    }

    console.log(`❌ Job cancelled: ${jobId}`);
  }

  async listDevices(filters) {
    let query = 'SELECT * FROM devices WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.platform) {
      query += ` AND platform = $${paramIndex++}`;
      params.push(filters.platform);
    }

    if (filters.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }

    query += ' ORDER BY name ASC';

    const result = await this.db.query(query, params);
    return result.rows;
  }

  async registerDevice(deviceData) {
    const device = {
      device_id: deviceData.device_id || `qd_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
      name: deviceData.name,
      platform: deviceData.platform,
      device_type: deviceData.device_type,
      status: 'available',
      location: deviceData.location || 'local',
      capabilities: deviceData.capabilities || {}
    };

    await this.db.query(`
      INSERT INTO devices (device_id, name, platform, device_type, status, location, capabilities)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (device_id) DO UPDATE SET
        name = $2, platform = $3, device_type = $4, status = $5, 
        location = $6, capabilities = $7, last_heartbeat = NOW()
    `, [
      device.device_id, device.name, device.platform, device.device_type,
      device.status, device.location, JSON.stringify(device.capabilities)
    ]);

    console.log(`📱 Device registered: ${device.device_id} (${device.name})`);
    return device;
  }

  async updateDeviceHeartbeat(deviceId, data) {
    await this.db.query(`
      UPDATE devices SET 
        status = $2, 
        current_job_id = $3, 
        last_heartbeat = NOW() 
      WHERE device_id = $1
    `, [deviceId, data.status || 'available', data.current_job_id]);
  }

  async submitJobResult(jobId, result) {
    const status = result.success ? 'completed' : 'failed';
    
    await this.db.query(`
      UPDATE jobs SET 
        status = $2, 
        progress = 100, 
        test_results = $3, 
        error_message = $4,
        completed_at = NOW()
      WHERE job_id = $1
    `, [jobId, status, JSON.stringify(result.test_results), result.error_message]);

    // Free up the device
    if (result.device_id) {
      await this.db.query(`
        UPDATE devices SET status = 'available', current_job_id = NULL 
        WHERE device_id = $1
      `, [result.device_id]);
    }

    console.log(`✅ Job ${status}: ${jobId}`);
  }

  async getQueuePosition(jobId) {
    // This is a simplified implementation
    return Math.floor(Math.random() * 10) + 1;
  }

  async estimateStartTime(job) {
    // Estimate based on queue depth and average job duration
    const avgDuration = 120; // 2 minutes average
    const position = await this.getQueuePosition(job.job_id);
    const estimatedStart = new Date(Date.now() + (position * avgDuration * 1000));
    return estimatedStart.toISOString();
  }

  async getMetrics() {
    const jobStats = await this.db.query(`
      SELECT status, COUNT(*) as count FROM jobs 
      GROUP BY status
    `);

    const deviceStats = await this.db.query(`
      SELECT status, COUNT(*) as count FROM devices 
      GROUP BY status
    `);

    return {
      timestamp: new Date().toISOString(),
      jobs: jobStats.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count);
        return acc;
      }, {}),
      devices: deviceStats.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count);
        return acc;
      }, {}),
      queue_depth: await this.getQueueDepth()
    };
  }

  async getQueueDepth() {
    const keys = await this.redis.keys('queue:*');
    let totalDepth = 0;
    
    for (const key of keys) {
      const depth = await this.redis.llen(key);
      totalDepth += depth;
    }
    
    return totalDepth;
  }

  // Scheduler to assign jobs to devices
  startScheduler() {
    setInterval(async () => {
      try {
        await this.scheduleJobs();
      } catch (error) {
        console.error('Scheduler error:', error);
      }
    }, 5000); // Run every 5 seconds

    console.log('📅 Job scheduler started');
  }

  async scheduleJobs() {
    // Get available devices
    const availableDevices = await this.db.query(`
      SELECT * FROM devices 
      WHERE status = 'available' 
      ORDER BY last_heartbeat DESC
    `);

    if (availableDevices.rows.length === 0) {
      return; // No available devices
    }

    // Process high priority queues first
    const priorities = ['high', 'medium', 'low'];
    const targets = ['device', 'emulator', 'browserstack'];

    for (const priority of priorities) {
      for (const target of targets) {
        const queueKey = `queue:${target}:${priority}`;
        const jobId = await this.redis.rpop(queueKey);
        
        if (jobId) {
          await this.assignJobToDevice(jobId, availableDevices.rows, target);
        }
      }
    }
  }

  async assignJobToDevice(jobId, availableDevices, target) {
    // Find suitable device based on target and requirements
    let suitableDevice = null;
    
    const job = await this.getJobStatus(jobId);
    if (!job) return;

    for (const device of availableDevices) {
      if (target === 'browserstack' || this.deviceMatches(device, job.device_requirements)) {
        suitableDevice = device;
        break;
      }
    }

    if (!suitableDevice && target !== 'browserstack') {
      // Put job back in queue
      const queueKey = `queue:${target}:${job.priority}`;
      await this.redis.lpush(queueKey, jobId);
      return;
    }

    // Assign job to device
    await this.db.query(`
      UPDATE jobs SET 
        status = 'running', 
        device_id = $2, 
        started_at = NOW() 
      WHERE job_id = $1
    `, [jobId, suitableDevice?.device_id || 'browserstack']);

    if (suitableDevice) {
      await this.db.query(`
        UPDATE devices SET 
          status = 'busy', 
          current_job_id = $2 
        WHERE device_id = $1
      `, [suitableDevice.device_id, jobId]);
    }

    console.log(`🎯 Job assigned: ${jobId} → ${suitableDevice?.name || 'BrowserStack'}`);
  }

  deviceMatches(device, requirements) {
    if (requirements.platform && device.platform !== requirements.platform) {
      return false;
    }
    if (requirements.device_type && device.device_type !== requirements.device_type) {
      return false;
    }
    return true;
  }

  // gRPC service methods
  async getNextJobGrpc(call, callback) {
    const { device_id } = call.request;
    
    try {
      // Find next job for this device
      const result = await this.db.query(`
        SELECT * FROM jobs 
        WHERE device_id = $1 AND status = 'running' 
        ORDER BY started_at ASC 
        LIMIT 1
      `, [device_id]);

      if (result.rows.length > 0) {
        callback(null, { job: result.rows[0] });
      } else {
        callback(null, { job: null });
      }
    } catch (error) {
      callback(error);
    }
  }

  async updateJobProgressGrpc(call, callback) {
    const { job_id, progress, status } = call.request;
    
    try {
      await this.db.query(`
        UPDATE jobs SET progress = $2, status = $3 
        WHERE job_id = $1
      `, [job_id, progress, status]);

      callback(null, { success: true });
    } catch (error) {
      callback(error);
    }
  }

  async completeJobGrpc(call, callback) {
    const { job_id, success, test_results, error_message } = call.request;
    
    try {
      await this.submitJobResult(job_id, {
        success,
        test_results: JSON.parse(test_results || '{}'),
        error_message
      });

      callback(null, { success: true });
    } catch (error) {
      callback(error);
    }
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`🚀 QualGen Job Orchestrator running on port ${this.port}`);
      console.log(`📊 Dashboard: http://localhost:3007`);
      console.log(`🔌 API: http://localhost:${this.port}`);
      console.log(`⚡ gRPC: localhost:9090`);
    });
  }
}

// Start the server
if (require.main === module) {
  const orchestrator = new JobOrchestrator();
  orchestrator.start();
}

module.exports = JobOrchestrator;
