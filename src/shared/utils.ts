import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique identifier
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Generate a job ID with prefix
 */
export function generateJobId(): string {
  return `job_${uuidv4()}`;
}

/**
 * Generate a group ID with prefix
 */
export function generateGroupId(): string {
  return `group_${uuidv4()}`;
}

/**
 * Generate an agent ID with prefix
 */
export function generateAgentId(): string {
  return `agent_${uuidv4()}`;
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Calculate priority score for job scheduling
 * Higher score = higher priority
 */
export function calculatePriorityScore(priority: number, createdAt: Date): number {
  const ageMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60);
  const ageFactor = Math.min(ageMinutes / 60, 5); // Max 5 points for age
  return priority * 10 + ageFactor;
}

/**
 * Validate job payload
 */
export function validateJobPayload(payload: any): string[] {
  const errors: string[] = [];

  if (!payload.org_id || typeof payload.org_id !== 'string') {
    errors.push('org_id is required and must be a string');
  }

  if (!payload.app_version_id || typeof payload.app_version_id !== 'string') {
    errors.push('app_version_id is required and must be a string');
  }

  if (!payload.test_path || typeof payload.test_path !== 'string') {
    errors.push('test_path is required and must be a string');
  }

  if (typeof payload.priority !== 'number' || payload.priority < 1 || payload.priority > 10) {
    errors.push('priority must be a number between 1 and 10');
  }

  if (!['emulator', 'device', 'browserstack'].includes(payload.target)) {
    errors.push('target must be one of: emulator, device, browserstack');
  }

  return errors;
}

/**
 * Create a retry delay with exponential backoff
 */
export function calculateRetryDelay(attempt: number, baseDelay: number = 1000): number {
  return Math.min(baseDelay * Math.pow(2, attempt), 30000); // Max 30 seconds
}

/**
 * Check if an agent is compatible with a job target
 */
export function isAgentCompatible(agentCapabilities: any[], jobTarget: string): boolean {
  return agentCapabilities.some(cap => cap.target === jobTarget);
}

/**
 * Get environment variable with default value
 */
export function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

/**
 * Get environment variable as number
 */
export function getEnvNumber(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${name} is required`);
  }
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }
  return num;
}

/**
 * Get environment variable as boolean
 */
export function getEnvBoolean(name: string, defaultValue?: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${name} is required`);
  }
  return value.toLowerCase() === 'true';
}

/**
 * Sanitize string for logging
 */
export function sanitizeForLog(str: string): string {
  return str.replace(/[\r\n\t]/g, ' ').slice(0, 200);
}

/**
 * Create a deep copy of an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if a string is a valid UUID
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Chunk an array into smaller arrays
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Create a timeout promise
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    )
  ]);
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts - 1) {
        throw lastError;
      }

      const delay = calculateRetryDelay(attempt, baseDelay);
      await sleep(delay);
    }
  }

  throw lastError!;
}
