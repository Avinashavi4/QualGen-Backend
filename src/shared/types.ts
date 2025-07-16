// Job-related types
export interface JobPayload {
  org_id: string;
  app_version_id: string;
  test_path: string;
  priority: number; // 1-10, higher number = higher priority
  target: 'emulator' | 'device' | 'browserstack';
  metadata?: Record<string, any>;
}

export interface Job extends JobPayload {
  id: string;
  status: JobStatus;
  created_at: Date;
  updated_at: Date;
  started_at?: Date;
  completed_at?: Date;
  assigned_agent?: string;
  retry_count: number;
  error_message?: string;
  result?: JobResult;
}

export enum JobStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
  CANCELLED = 'cancelled'
}

export interface JobResult {
  success: boolean;
  tests_run: number;
  tests_passed: number;
  tests_failed: number;
  duration_ms: number;
  artifacts?: string[];
  logs?: string;
}

// Job Group types
export interface JobGroup {
  id: string;
  org_id: string;
  app_version_id: string;
  target: string;
  jobs: Job[];
  status: GroupStatus;
  assigned_agent?: string;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
}

export enum GroupStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// Agent types
export interface Agent {
  id: string;
  name: string;
  capabilities: AgentCapability[];
  status: AgentStatus;
  current_jobs: string[];
  max_concurrent_jobs: number;
  last_heartbeat: Date;
  metadata?: Record<string, any>;
}

export interface AgentCapability {
  target: 'emulator' | 'device' | 'browserstack';
  platform?: string;
  version?: string;
  device_name?: string;
}

export enum AgentStatus {
  ONLINE = 'online',
  BUSY = 'busy',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance'
}

// API Request/Response types
export interface SubmitJobRequest {
  jobs: JobPayload | JobPayload[];
}

export interface SubmitJobResponse {
  job_ids: string[];
  message: string;
}

export interface JobStatusResponse {
  job: Job;
}

export interface ListJobsRequest {
  org_id?: string;
  status?: JobStatus;
  limit?: number;
  offset?: number;
}

export interface ListJobsResponse {
  jobs: Job[];
  total: number;
  has_more: boolean;
}

export interface AgentHeartbeatRequest {
  agent_id: string;
  status: AgentStatus;
  current_jobs: string[];
  metadata?: Record<string, any>;
}

export interface AgentRegistrationRequest {
  name: string;
  capabilities: AgentCapability[];
  max_concurrent_jobs: number;
  metadata?: Record<string, any>;
}

export interface AgentRegistrationResponse {
  agent_id: string;
  message: string;
}

// CLI types
export interface CLIConfig {
  server_url: string;
  api_key?: string;
  timeout: number;
  retry_attempts: number;
}

export interface SubmitJobCLIOptions {
  orgId: string;
  appVersionId: string;
  testPath: string;
  priority: number;
  target: 'emulator' | 'device' | 'browserstack';
  serverUrl?: string;
  timeout?: string;
  wait?: boolean;
  metadata?: string;
}

export interface StatusCheckCLIOptions {
  jobId: string;
  serverUrl?: string;
  watch?: boolean;
  interval?: number;
}

export interface ListJobsCLIOptions {
  orgId?: string;
  status?: string;
  limit?: string;
  offset?: string;
  serverUrl?: string;
}

export interface CancelJobCLIOptions {
  jobId: string;
  reason?: string;
  serverUrl?: string;
}

// Database models
export interface JobModel {
  id: string;
  org_id: string;
  app_version_id: string;
  test_path: string;
  priority: number;
  target: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  started_at?: Date | null;
  completed_at?: Date | null;
  assigned_agent?: string | null;
  retry_count: number;
  error_message?: string | null;
  metadata?: any | null;
  result?: any | null;
}

export interface JobGroupModel {
  id: string;
  org_id: string;
  app_version_id: string;
  target: string;
  status: string;
  assigned_agent?: string;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
}

export interface AgentModel {
  id: string;
  name: string;
  capabilities: any;
  status: string;
  current_jobs: string[];
  max_concurrent_jobs: number;
  last_heartbeat: Date;
  metadata?: any;
}

// System configuration
export interface ServerConfig {
  port: number;
  host: string;
  database_url: string;
  redis_url: string;
  max_concurrent_jobs: number;
  job_timeout_ms: number;
  retry_attempts: number;
  agent_heartbeat_interval: number;
  agent_timeout_ms: number;
  log_level: string;
}

// Error types
export class QualGenError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'QualGenError';
  }
}

export class ValidationError extends QualGenError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class NotFoundError extends QualGenError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends QualGenError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export class ServiceUnavailableError extends QualGenError {
  constructor(message: string) {
    super(message, 'SERVICE_UNAVAILABLE', 503);
  }
}
