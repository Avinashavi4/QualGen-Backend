# QualGen Demo Commands - Ready to Copy/Paste

Write-Host "QualGen Demo - Ready for Recording!" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green

Write-Host "Commands for your 5-minute demo:" -ForegroundColor Yellow
Write-Host ""

Write-Host "1. Start server:" -ForegroundColor Cyan
Write-Host "node test-server-enhanced.js"

Write-Host ""
Write-Host "2. Submit job (exact challenge requirement):" -ForegroundColor Cyan
Write-Host "qgjob submit --org-id=qualgent --app-version-id=xxz123 --test=tests/onboarding.spec.js --priority=5 --target=emulator --server-url=http://localhost:3001"

Write-Host ""
Write-Host "3. Check status:" -ForegroundColor Cyan
Write-Host "qgjob status --job-id=[use-actual-job-id] --server-url=http://localhost:3001"

Write-Host ""
Write-Host "4. Demonstrate grouping:" -ForegroundColor Cyan
Write-Host "qgjob submit --org-id=demo --app-version-id=v2.0.0 --test=tests/login.spec.js --target=emulator --server-url=http://localhost:3001"
Write-Host "qgjob submit --org-id=demo --app-version-id=v2.0.0 --test=tests/checkout.spec.js --target=emulator --server-url=http://localhost:3001"

Write-Host ""
Write-Host "5. List jobs:" -ForegroundColor Cyan
Write-Host "qgjob list --org-id=demo --server-url=http://localhost:3001"

Write-Host ""
Write-Host "6. Open dashboard: http://localhost:3001" -ForegroundColor Cyan
Write-Host "7. Show GitHub Actions: https://github.com/Avinashavi4/QualGen-Backend/actions" -ForegroundColor Cyan

Write-Host ""
Write-Host "Ready to create your impressive demo video!" -ForegroundColor Green
