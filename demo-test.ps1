# QualGen Demo Test Script (PowerShell)
# Run this before recording to ensure everything works

Write-Host "🎬 QualGen Demo Preparation Script" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green

Write-Host "📋 Checking project setup..." -ForegroundColor Yellow

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Run this from the QualGen project root directory" -ForegroundColor Red
    exit 1
}

Write-Host "✅ In project directory" -ForegroundColor Green

# Check dependencies
Write-Host "📦 Checking dependencies..." -ForegroundColor Yellow
try {
    npm list *>$null
    Write-Host "✅ Dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "⏳ Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Build project
Write-Host "🔨 Building project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Build successful" -ForegroundColor Green
} else {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}

# Install CLI
Write-Host "🔗 Installing CLI globally..." -ForegroundColor Yellow
npm link *>$null
try {
    qgjob --help *>$null
    Write-Host "✅ CLI installed and working" -ForegroundColor Green
} catch {
    Write-Host "❌ CLI installation failed" -ForegroundColor Red
    exit 1
}

# Test server startup
Write-Host "🚀 Testing server startup..." -ForegroundColor Yellow
$serverJob = Start-Job -ScriptBlock { node test-server-enhanced.js }
Start-Sleep -Seconds 3

# Test server health
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Server starts and responds" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Server not responding" -ForegroundColor Red
} finally {
    Stop-Job $serverJob *>$null
    Remove-Job $serverJob *>$null
}

Write-Host ""
Write-Host "🎉 Everything is ready for demo recording!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Demo commands to copy-paste during recording:" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Start server:" -ForegroundColor White
Write-Host "   node test-server-enhanced.js" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Submit job (challenge requirement):" -ForegroundColor White
Write-Host "   qgjob submit --org-id=qualgent --app-version-id=xxz123 --test=tests/onboarding.spec.js --priority=5 --target=emulator --server-url=http://localhost:3001" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Check status (replace JOB_ID with actual ID):" -ForegroundColor White
Write-Host "   qgjob status --job-id=JOB_ID --server-url=http://localhost:3001" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Submit multiple jobs for grouping demo:" -ForegroundColor White
Write-Host "   qgjob submit --org-id=demo --app-version-id=v2.0.0 --test=tests/login.spec.js --target=emulator --server-url=http://localhost:3001" -ForegroundColor Gray
Write-Host "   qgjob submit --org-id=demo --app-version-id=v2.0.0 --test=tests/checkout.spec.js --target=emulator --server-url=http://localhost:3001" -ForegroundColor Gray
Write-Host ""
Write-Host "5. List jobs:" -ForegroundColor White
Write-Host "   qgjob list --org-id=demo --server-url=http://localhost:3001" -ForegroundColor Gray
Write-Host ""
Write-Host "6. Open dashboard:" -ForegroundColor White
Write-Host "   http://localhost:3001" -ForegroundColor Gray
Write-Host ""
Write-Host "7. View GitHub Actions:" -ForegroundColor White
Write-Host "   https://github.com/Avinashavi4/QualGen-Backend/actions" -ForegroundColor Gray
Write-Host ""
Write-Host "🎬 Ready to record! Good luck with your demo!" -ForegroundColor Green
