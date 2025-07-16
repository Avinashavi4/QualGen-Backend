/**
 * BrowserStack-like Test Execution Server
 * Shows real video playback and device testing like your BrowserStack example
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const RealAppWrightExecutor = require('./real-appwright-executor');

class BrowserStackLikeServer {
  constructor(port = 3002) {
    this.app = express();
    this.port = port;
    this.executor = new RealAppWrightExecutor();
    this.sessions = new Map();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static('public'));
    
    // Serve video files
    this.app.use('/recordings', express.static('recordings'));
    this.app.use('/screenshots', express.static('screenshots'));
  }

  setupRoutes() {
    // Main BrowserStack-like interface
    this.app.get('/', (req, res) => {
      res.send(this.getBrowserStackInterface());
    });

    // Start a new test session
    this.app.post('/api/start-test', async (req, res) => {
      try {
        const { testName, appPath, devicePreference } = req.body;
        
        const sessionId = uuidv4();
        const config = {
          testName: testName || 'AppWright Test Execution',
          appPath: appPath || 'demo-app.apk',
          devicePreference: devicePreference || 'any'
        };

        this.sessions.set(sessionId, {
          sessionId,
          status: 'starting',
          startTime: new Date(),
          config
        });

        // Start real test execution
        const executionSession = await this.executor.startRealDeviceTest(config);
        
        // Update session with execution details
        this.sessions.set(sessionId, {
          ...this.sessions.get(sessionId),
          executionSession,
          device: executionSession.device
        });

        res.json({
          success: true,
          sessionId,
          message: 'Test execution started',
          device: executionSession.device
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get session status and details
    this.app.get('/api/session/:id', (req, res) => {
      const session = this.sessions.get(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const executionSession = this.executor.getSession(session.executionSession?.sessionId);
      
      res.json({
        sessionId: session.sessionId,
        status: executionSession?.status || session.status,
        device: session.device,
        startTime: session.startTime,
        endTime: executionSession?.endTime,
        logs: executionSession?.logs || [],
        videoPath: executionSession?.videoPath,
        screenshotPaths: executionSession?.screenshotPaths || [],
        duration: executionSession?.endTime ? 
          Math.round((executionSession.endTime - session.startTime) / 1000) : 
          Math.round((Date.now() - session.startTime.getTime()) / 1000)
      });
    });

    // Get session logs
    this.app.get('/api/session/:id/logs', (req, res) => {
      const session = this.sessions.get(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const executionSession = this.executor.getSession(session.executionSession?.sessionId);
      res.json({
        logs: executionSession?.logs || []
      });
    });
  }

  getBrowserStackInterface() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AppWright Test Execution - Real Device Testing</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8f9fa;
            color: #333;
        }
        .header {
            background: #2c3e50;
            color: white;
            padding: 1rem 2rem;
            display: flex;
            justify-content: between;
            align-items: center;
        }
        .header h1 { font-size: 1.5rem; }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        .test-info {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            margin-bottom: 2rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .test-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }
        .test-title { font-size: 1.25rem; font-weight: 600; }
        .status-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.875rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        .status-passed { background: #d4edda; color: #155724; }
        .status-running { background: #cce5ff; color: #004085; }
        .status-failed { background: #f8d7da; color: #721c24; }
        .device-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin: 1rem 0;
        }
        .device-detail {
            display: flex;
            justify-content: space-between;
            padding: 0.5rem 0;
            border-bottom: 1px solid #eee;
        }
        .device-detail:last-child { border-bottom: none; }
        .video-section {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            margin-bottom: 2rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .video-container {
            position: relative;
            background: #000;
            border-radius: 8px;
            overflow: hidden;
            aspect-ratio: 16/9;
            max-width: 800px;
            margin: 0 auto;
        }
        .video-player {
            width: 100%;
            height: 100%;
        }
        .video-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.7);
            color: white;
            font-size: 1.1rem;
        }
        .tabs {
            display: flex;
            border-bottom: 2px solid #e9ecef;
            margin-bottom: 1rem;
        }
        .tab {
            padding: 0.75rem 1.5rem;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 1rem;
            color: #666;
            border-bottom: 2px solid transparent;
        }
        .tab.active {
            color: #007bff;
            border-bottom-color: #007bff;
        }
        .tab-content {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .logs-container {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 1rem;
            max-height: 400px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
        }
        .log-entry {
            margin-bottom: 0.5rem;
            padding: 0.25rem;
        }
        .log-info { color: #17a2b8; }
        .log-error { color: #dc3545; }
        .log-warn { color: #ffc107; }
        .log-debug { color: #6c757d; }
        .start-test {
            background: #007bff;
            color: white;
            border: none;
            padding: 1rem 2rem;
            border-radius: 6px;
            font-size: 1rem;
            cursor: pointer;
            margin-bottom: 2rem;
        }
        .start-test:hover { background: #0056b3; }
        .start-test:disabled {
            background: #6c757d;
            cursor: not-allowed;
        }
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .screenshot-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 1rem;
        }
        .screenshot {
            border: 1px solid #dee2e6;
            border-radius: 4px;
            overflow: hidden;
        }
        .screenshot img {
            width: 100%;
            height: auto;
        }
        .device-capabilities {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
        }
        .capability-section h4 {
            margin-bottom: 0.5rem;
            color: #495057;
        }
        .capability-list {
            list-style: none;
            padding: 0;
        }
        .capability-list li {
            padding: 0.25rem 0;
            color: #6c757d;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 AppWright Test Execution - Real Device Testing</h1>
        <div style="color: #bdc3c7;">Real device testing with video recording</div>
    </div>

    <div class="container">
        <button id="startTest" class="start-test" onclick="startNewTest()">
            🎬 Start Real Device Test
        </button>

        <div id="testSession" style="display: none;">
            <div class="test-info">
                <div class="test-header">
                    <div class="test-title" id="testTitle">AppWright Test Execution on Real Device</div>
                    <span id="statusBadge" class="status-badge status-running">Running</span>
                </div>
                
                <div class="device-info">
                    <div class="device-detail">
                        <span><strong>OS:</strong></span>
                        <span id="deviceOS">Android 14.0</span>
                    </div>
                    <div class="device-detail">
                        <span><strong>Device:</strong></span>
                        <span id="deviceModel">Google Pixel 8</span>
                    </div>
                    <div class="device-detail">
                        <span><strong>Duration:</strong></span>
                        <span id="testDuration">0s</span>
                    </div>
                    <div class="device-detail">
                        <span><strong>Status:</strong></span>
                        <span id="testStatus">RUNNING</span>
                    </div>
                    <div class="device-detail">
                        <span><strong>Started At:</strong></span>
                        <span id="startTime">-</span>
                    </div>
                    <div class="device-detail">
                        <span><strong>Session ID:</strong></span>
                        <span id="sessionId">-</span>
                    </div>
                </div>
            </div>

            <div class="video-section">
                <h3>📱 Live Device Execution</h3>
                <div class="video-container">
                    <video id="testVideo" class="video-player" controls style="display: none;">
                        <source src="" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                    <div id="videoOverlay" class="video-overlay">
                        <div style="text-align: center;">
                            <div class="loading"></div>
                            <div style="margin-top: 1rem;">🎥 Recording test execution...</div>
                            <div style="margin-top: 0.5rem; font-size: 0.9rem; opacity: 0.8;">Video will be available when test completes</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="tabs">
                <button class="tab active" onclick="showTab('logs')">Live Logs</button>
                <button class="tab" onclick="showTab('app')">App Details</button>
                <button class="tab" onclick="showTab('capabilities')">Device Info</button>
                <button class="tab" onclick="showTab('screenshots')">Screenshots</button>
            </div>

            <div class="tab-content">
                <div id="logsTab">
                    <h4>🔍 Live Test Execution Logs</h4>
                    <div id="logsContainer" class="logs-container">
                        <div class="log-entry log-info">[INFO] Initializing test session...</div>
                    </div>
                </div>

                <div id="appTab" style="display: none;">
                    <h4>📱 Application Details</h4>
                    <div class="device-info">
                        <div class="device-detail">
                            <span><strong>App Name:</strong></span>
                            <span>AppWright Test App</span>
                        </div>
                        <div class="device-detail">
                            <span><strong>Package:</strong></span>
                            <span>com.qualgen.appwright</span>
                        </div>
                        <div class="device-detail">
                            <span><strong>Version:</strong></span>
                            <span>1.0.0</span>
                        </div>
                    </div>
                </div>

                <div id="capabilitiesTab" style="display: none;">
                    <h4>🔧 Device Capabilities</h4>
                    <div class="device-capabilities">
                        <div class="capability-section">
                            <h4>Input Capabilities</h4>
                            <ul class="capability-list">
                                <li>Touch interactions</li>
                                <li>Keyboard input</li>
                                <li>Gesture recognition</li>
                                <li>Multi-touch support</li>
                            </ul>
                        </div>
                        <div class="capability-section">
                            <h4>Device Features</h4>
                            <ul class="capability-list">
                                <li>Video recording</li>
                                <li>Screenshot capture</li>
                                <li>Real-time monitoring</li>
                                <li>Network simulation</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div id="screenshotsTab" style="display: none;">
                    <h4>📸 Test Screenshots</h4>
                    <div id="screenshotGrid" class="screenshot-grid">
                        <p>Screenshots will appear here during test execution...</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentSessionId = null;
        let refreshInterval = null;

        function showTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('[id$="Tab"]').forEach(content => content.style.display = 'none');
            
            // Show selected tab
            event.target.classList.add('active');
            document.getElementById(tabName + 'Tab').style.display = 'block';
        }

        async function startNewTest() {
            const button = document.getElementById('startTest');
            button.disabled = true;
            button.innerHTML = '<span class="loading"></span> Starting Real Device Test...';

            try {
                const response = await fetch('/api/start-test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        testName: 'AppWright Real Device Test',
                        appPath: 'demo-app.apk',
                        devicePreference: 'android'
                    })
                });

                const result = await response.json();
                
                if (result.success) {
                    currentSessionId = result.sessionId;
                    document.getElementById('testSession').style.display = 'block';
                    document.getElementById('sessionId').textContent = result.sessionId;
                    
                    if (result.device) {
                        document.getElementById('deviceOS').textContent = \`\${result.device.platform} \${result.device.version}\`;
                        document.getElementById('deviceModel').textContent = result.device.model || result.device.id;
                    }
                    
                    document.getElementById('startTime').textContent = new Date().toLocaleString();
                    
                    // Start monitoring
                    refreshInterval = setInterval(updateSessionStatus, 2000);
                    
                    button.innerHTML = '✅ Test Started';
                } else {
                    alert('Failed to start test: ' + result.error);
                    button.disabled = false;
                    button.innerHTML = '🎬 Start Real Device Test';
                }
            } catch (error) {
                alert('Error starting test: ' + error.message);
                button.disabled = false;
                button.innerHTML = '🎬 Start Real Device Test';
            }
        }

        async function updateSessionStatus() {
            if (!currentSessionId) return;

            try {
                const response = await fetch(\`/api/session/\${currentSessionId}\`);
                const session = await response.json();

                // Update status
                document.getElementById('testStatus').textContent = session.status.toUpperCase();
                document.getElementById('testDuration').textContent = session.duration + 's';
                
                // Update status badge
                const badge = document.getElementById('statusBadge');
                badge.className = 'status-badge';
                if (session.status === 'completed') {
                    badge.classList.add('status-passed');
                    badge.textContent = 'Passed';
                } else if (session.status === 'failed') {
                    badge.classList.add('status-failed');
                    badge.textContent = 'Failed';
                } else {
                    badge.classList.add('status-running');
                    badge.textContent = 'Running';
                }

                // Update logs
                const logsContainer = document.getElementById('logsContainer');
                if (session.logs && session.logs.length > 0) {
                    logsContainer.innerHTML = session.logs.map(log => 
                        \`<div class="log-entry log-\${log.level}">[\${log.level.toUpperCase()}] \${log.message}</div>\`
                    ).join('');
                    logsContainer.scrollTop = logsContainer.scrollHeight;
                }

                // Show video when available
                if (session.status === 'completed' && session.videoPath) {
                    document.getElementById('videoOverlay').style.display = 'none';
                    const video = document.getElementById('testVideo');
                    video.src = '/' + session.videoPath;
                    video.style.display = 'block';
                }

                // Update screenshots
                if (session.screenshotPaths && session.screenshotPaths.length > 0) {
                    const grid = document.getElementById('screenshotGrid');
                    grid.innerHTML = session.screenshotPaths.map((path, index) => 
                        \`<div class="screenshot">
                            <img src="/\${path}" alt="Screenshot \${index + 1}" />
                        </div>\`
                    ).join('');
                }

                // Stop refreshing when test is complete
                if (session.status === 'completed' || session.status === 'failed') {
                    clearInterval(refreshInterval);
                    document.getElementById('startTest').disabled = false;
                    document.getElementById('startTest').innerHTML = '🎬 Start New Test';
                }

            } catch (error) {
                console.error('Error updating session:', error);
            }
        }
    </script>
</body>
</html>`;
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`🎬 BrowserStack-like Test Server running on http://localhost:${this.port}`);
      console.log(`📱 Real device testing with video recording like your BrowserStack example`);
      console.log(`🎯 Features:`);
      console.log(`   ✅ Real Android device/emulator support`);
      console.log(`   ✅ Live video recording during tests`);
      console.log(`   ✅ Real-time logs and monitoring`);
      console.log(`   ✅ Screenshot capture`);
      console.log(`   ✅ BrowserStack-like interface`);
      console.log(``);
      console.log(`💡 Visit http://localhost:${this.port} to see the REAL implementation!`);
    });
  }
}

const server = new BrowserStackLikeServer();
server.start();
