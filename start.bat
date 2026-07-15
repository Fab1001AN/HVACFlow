@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ================================================
echo   HVACFlow - Starting
echo ================================================
echo.

REM ── 1. Make sure Docker Desktop is running ────────────────────────────
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop does not appear to be running.
    echo Please open Docker Desktop, wait for the whale icon in the
    echo taskbar to stop animating, then double-click this file again.
    echo.
    pause
    exit /b 1
)

REM ── 2. First-time setup: create .env files, sync DB password + JWT secrets ──
if not exist ".env" (
    echo First run detected - creating environment files...

    copy .env.example .env >nul
    copy apps\api\.env.example apps\api\.env >nul
    copy apps\web\.env.local.example apps\web\.env.local >nul

    REM The two .env.example templates ship with different default DB
    REM passwords - force them to match so Postgres and the API agree.
    set DBPASS=hvacflow_dev_password
    set DBURL=postgresql://hvacflow:!DBPASS!@localhost:5432/hvacflow?schema=public

    for /f "delims=" %%s in ('node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"') do set SECRET1=%%s
    for /f "delims=" %%s in ('node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"') do set SECRET2=%%s

    powershell -NoProfile -Command ^
        "(Get-Content '.env') -replace 'POSTGRES_PASSWORD=.*','POSTGRES_PASSWORD=!DBPASS!' -replace 'DATABASE_URL=.*','DATABASE_URL=\"!DBURL!\"' -replace 'JWT_ACCESS_SECRET=.*','JWT_ACCESS_SECRET=!SECRET1!' -replace 'JWT_REFRESH_SECRET=.*','JWT_REFRESH_SECRET=!SECRET2!' | Set-Content '.env'"
    powershell -NoProfile -Command ^
        "(Get-Content 'apps\api\.env') -replace 'DATABASE_URL=.*','DATABASE_URL=\"!DBURL!\"' -replace 'JWT_ACCESS_SECRET=.*','JWT_ACCESS_SECRET=!SECRET1!' -replace 'JWT_REFRESH_SECRET=.*','JWT_REFRESH_SECRET=!SECRET2!' | Set-Content 'apps\api\.env'"

    echo Environment files created with matching DB password and generated JWT secrets.
    echo.
)

REM ── 3. Start PostgreSQL ─────────────────────────────────────────────────
echo Starting PostgreSQL...
docker-compose up -d postgres
if errorlevel 1 (
    echo [ERROR] Could not start PostgreSQL. See the error above.
    pause
    exit /b 1
)
echo Waiting for PostgreSQL to be ready...
timeout /t 6 /nobreak >nul

REM ── 4. Install dependencies (first run, or after a git pull) ──────────
if not exist "node_modules" (
    echo Installing dependencies - this can take a few minutes on first run...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. See the error above.
        pause
        exit /b 1
    )
)

REM ── 5. Prisma client + migrations (safe to re-run every time) ─────────
echo Preparing the database...
call npm run db:generate
call npm run db:migrate:deploy

REM Seeding fails harmlessly with "already exists" once the DB is seeded.
REM That's expected on every run after the first - don't treat it as fatal.
call npm run db:seed

REM ── 6. Open the browser a few seconds after the servers start ─────────
start "" /min cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:3000"

REM ── 7. Start the app (stays in this window - Ctrl+C to stop) ──────────
echo.
echo ================================================
echo   Starting HVACFlow...
echo   Frontend:  http://localhost:3000
echo   API docs:  http://localhost:4000/api/v1/docs
echo.
echo   Press Ctrl+C in this window to stop everything.
echo ================================================
echo.

call npm run dev

pause
