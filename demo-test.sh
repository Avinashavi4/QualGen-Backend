#!/bin/bash
# QualGen Demo Test Script
# Run this before recording to ensure everything works

echo "🎬 QualGen Demo Preparation Script"
echo "=================================="

echo "📋 Checking project setup..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this from the QualGen project root directory"
    exit 1
fi

echo "✅ In project directory"

# Check dependencies
echo "📦 Checking dependencies..."
if npm list > /dev/null 2>&1; then
    echo "✅ Dependencies installed"
else
    echo "⏳ Installing dependencies..."
    npm install
fi

# Build project
echo "🔨 Building project..."
npm run build
if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

# Install CLI
echo "🔗 Installing CLI globally..."
npm link
if command -v qgjob > /dev/null 2>&1; then
    echo "✅ CLI installed successfully"
else
    echo "❌ CLI installation failed"
    exit 1
fi

# Test CLI help
echo "🧪 Testing CLI..."
qgjob --help > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ CLI working"
else
    echo "❌ CLI not working"
    exit 1
fi

# Test server startup
echo "🚀 Testing server startup..."
timeout 10s node test-server-enhanced.js > /dev/null 2>&1 &
SERVER_PID=$!
sleep 3

# Test server health
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Server starts and responds"
    kill $SERVER_PID 2>/dev/null
else
    echo "❌ Server not responding"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo ""
echo "🎉 Everything is ready for demo recording!"
echo ""
echo "📝 Demo commands to copy-paste during recording:"
echo "=============================================="
echo ""
echo "1. Start server:"
echo "   node test-server-enhanced.js"
echo ""
echo "2. Submit job (challenge requirement):"
echo "   qgjob submit --org-id=qualgent --app-version-id=xxz123 --test=tests/onboarding.spec.js --priority=5 --target=emulator --server-url=http://localhost:3001"
echo ""
echo "3. Check status (replace JOB_ID with actual ID):"
echo "   qgjob status --job-id=JOB_ID --server-url=http://localhost:3001"
echo ""
echo "4. Submit multiple jobs for grouping demo:"
echo "   qgjob submit --org-id=demo --app-version-id=v2.0.0 --test=tests/login.spec.js --target=emulator --server-url=http://localhost:3001"
echo "   qgjob submit --org-id=demo --app-version-id=v2.0.0 --test=tests/checkout.spec.js --target=emulator --server-url=http://localhost:3001"
echo ""
echo "5. List jobs:"
echo "   qgjob list --org-id=demo --server-url=http://localhost:3001"
echo ""
echo "6. Open dashboard:"
echo "   http://localhost:3001"
echo ""
echo "7. View GitHub Actions:"
echo "   https://github.com/Avinashavi4/QualGen-Backend/actions"
echo ""
echo "🎬 Ready to record! Good luck with your demo!"
