// Simple test server for CLI testing
const express = require('express');
const cors = require('cors');

const app = express();
const port = 3001; // Using port 3001 to avoid conflicts

app.use(cors());
app.use(express.json());

// Root route for browser access - this fixes the 404 error!
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>QualGen Test Server</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #2c3e50; }
            .endpoint { background: #ecf0f1; padding: 15px; margin: 10px 0; border-radius: 5px; }
            .method { font-weight: bold; color: #e74c3c; }
            .path { font-family: monospace; color: #2980b9; }
            .jobs { background: #d5f4e6; padding: 15px; border-radius: 5px; margin: 20px 0; }
            pre { background: #2c3e50; color: white; padding: 15px; border-radius: 5px; overflow-x: auto; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 QualGen Test Server</h1>
            <p>Server is running successfully on <strong>http://localhost:3000</strong></p>
            
            <div class="jobs">
                <h3>📊 Current Status</h3>
                <p><strong>Jobs Created:</strong> ${Array.from(jobs.values()).length}</p>
                <p><strong>Server Started:</strong> ${new Date().toLocaleString()}</p>
            </div>

            <h3>📋 Available API Endpoints</h3>
            
            <div class="endpoint">
                <span class="method">POST</span> <span class="path">/api/jobs</span><br>
                Submit a new test job
            </div>
            
            <div class="endpoint">
                <span class="method">GET</span> <span class="path">/api/jobs/:id</span><br>
                Get job status by ID
            </div>
            
            <div class="endpoint">
                <span class="method">GET</span> <span class="path">/api/jobs</span><br>
                List all jobs with pagination
            </div>
            
            <div class="endpoint">
                <span class="method">DELETE</span> <span class="path">/api/jobs/:id</span><br>
                Cancel a job by ID
            </div>
            
            <div class="endpoint">
                <span class="method">GET</span> <span class="path">/health</span><br>
                Server health check
            </div>

            <h3>🛠️ CLI Usage Examples</h3>
            <pre>
# Submit a job
npx ts-node src/cli/index.ts submit --org-id test-org --app-version-id v1.0.0 --test-path ./tests --priority 5 --target emulator

# Check job status  
npx ts-node src/cli/index.ts status --job-id job-1

# List all jobs
npx ts-node src/cli/index.ts list
            </pre>

            <h3>🌐 Test API Endpoints</h3>
            <p>
                <a href="/health" target="_blank">Health Check</a> | 
                <a href="/api/jobs" target="_blank">List Jobs</a>
            </p>
        </div>
    </body>
    </html>
  `);
});

// Root route for browser access
app.get('/', (req, res) => {
  res.json({
    message: '🚀 QualGen Test Server is running!',
    endpoints: {
      'POST /api/jobs': 'Submit a job',
      'GET /api/jobs/:id': 'Get job status', 
      'GET /api/jobs': 'List jobs',
      'DELETE /api/jobs/:id': 'Cancel job',
      'GET /health': 'Health check'
    },
    jobs: Array.from(jobs.values()).length,
    timestamp: new Date().toISOString()
  });
});

// Mock job storage
const jobs = new Map();
let jobCounter = 1;

// Submit job endpoint
app.post('/api/jobs', (req, res) => {
  const job = {
    id: `job-${jobCounter++}`,
    ...req.body,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  jobs.set(job.id, job);
  
  console.log('Job created:', job);
  res.status(201).json(job);
});

// Get job status endpoint
app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  console.log('Job status requested:', job);
  res.json(job);
});

// List jobs endpoint
app.get('/api/jobs', (req, res) => {
  const jobsArray = Array.from(jobs.values());
  const { limit = 50, offset = 0 } = req.query;
  
  const paginatedJobs = jobsArray.slice(
    parseInt(offset) || 0, 
    (parseInt(offset) || 0) + (parseInt(limit) || 50)
  );
  
  console.log(`Listed ${paginatedJobs.length} jobs`);
  res.json({
    jobs: paginatedJobs,
    total: jobsArray.length,
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  });
});

// Cancel job endpoint  
app.delete('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  job.status = 'cancelled';
  job.updated_at = new Date().toISOString();
  jobs.set(job.id, job);
  
  console.log('Job cancelled:', job);
  res.json({ message: 'Job cancelled successfully' });
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`🚀 Test server running on http://localhost:${port}`);
  console.log(`📊 Available endpoints:`);
  console.log(`  POST /api/jobs - Submit a job`);
  console.log(`  GET /api/jobs/:id - Get job status`);
  console.log(`  GET /api/jobs - List jobs`);
  console.log(`  DELETE /api/jobs/:id - Cancel job`);
  console.log(`  GET /health - Health check`);
});
