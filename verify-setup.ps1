# QualGen Local Verification Script
# Run this before triggering GitHub Actions to ensure everything works perfectly

Write-Host "QualGen Local Verification" -ForegroundColor Cyan
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
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

if (Test-Command "node") {
    $nodeVersion = node --version
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "Node.js not found" -ForegroundColor Red
    exit 1
}

if (Test-Command "npm") {
    $npmVersion = npm --version
    Write-Host "NPM: $npmVersion" -ForegroundColor Green
} else {
    Write-Host "NPM not found" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm ci --silent
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "Dependencies installed" -ForegroundColor Green

# Build project
Write-Host "Building project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "Project built successfully" -ForegroundColor Green

# Install CLI globally
Write-Host "Installing CLI globally..." -ForegroundColor Yellow
npm link
if ($LASTEXITCODE -ne 0) {
    Write-Host "CLI installation failed" -ForegroundColor Red
    exit 1
}
Write-Host "CLI installed globally" -ForegroundColor Green

# Verify CLI
Write-Host "Verifying CLI installation..." -ForegroundColor Yellow
qgjob --help | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "CLI verification failed" -ForegroundColor Red
    exit 1
}
Write-Host "CLI working correctly" -ForegroundColor Green

Write-Host ""
Write-Host "LOCAL VERIFICATION COMPLETE - ALL SYSTEMS GO!" -ForegroundColor Green
Write-Host "Ready for GitHub Actions workflow" -ForegroundColor Green
Write-Host "Ready for demo video recording" -ForegroundColor Green
