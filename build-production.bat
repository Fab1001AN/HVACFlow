@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ============================================================
REM   HVACFlow - Build for Production
REM
REM   Run this ONCE after installing, and again after every
REM   update. It compiles the app into an optimised build that
REM   start-production.bat then runs.
REM
REM   This takes a few minutes. That is normal.
REM ============================================================

echo ================================================
echo   HVACFlow - Build for Production
echo ================================================
echo.

REM -- Docker must be running: the build generates database types --
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
if not exist "apps\web\.env.local" (
    echo [ERROR] apps\web\.env.local not found. Run start.bat once first.
    echo.
    pause
    exit /b 1
)

REM -- The web address is COMPILED IN, so it must be right before building.
REM    Next.js reads apps\web\.env.local (its own folder) - NOT the root
REM    .env - so that is the file that actually decides the built-in URL.
set CURRENT_API_URL=
for /f "usebackq tokens=1,* delims==" %%a in ("apps\web\.env.local") do (
    if "%%a"=="NEXT_PUBLIC_API_URL" set CURRENT_API_URL=%%b
)

echo ------------------------------------------------
echo   IMPORTANT - check the address below
echo.
echo   API address to be built in:
echo     !CURRENT_API_URL!
echo.
echo   If ONLY this computer will use HVACFlow, "localhost"
echo   is correct - continue.
echo.
echo   If OTHER computers on the network will use it, this
echo   must be this machine's name or IP instead, e.g.
echo     http://192.168.1.50:4000/api/v1
echo   Otherwise staff on other PCs will get a blank screen,
echo   because their browser would look for the API on their
echo   own machine.
echo.
echo   To change it: edit apps\web\.env.local, set
echo   NEXT_PUBLIC_API_URL and NEXT_PUBLIC_WS_URL to this
echo   machine's address, then run this build again.
echo ------------------------------------------------
echo.
set /p PROCEED="Is the address above correct? (Y/N): "
if /i not "!PROCEED!"=="Y" (
    echo.
    echo Cancelled. Edit apps\web\.env.local, then run this again.
    echo.
    pause
    exit /b 0
)

echo.
echo Building. This takes a few minutes - please wait...
echo.

call npm run build
if errorlevel 1 (
    echo.
    echo [ERROR] The build failed. Nothing was changed.
    echo Scroll up to see the first error - that is usually the real one.
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Build complete.
echo.
echo   Now run start-production.bat to launch HVACFlow.
echo ================================================
echo.
pause
