// Enhanced interactive test server for CLI testing
const express = require('express');
const cors = require('cors');

const app = express();
const port = 3001; // Using port 3001 to avoid conflicts

app.use(cors());
app.use(express.json());

// Mock job storage
const jobs = new Map();
let jobCounter = 6; // Start from 6 since we already have 5 jobs

// Root route for browser access - Interactive Dashboard
app.get('/', (req, res) => {
  const jobsArray = Array.from(jobs.values());
  const stats = {
    total: jobsArray.length,
    pending: jobsArray.filter(j => j.status === 'pending').length,
    running: jobsArray.filter(j => j.status === 'running').length,
    completed: jobsArray.filter(j => j.status === 'completed').length,
    failed: jobsArray.filter(j => j.status === 'failed').length,
    cancelled: jobsArray.filter(j => j.status === 'cancelled').length
  };

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🚀 QualGen Test Server</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; background: #f5f7fa; }
            .container { max-width: 1200px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 12px; margin-bottom: 2rem; }
            .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
            .status-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status-card h3 { margin: 0 0 0.5rem 0; color: #333; }
            .api-section { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); margin-bottom: 2rem; }
            .endpoint { background: #f8f9fa; padding: 1rem; margin: 0.5rem 0; border-radius: 6px; border-left: 4px solid #28a745; cursor: pointer; transition: all 0.3s; }
            .endpoint:hover { background: #e9ecef; transform: translateX(5px); }
            .method { font-weight: bold; color: #dc3545; }
            .method.get { color: #28a745; }
            .method.post { color: #007bff; }
            .method.delete { color: #dc3545; }
            pre { background: #2d3748; color: #e2e8f0; padding: 1rem; border-radius: 6px; overflow-x: auto; }
            .btn { background: #667eea; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; margin: 5px; transition: background 0.3s; }
            .btn:hover { background: #5a6fd8; }
            .btn.danger { background: #dc3545; }
            .btn.danger:hover { background: #c82333; }
            .result { background: #f8f9fa; padding: 1rem; border-radius: 6px; margin-top: 1rem; border: 1px solid #dee2e6; }
            .job-list { max-height: 400px; overflow-y: auto; }
            .job-item { background: #f8f9fa; padding: 1rem; margin: 0.5rem 0; border-radius: 6px; border-left: 4px solid #007bff; }
            input, select { padding: 8px; margin: 5px; border: 1px solid #ddd; border-radius: 4px; width: 200px; }
            label { display: inline-block; width: 120px; }
            .form-row { margin: 10px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🚀 QualGen Test Server</h1>
                <p>Interactive Dashboard</p>
            </div>

            <div class="status-grid">
                <div class="status-card">
                    <h3>📊 Current Status</h3>
                    <div>Jobs Created: <strong>${stats.total}</strong></div>
                    <div>Pending: <strong>${stats.pending}</strong></div>
                    <div>Running: <strong>${stats.running}</strong></div>
                    <div>Completed: <strong>${stats.completed}</strong></div>
                    <div>Failed: <strong>${stats.failed}</strong></div>
                    <div>Cancelled: <strong>${stats.cancelled}</strong></div>
                    <div>Server Started: <strong>${new Date().toLocaleString()}</strong></div>
                </div>
            </div>

            <div class="api-section">
                <h2>📋 Interactive API Testing</h2>
                
                <div class="endpoint" onclick="testHealthCheck()">
                    <span class="method get">GET</span> <code>/health</code><br>
                    Server health check - Click to test!
                </div>
                
                <div class="endpoint" onclick="listJobs()">
                    <span class="method get">GET</span> <code>/api/jobs</code><br>
                    List all jobs with pagination - Click to test!
                </div>
                
                <div class="endpoint" onclick="showSubmitForm()">
                    <span class="method post">POST</span> <code>/api/jobs</code><br>
                    Submit a new test job - Click to test!
                </div>

                <div id="result-area"></div>
            </div>

            <div class="api-section">
                <h2>📋 Current Jobs</h2>
                <button class="btn" onclick="refreshJobs()">🔄 Refresh Jobs</button>
                <div id="jobs-list" class="job-list">
                    ${jobsArray.map(job => `
                        <div class="job-item">
                            <strong>Job ID:</strong> ${job.id} | 
                            <strong>Status:</strong> ${job.status} | 
                            <strong>Org:</strong> ${job.org_id} | 
                            <strong>App:</strong> ${job.app_version_id}<br>
                            <strong>Target:</strong> ${job.target} | 
                            <strong>Priority:</strong> ${job.priority} | 
                            <strong>Created:</strong> ${new Date(job.created_at).toLocaleString()}
                            ${job.status !== 'cancelled' && job.status !== 'completed' ? 
                                `<button class="btn danger" onclick="cancelJob('${job.id}')">Cancel</button>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <script>
            function showResult(title, content, isError = false) {
                const resultArea = document.getElementById('result-area');
                resultArea.innerHTML = \`
                    <div class="result" style="border-left-color: \${isError ? '#dc3545' : '#28a745'}">
                        <h4>\${title}</h4>
                        <pre>\${JSON.stringify(content, null, 2)}</pre>
                    </div>
                \`;
            }

            async function testHealthCheck() {
                try {
                    const response = await fetch('/health');
                    const data = await response.json();
                    showResult('✅ Health Check Result', data);
                } catch (error) {
                    showResult('❌ Health Check Error', error.message, true);
                }
            }

            async function listJobs() {
                try {
                    const response = await fetch('/api/jobs');
                    const data = await response.json();
                    showResult('📋 Jobs List', data);
                } catch (error) {
                    showResult('❌ List Jobs Error', error.message, true);
                }
            }

            async function refreshJobs() {
                location.reload();
            }

            async function cancelJob(jobId) {
                if (!confirm(\`Are you sure you want to cancel job \${jobId}?\`)) return;
                
                try {
                    const response = await fetch(\`/api/jobs/\${jobId}\`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            reason: 'Cancelled via web interface'
                        })
                    });
                    const data = await response.json();
                    showResult(\`🗑️ Job \${jobId} Cancelled\`, data);
                    setTimeout(() => location.reload(), 2000);
                } catch (error) {
                    showResult('❌ Cancel Job Error', error.message, true);
                }
            }

            function showSubmitForm() {
                const resultArea = document.getElementById('result-area');
                resultArea.innerHTML = \`
                    <div class="result">
                        <h4>📝 Submit New Job</h4>
                        <form onsubmit="submitJob(event)">
                            <div class="form-row"><label>Org ID:</label><input type="text" name="org_id" value="demo-org" required></div>
                            <div class="form-row"><label>App Version:</label><input type="text" name="app_version_id" value="v1.0.0" required></div>
                            <div class="form-row"><label>Test Path:</label><input type="text" name="test_path" value="./tests/sample.js" required></div>
                            <div class="form-row"><label>Priority:</label><input type="number" name="priority" value="5" min="1" max="10" required></div>
                            <div class="form-row"><label>Target:</label>
                                <select name="target" required>
                                    <option value="emulator">Emulator</option>
                                    <option value="device">Device</option>
                                    <option value="browserstack">BrowserStack</option>
                                </select>
                            </div>
                            <button type="submit" class="btn">Submit Job</button>
                        </form>
                    </div>
                \`;
            }

            async function submitJob(event) {
                event.preventDefault();
                const formData = new FormData(event.target);
                const jobData = {
                    org_id: formData.get('org_id'),
                    app_version_id: formData.get('app_version_id'),
                    test_path: formData.get('test_path'),
                    priority: parseInt(formData.get('priority')),
                    target: formData.get('target')
                };

                try {
                    const response = await fetch('/api/jobs', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(jobData)
                    });
                    const data = await response.json();
                    showResult('✅ Job Submitted Successfully', data);
                    setTimeout(() => location.reload(), 2000);
                } catch (error) {
                    showResult('❌ Submit Job Error', error.message, true);
                }
            }
        </script>
    </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    jobs: Array.from(jobs.values()).length
  });
});

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
  const { limit = 50, offset = 0, org_id, status } = req.query;
  
  let filteredJobs = jobsArray;
  
  if (org_id) {
    filteredJobs = filteredJobs.filter(job => job.org_id === org_id);
  }
  
  if (status) {
    filteredJobs = filteredJobs.filter(job => job.status === status);
  }
  
  const paginatedJobs = filteredJobs.slice(
    parseInt(offset) || 0, 
    (parseInt(offset) || 0) + (parseInt(limit) || 50)
  );
  
  console.log(`Listed ${paginatedJobs.length} jobs`);
  res.json({
    jobs: paginatedJobs,
    total: filteredJobs.length,
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
  
  if (job.status === 'completed' || job.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot cancel a completed or already cancelled job' });
  }
  
  job.status = 'cancelled';
  job.updated_at = new Date().toISOString();
  job.cancelled_at = new Date().toISOString();
  
  if (req.body && req.body.reason) {
    job.cancellation_reason = req.body.reason;
  }
  
  jobs.set(job.id, job);
  
  console.log('Job cancelled:', job);
  res.json({ 
    message: 'Job cancelled successfully',
    job: job
  });
});

// Initialize with some sample jobs from our previous testing
jobs.set('job-1', {
  id: 'job-1',
  org_id: 'test-org',
  app_version_id: 'v1.0.0',
  test_path: './tests/sample.js',
  priority: 5,
  target: 'emulator',
  status: 'pending',
  created_at: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
  updated_at: new Date(Date.now() - 600000).toISOString()
});

jobs.set('job-2', {
  id: 'job-2',
  org_id: 'qualgen-test',
  app_version_id: 'v2.1.0',
  test_path: './tests/appwright/login.spec.js',
  priority: 7,
  target: 'browserstack',
  status: 'cancelled',
  created_at: new Date(Date.now() - 480000).toISOString(), // 8 minutes ago
  updated_at: new Date(Date.now() - 60000).toISOString(),
  cancelled_at: new Date(Date.now() - 60000).toISOString(),
  cancellation_reason: 'Demo cancellation for testing'
});

jobs.set('job-3', {
  id: 'job-3',
  org_id: 'demo-org',
  app_version_id: 'v3.0.0',
  test_path: './tests/ui/navigation.spec.js',
  priority: 6,
  target: 'emulator',
  status: 'pending',
  created_at: new Date(Date.now() - 360000).toISOString(), // 6 minutes ago
  updated_at: new Date(Date.now() - 360000).toISOString()
});

jobs.set('job-4', {
  id: 'job-4',
  org_id: 'demo-org',
  app_version_id: 'v3.0.0',
  test_path: './tests/ui/login.spec.js',
  priority: 8,
  target: 'emulator',
  status: 'pending',
  created_at: new Date(Date.now() - 240000).toISOString(), // 4 minutes ago
  updated_at: new Date(Date.now() - 240000).toISOString()
});

jobs.set('job-5', {
  id: 'job-5',
  org_id: 'demo-org',
  app_version_id: 'v3.0.0',
  test_path: './tests/ui/checkout.spec.js',
  priority: 4,
  target: 'emulator',
  status: 'pending',
  created_at: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
  updated_at: new Date(Date.now() - 120000).toISOString()
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
