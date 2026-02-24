@echo off
cd /d "C:UsersmorgaOneDriveDesktopStartUp MMRperizia-analyzer"
git add next.config.js src/app/api/analyze/route.ts
git commit -m "fix: add openai to serverExternalPackages, explicit nodejs runtime"
git push origin main
