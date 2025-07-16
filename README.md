# QualGen Backend Coding Challenge

A comprehensive test orchestration platform that queues, groups, and deploys AppWright tests across local devices, emulators, and BrowserStack.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GitHub CI     │    │   CLI Tool      │    │   Test Agents   │
│                 │    │   (qgjob)       │    │                 │
│                 │────▶                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       ▲
                                │                       │
                                ▼                       │
                       ┌─────────────────┐              │
                       │  Job Server     │              │
                       │  (Orchestrator) │              │
                       │                 │──────────────┘
                       └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   PostgreSQL    │
                       │   + Redis       │
                       │                 │
                       └─────────────────┘
```

## Key Features

- **Job Grouping**: Automatically groups tests by `app_version_id` to minimize app installations
- **Multi-target Support**: Supports emulator, device, and BrowserStack targets
- **Priority Handling**: Prioritizes jobs within organizations
- **Fault Tolerance**: Includes retry logic and crash recovery
- **Horizontal Scaling**: Designed for multiple organizations and parallel execution
- **Real-time Status**: Track job progress and completion status

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Git

### Setup

1. **Clone and setup the project:**
```bash
git clone <repository-url>
cd QualGen
npm install
```

2. **Start the infrastructure:**
```bash
docker-compose up -d
```

3. **Initialize the database:**
```bash
npm run db:migrate
```

4. **Start the job server:**
```bash
npm run start:server
```

5. **Install CLI tool globally:**
```bash
npm run build:cli
npm link
```

## Usage

### CLI Commands

#### Submit a test job:
```bash
qgjob submit \
  --org-id "org-123" \
  --app-version-id "v1.2.3" \
  --test-path "./tests/login.spec.js" \
  --priority 5 \
  --target "emulator"
```

#### Check job status:
```bash
qgjob status --job-id "job-abc123"
```

#### List all jobs for an organization:
```bash
qgjob list --org-id "org-123"
```

### GitHub Actions Integration

Add this workflow to `.github/workflows/test.yml`:

```yaml
name: Run AppWright Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm install
        
      - name: Install qgjob CLI
        run: |
          npm run build:cli
          npm link
          
      - name: Submit test job
        run: |
          qgjob submit \
            --org-id "${{ github.repository_owner }}" \
            --app-version-id "${{ github.sha }}" \
            --test-path "./tests/**/*.spec.js" \
            --priority 5 \
            --target "emulator" \
            --server-url "${{ secrets.QGJOB_SERVER_URL }}"
```

## Job Scheduling & Grouping Logic

### Grouping Strategy
1. **Primary Grouping**: Jobs are grouped by `app_version_id`
2. **Secondary Grouping**: Within each app version, jobs are sub-grouped by `target` type
3. **Device Assignment**: Groups are assigned to available agents based on target compatibility

### Scheduling Algorithm
1. **Priority Queue**: Jobs are prioritized within each organization
2. **Round Robin**: Fair distribution across organizations
3. **Batch Processing**: Groups of jobs with same `app_version_id` are processed together
4. **Load Balancing**: Distributes workload across available agents

### Example Workflow
```
Submit Jobs:
├── org-123, app-v1.0, emulator, priority-5
├── org-123, app-v1.0, emulator, priority-3
├── org-456, app-v2.0, device, priority-4
└── org-123, app-v1.1, browserstack, priority-5

Grouping Result:
├── Group-1: [org-123, app-v1.0, emulator] → Agent-1
├── Group-2: [org-456, app-v2.0, device] → Agent-2
└── Group-3: [org-123, app-v1.1, browserstack] → Agent-3
```

## API Endpoints

### Job Management
- `POST /api/jobs` - Submit a new job
- `GET /api/jobs/:id` - Get job status
- `GET /api/jobs` - List jobs (with filters)
- `PUT /api/jobs/:id/status` - Update job status

### Agent Management
- `POST /api/agents/register` - Register a new agent
- `GET /api/agents` - List available agents
- `POST /api/agents/:id/heartbeat` - Agent heartbeat

### Monitoring
- `GET /api/health` - Health check
- `GET /api/metrics` - System metrics

## Development

### Project Structure
```
QualGen/
├── src/
│   ├── cli/           # CLI tool implementation
│   ├── server/        # Job orchestrator server
│   ├── shared/        # Shared types and utilities
│   └── agents/        # Test agent implementations
├── tests/             # Test suites
├── docker/            # Docker configurations
├── .github/           # GitHub Actions workflows
└── docs/              # Additional documentation
```

### Running Tests
```bash
npm test                 # Run all tests
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests only
npm run test:e2e        # End-to-end tests
```

### Building
```bash
npm run build          # Build all components
npm run build:server   # Build server only
npm run build:cli      # Build CLI only
```

## Configuration

### Environment Variables
```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/qualgen
REDIS_URL=redis://localhost:6379

# Job Processing
MAX_CONCURRENT_JOBS=10
JOB_TIMEOUT_MS=300000
RETRY_ATTEMPTS=3

# Agent Configuration
AGENT_HEARTBEAT_INTERVAL=30000
AGENT_TIMEOUT_MS=60000
```

## Monitoring & Observability

### Metrics Available
- Job submission rate
- Job completion rate
- Job failure rate
- Agent availability
- Queue depth
- Processing latency

### Logging
Structured JSON logging with configurable levels. Logs include:
- Request/response cycles
- Job state transitions
- Agent communications
- Error conditions

## Deployment

### Production Deployment
```bash
# Using Docker Compose
docker-compose -f docker-compose.prod.yml up -d

# Using Kubernetes
kubectl apply -f k8s/
```

### Scaling Considerations
- **Horizontal Scaling**: Multiple server instances behind a load balancer
- **Database Scaling**: Read replicas for job status queries
- **Queue Scaling**: Redis Cluster for high throughput
- **Agent Scaling**: Auto-scaling groups for dynamic capacity

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details
