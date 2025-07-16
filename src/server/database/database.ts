import { Pool, PoolClient } from 'pg';
import { log } from '../../shared/logger';
import { getEnvVar } from '../../shared/utils';
import { Job, JobGroup, Agent, JobModel, JobGroupModel, AgentModel } from '../../shared/types';

export class Database {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: getEnvVar('DATABASE_URL'),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      client.release();
      log.info('Database connected successfully');
    } catch (error) {
      log.error('Failed to connect to database', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    log.info('Database disconnected');
  }

  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  async migrate(): Promise<void> {
    log.info('Running database migrations...');

    const migrations = [
      `CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(255) PRIMARY KEY,
        org_id VARCHAR(255) NOT NULL,
        app_version_id VARCHAR(255) NOT NULL,
        test_path TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 5,
        target VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        assigned_agent VARCHAR(255),
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        metadata JSONB DEFAULT '{}',
        result JSONB
      )`,

      `CREATE TABLE IF NOT EXISTS job_groups (
        id VARCHAR(255) PRIMARY KEY,
        org_id VARCHAR(255) NOT NULL,
        app_version_id VARCHAR(255) NOT NULL,
        target VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        assigned_agent VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE
      )`,

      `CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        capabilities JSONB NOT NULL DEFAULT '[]',
        status VARCHAR(50) NOT NULL DEFAULT 'offline',
        current_jobs TEXT[] DEFAULT '{}',
        max_concurrent_jobs INTEGER DEFAULT 1,
        last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      )`,

      `CREATE INDEX IF NOT EXISTS idx_jobs_org_status ON jobs(org_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_app_version ON jobs(app_version_id)`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority DESC, created_at ASC)`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_target ON jobs(target)`,
      `CREATE INDEX IF NOT EXISTS idx_job_groups_app_version ON job_groups(app_version_id, target)`,
      `CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`
    ];

    for (const migration of migrations) {
      try {
        await this.query(migration);
      } catch (error) {
        log.error('Migration failed', { migration, error });
        throw error;
      }
    }

    log.info('Database migrations completed');
  }

  // Job operations
  async createJob(job: Omit<Job, 'created_at' | 'updated_at'>): Promise<Job> {
    const query = `
      INSERT INTO jobs (id, org_id, app_version_id, test_path, priority, target, status, assigned_agent, retry_count, error_message, metadata, result)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    
    const result = await this.query(query, [
      job.id,
      job.org_id,
      job.app_version_id,
      job.test_path,
      job.priority,
      job.target,
      job.status,
      job.assigned_agent,
      job.retry_count,
      job.error_message,
      JSON.stringify(job.metadata || {}),
      JSON.stringify(job.result)
    ]);

    return this.mapJobModel(result.rows[0]);
  }

  async getJob(id: string): Promise<Job | null> {
    const result = await this.query('SELECT * FROM jobs WHERE id = $1', [id]);
    return result.rows.length > 0 ? this.mapJobModel(result.rows[0]) : null;
  }

  async updateJob(id: string, updates: Partial<JobModel>): Promise<Job | null> {
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id')
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    if (!setClause) return this.getJob(id);

    const query = `
      UPDATE jobs 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const values = [id, ...Object.values(updates).filter((_, index) => Object.keys(updates)[index] !== 'id')];
    const result = await this.query(query, values);

    return result.rows.length > 0 ? this.mapJobModel(result.rows[0]) : null;
  }

  async listJobs(filters: {
    org_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ jobs: Job[]; total: number }> {
    let whereClause = '';
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.org_id) {
      conditions.push(`org_id = $${params.length + 1}`);
      params.push(filters.org_id);
    }

    if (filters.status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(filters.status);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM jobs ${whereClause}`;
    const countResult = await this.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get jobs
    let jobsQuery = `
      SELECT * FROM jobs ${whereClause}
      ORDER BY priority DESC, created_at ASC
    `;

    if (filters.limit) {
      jobsQuery += ` LIMIT $${params.length + 1}`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      jobsQuery += ` OFFSET $${params.length + 1}`;
      params.push(filters.offset);
    }

    const jobsResult = await this.query(jobsQuery, params);
    const jobs = jobsResult.rows.map(this.mapJobModel);

    return { jobs, total };
  }

  async getJobsByAppVersion(appVersionId: string, target: string): Promise<Job[]> {
    const result = await this.query(
      'SELECT * FROM jobs WHERE app_version_id = $1 AND target = $2 AND status IN ($3, $4) ORDER BY priority DESC, created_at ASC',
      [appVersionId, target, 'pending', 'queued']
    );

    return result.rows.map(this.mapJobModel);
  }

  // Job Group operations
  async createJobGroup(group: Omit<JobGroup, 'created_at' | 'jobs'>): Promise<JobGroup> {
    const query = `
      INSERT INTO job_groups (id, org_id, app_version_id, target, status, assigned_agent)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await this.query(query, [
      group.id,
      group.org_id,
      group.app_version_id,
      group.target,
      group.status,
      group.assigned_agent
    ]);

    const groupModel = result.rows[0];
    return {
      ...groupModel,
      jobs: []
    };
  }

  async getJobGroup(id: string): Promise<JobGroup | null> {
    const result = await this.query('SELECT * FROM job_groups WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;

    const group = result.rows[0];
    const jobs = await this.getJobsByAppVersion(group.app_version_id, group.target);

    return {
      ...group,
      jobs
    };
  }

  // Agent operations
  async createAgent(agent: Omit<Agent, 'last_heartbeat'>): Promise<Agent> {
    const query = `
      INSERT INTO agents (id, name, capabilities, status, current_jobs, max_concurrent_jobs, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await this.query(query, [
      agent.id,
      agent.name,
      JSON.stringify(agent.capabilities),
      agent.status,
      agent.current_jobs,
      agent.max_concurrent_jobs,
      JSON.stringify(agent.metadata || {})
    ]);

    return this.mapAgentModel(result.rows[0]);
  }

  async getAgent(id: string): Promise<Agent | null> {
    const result = await this.query('SELECT * FROM agents WHERE id = $1', [id]);
    return result.rows.length > 0 ? this.mapAgentModel(result.rows[0]) : null;
  }

  async updateAgent(id: string, updates: Partial<AgentModel>): Promise<Agent | null> {
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id')
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    if (!setClause) return this.getAgent(id);

    const query = `
      UPDATE agents 
      SET ${setClause}
      WHERE id = $1
      RETURNING *
    `;

    const values = [id, ...Object.values(updates).filter((_, index) => Object.keys(updates)[index] !== 'id')];
    const result = await this.query(query, values);

    return result.rows.length > 0 ? this.mapAgentModel(result.rows[0]) : null;
  }

  async getAvailableAgents(target?: string): Promise<Agent[]> {
    let query = `
      SELECT * FROM agents 
      WHERE status IN ('online', 'busy') 
      AND array_length(current_jobs, 1) < max_concurrent_jobs
    `;
    const params: any[] = [];

    if (target) {
      query += ` AND capabilities::text LIKE $1`;
      params.push(`%"target":"${target}"%`);
    }

    const result = await this.query(query, params);
    return result.rows.map(this.mapAgentModel);
  }

  // Helper methods
  private mapJobModel(row: JobModel): Job {
    return {
      id: row.id,
      org_id: row.org_id,
      app_version_id: row.app_version_id,
      test_path: row.test_path,
      priority: row.priority,
      target: row.target as any,
      status: row.status as any,
      created_at: row.created_at,
      updated_at: row.updated_at,
      started_at: row.started_at || undefined,
      completed_at: row.completed_at || undefined,
      assigned_agent: row.assigned_agent || undefined,
      retry_count: row.retry_count,
      error_message: row.error_message || undefined,
      metadata: row.metadata,
      result: row.result
    } as Job;
  }

  private mapAgentModel(row: AgentModel): Agent {
    return {
      id: row.id,
      name: row.name,
      capabilities: row.capabilities,
      status: row.status as any,
      current_jobs: row.current_jobs,
      max_concurrent_jobs: row.max_concurrent_jobs,
      last_heartbeat: row.last_heartbeat,
      metadata: row.metadata
    };
  }
}
