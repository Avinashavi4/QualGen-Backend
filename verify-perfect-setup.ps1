# QualGen Local Verification Script
# Run this before triggering GitHub Actions to ensure everything works perfectly

Write-Host "🔍 QualGen Local Verification" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

# Function to check if command exists
function Test-Command {
    param($Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

if (Test-Command "node") {
    $nodeVersion = node --version
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "❌ Node.js not found" -ForegroundColor Red
    exit 1
}

if (Test-Command "npm") {
    $npmVersion = npm --version
    Write-Host "✅ NPM: $npmVersion" -ForegroundColor Green
} else {
    Write-Host "❌ NPM not found" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm ci --silent
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dependencies installed" -ForegroundColor Green

# Build project
Write-Host "🏗️ Building project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Project built successfully" -ForegroundColor Green

# Install CLI globally
Write-Host "🛠️ Installing CLI globally..." -ForegroundColor Yellow
npm link
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ CLI installation failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ CLI installed globally" -ForegroundColor Green

# Verify CLI
Write-Host "🔍 Verifying CLI installation..." -ForegroundColor Yellow
qgjob --help | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ CLI verification failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ CLI working correctly" -ForegroundColor Green

# Start server in background
Write-Host "🚀 Starting test server..." -ForegroundColor Yellow
$serverProcess = Start-Process -FilePath "node" -ArgumentList "test-server-enhanced.js" -PassThru -NoNewWindow
Start-Sleep -Seconds 3

# Check server health
Write-Host "🏥 Checking server health..." -ForegroundColor Yellow
$maxAttempts = 10
for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Server is healthy" -ForegroundColor Green
            break
        }
    } catch {
        if ($i -eq $maxAttempts) {
            Write-Host "❌ Server health check failed" -ForegroundColor Red
            Stop-Process -Id $serverProcess.Id -Force
            exit 1
        }
        Write-Host "  Attempt $i/$maxAttempts..." -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

# Test CLI commands
Write-Host "📝 Testing CLI commands..." -ForegroundColor Yellow

# Submit job
$jobOutput = qgjob submit --org-id="test-org" --app-version-id="test-app" --test-path="./test.js" --priority=5 --target="emulator" --server-url="http://localhost:3001" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Job submission failed: $jobOutput" -ForegroundColor Red
    Stop-Process -Id $serverProcess.Id -Force
    exit 1
}

# Extract job ID
$jobId = [regex]::Match($jobOutput, 'job-[a-f0-9-]+').Value
if (-not $jobId) {
    Write-Host "❌ Failed to extract job ID from: $jobOutput" -ForegroundColor Red
    Stop-Process -Id $serverProcess.Id -Force
    exit 1
}
Write-Host "✅ Job submitted: $jobId" -ForegroundColor Green

# Check status
$statusOutput = qgjob status --job-id="$jobId" --server-url="http://localhost:3001" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Status check failed: $statusOutput" -ForegroundColor Red
    Stop-Process -Id $serverProcess.Id -Force
    exit 1
}
Write-Host "✅ Status check successful" -ForegroundColor Green

# List jobs
$listOutput = qgjob list --org-id="test-org" --server-url="http://localhost:3001" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ List command failed: $listOutput" -ForegroundColor Red
    Stop-Process -Id $serverProcess.Id -Force
    exit 1
}
Write-Host "✅ List command successful" -ForegroundColor Green

# Cleanup
Write-Host "🧹 Cleaning up..." -ForegroundColor Yellow
Stop-Process -Id $serverProcess.Id -Force
Write-Host "✅ Server stopped" -ForegroundColor Green

Write-Host ""
Write-Host "🎉 LOCAL VERIFICATION COMPLETE - ALL SYSTEMS GO!" -ForegroundColor Green
Write-Host "✅ Ready for GitHub Actions workflow" -ForegroundColor Green
Write-Host "✅ Ready for demo video recording" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Run './trigger-clean-demo.ps1' to trigger perfect GitHub Actions demo" -ForegroundColor Cyan
