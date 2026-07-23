@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ============================================================
REM   HVACFlow - Start (Production)
REM
REM   Runs the compiled, optimised build. Use this for real
REM   day-to-day use.
REM
REM   Run build-production.bat first (once after install, and
REM   again after every update).
REM
REM   start.bat is the DEVELOPMENT server - slower, heavier,
REM   and not intended for production use.
REM ============================================================

echo ================================================
echo   HVACFlow - Starting (Production)
echo ================================================
echo.

REM -- 1. Docker --
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop does not appear to be running.
    echo Open Docker Desktop, wait for the whale icon to stop animating,
    echo then run this file again.
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    echo [ERROR] No .env file found. Run start.bat once first to create it.
    echo.
    pause
    exit /b 1
)

REM -- 2. Refuse to start without a build, rather than failing cryptically --
REM    Checks for the output folders rather than one exact file, since the
REM    compiled layout can vary; the start command surfaces anything deeper.
if not exist "apps\api\dist" (
    echo [ERROR] No production build found for the API.
    echo.
    echo Run build-production.bat first, then try again.
    echo.
    pause
    exit /b 1
)
if not exist "apps\web\.next" (
    echo [ERROR] No production build found for the web app.
    echo.
    echo Run build-production.bat first, then try again.
    echo.
    pause
    exit /b 1
)

REM -- 3. Database container (same command form start.bat uses) --
echo Starting the database...
docker-compose up -d postgres
if errorlevel 1 (
    echo [ERROR] Could not start the database container.
    echo.
    pause
    exit /b 1
)

echo Waiting for the database to be ready...
timeout /t 6 /nobreak >nul

REM -- 4. Apply any migrations that shipped with an update --
echo Applying database updates...
call npm run db:migrate:deploy
if errorlevel 1 (
    echo [ERROR] Database update failed. Not starting.
    echo Your data has not been changed. Restore a backup if needed
    echo ^(see BACKUP.md^) and check the error above.
    echo.
    pause
    exit /b 1
)

REM -- 5. Seed only ever populates an empty database (see prisma/seed.ts) --
echo Checking initial setup...
call npm run db:seed

REM -- 6. Open a browser once the server is up --
start "" /min cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:3000"

echo.
echo ================================================
echo   HVACFlow is starting in PRODUCTION mode.
echo.
echo   Open:  http://localhost:3000
echo.
echo   Keep this window open while people are using
echo   the system. Closing it stops HVACFlow.
echo ================================================
echo.

call npm run start:prod
