import { createClient, RedisClientType } from 'redis';
import { log } from '../../shared/logger';
import { getEnvVar } from '../../shared/utils';

export class RedisClient {
  private client: RedisClientType;

  constructor() {
    this.client = createClient({
      url: getEnvVar('REDIS_URL', 'redis://localhost:6379')
    });

    this.client.on('error', (error) => {
      log.error('Redis client error', { error });
    });

    this.client.on('connect', () => {
      log.info('Redis client connected');
    });

    this.client.on('disconnect', () => {
      log.info('Redis client disconnected');
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  // Queue operations
  async pushToQueue(queueName: string, item: any): Promise<void> {
    await this.client.lPush(queueName, JSON.stringify(item));
  }

  async popFromQueue(queueName: string): Promise<any | null> {
    const item = await this.client.rPop(queueName);
    return item ? JSON.parse(item) : null;
  }

  async popFromQueueBlocking(queueName: string, timeout: number = 0): Promise<any | null> {
    const result = await this.client.brPop(queueName, timeout);
    return result ? JSON.parse(result.element) : null;
  }

  async getQueueLength(queueName: string): Promise<number> {
    return await this.client.lLen(queueName);
  }

  async clearQueue(queueName: string): Promise<void> {
    await this.client.del(queueName);
  }

  // Priority queue operations (using sorted sets)
  async addToPriorityQueue(queueName: string, item: any, priority: number): Promise<void> {
    await this.client.zAdd(queueName, {
      score: priority,
      value: JSON.stringify(item)
    });
  }

  async popFromPriorityQueue(queueName: string): Promise<any | null> {
    const result = await this.client.zPopMax(queueName);
    return result ? JSON.parse(result.value) : null;
  }

  async getPriorityQueueLength(queueName: string): Promise<number> {
    return await this.client.zCard(queueName);
  }

  // Set operations
  async addToSet(setName: string, member: string): Promise<void> {
    await this.client.sAdd(setName, member);
  }

  async removeFromSet(setName: string, member: string): Promise<void> {
    await this.client.sRem(setName, member);
  }

  async isInSet(setName: string, member: string): Promise<boolean> {
    return await this.client.sIsMember(setName, member);
  }

  async getSetMembers(setName: string): Promise<string[]> {
    return await this.client.sMembers(setName);
  }

  // Hash operations
  async setHash(hashName: string, field: string, value: any): Promise<void> {
    await this.client.hSet(hashName, field, JSON.stringify(value));
  }

  async getHash(hashName: string, field: string): Promise<any | null> {
    const value = await this.client.hGet(hashName, field);
    return value ? JSON.parse(value) : null;
  }

  async getAllHash(hashName: string): Promise<Record<string, any>> {
    const hash = await this.client.hGetAll(hashName);
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(hash)) {
      result[key] = JSON.parse(value);
    }
    return result;
  }

  async deleteHash(hashName: string, field?: string): Promise<void> {
    if (field) {
      await this.client.hDel(hashName, field);
    } else {
      await this.client.del(hashName);
    }
  }

  // Key operations
  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setEx(key, ttl, JSON.stringify(value));
    } else {
      await this.client.set(key, JSON.stringify(value));
    }
  }

  async get(key: string): Promise<any | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  // Lock operations (for distributed locking)
  async acquireLock(lockKey: string, ttl: number = 10): Promise<boolean> {
    const result = await this.client.set(lockKey, 'locked', {
      EX: ttl,
      NX: true
    });
    return result === 'OK';
  }

  async releaseLock(lockKey: string): Promise<void> {
    await this.client.del(lockKey);
  }

  // Pub/Sub operations
  async publish(channel: string, message: any): Promise<void> {
    await this.client.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    const subscriber = this.client.duplicate();
    await subscriber.connect();
    
    await subscriber.subscribe(channel, (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        callback(parsedMessage);
      } catch (error) {
        log.error('Error parsing pub/sub message', { error, message });
      }
    });
  }

  // Utility methods
  async ping(): Promise<string> {
    return await this.client.ping();
  }

  async flushAll(): Promise<void> {
    await this.client.flushAll();
  }

  async getInfo(): Promise<string> {
    return await this.client.info();
  }

  getClient(): RedisClientType {
    return this.client;
  }
}
