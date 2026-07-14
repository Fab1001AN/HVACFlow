@echo off
setlocal
cd /d "%~dp0"
title HVACFlow
where node >nul 2>&1 || (echo Node.js 22 is required.& pause & exit /b 1)
where docker >nul 2>&1 || (echo Docker Desktop is required.& pause & exit /b 1)
docker compose up -d postgres || goto error
if not exist node_modules call npm install || goto error
call npm run db:generate || goto error
call npm run db:migrate:deploy || goto error
call npm run dev || goto error
exit /b 0
:error
echo HVACFlow failed to start. Review the message above.
pause
exit /b 1
