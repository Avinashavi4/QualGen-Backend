import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { log } from '../shared/logger';
import { getEnvVar, getEnvNumber } from '../shared/utils';
import { errorHandler } from './middleware/errorHandler';
import { jobRoutes } from './routes/jobs';
import { createAgentsRouter } from './routes/agents';
import { healthRoutes } from './routes/health';
import { Database } from './database/database';
import { RedisClient } from './services/redis';
import { JobScheduler } from './services/scheduler';
import { JobProcessor } from './services/processor';

// Load environment variables
dotenv.config();

export class Server {
  private app: express.Application;
  private database: Database;
  private redis: RedisClient;
  private scheduler: JobScheduler;
  private processor: JobProcessor;

  constructor() {
    this.app = express();
    this.database = new Database();
    this.redis = new RedisClient();
    this.scheduler = new JobScheduler(this.database, this.redis);
    this.processor = new JobProcessor(this.database, this.redis);
  }

  async initialize(): Promise<void> {
    try {
      log.info('Initializing QualGen Server...');

      // Initialize database
      await this.database.connect();
      await this.database.migrate();

      // Initialize Redis
      await this.redis.connect();

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup error handling
      this.setupErrorHandling();

      // Start background services
      await this.startBackgroundServices();

      log.info('Server initialization completed');
    } catch (error) {
      log.error('Failed to initialize server', { error });
      throw error;
    }
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors());
    
    // Performance middleware
    this.app.use(compression());
    
    // Logging middleware
    this.app.use(morgan('combined'));
    
    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      log.http(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  private setupRoutes(): void {
    // API routes
    this.app.use('/api/jobs', jobRoutes(this.database, this.redis, this.scheduler));
    this.app.use('/api/agents', createAgentsRouter(this.database, this.redis));
    this.app.use('/api/health', healthRoutes(this.database, this.redis));

    // Root route
    this.app.get('/', (req, res) => {
      res.json({
        message: 'QualGen Job Orchestrator API',
        version: '1.0.0',
        status: 'running'
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  private async startBackgroundServices(): Promise<void> {
    log.info('Starting background services...');
    
    // Start job scheduler
    await this.scheduler.start();
    
    // Start job processor
    await this.processor.start();

    log.info('Background services started');
  }

  async start(): Promise<void> {
    const port = getEnvNumber('PORT', 3000);
    const host = getEnvVar('HOST', '0.0.0.0');

    this.app.listen(port, host, () => {
      log.info(`Server started on ${host}:${port}`);
    });
  }

  async shutdown(): Promise<void> {
    log.info('Shutting down server...');

    try {
      // Stop background services
      await this.scheduler.stop();
      await this.processor.stop();

      // Close database connections
      await this.database.disconnect();
      await this.redis.disconnect();

      log.info('Server shutdown completed');
    } catch (error) {
      log.error('Error during server shutdown', { error });
      throw error;
    }
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new Server();

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await server.shutdown();
      process.exit(0);
    } catch (error) {
      log.error('Error during shutdown', { error });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start the server
  server.initialize()
    .then(() => server.start())
    .catch((error) => {
      log.error('Failed to start server', { error });
      process.exit(1);
    });
}
