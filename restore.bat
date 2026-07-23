@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ============================================================
REM   HVACFlow - Database Restore
REM
REM   Replaces the CURRENT database contents with a backup file.
REM   This is destructive: anything created since that backup
REM   was taken will be gone.
REM
REM   Usage:  restore.bat                 (pick from a list)
REM           restore.bat <path-to-.sql>  (restore that file)
REM ============================================================

echo ================================================
echo   HVACFlow - Database Restore
echo ================================================
echo.

REM -- 1. Docker + database container must be running --
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop does not appear to be running.
    echo Open Docker Desktop, wait for it to finish starting, then retry.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%h in ('docker inspect -f "{{.State.Running}}" hvacflow_postgres 2^>nul') do set PG_RUNNING=%%h
if not "!PG_RUNNING!"=="true" (
    echo [ERROR] The database container ^(hvacflow_postgres^) is not running.
    echo Start HVACFlow first ^(start.bat^), then run this restore.
    echo.
    pause
    exit /b 1
)

REM -- 2. Work out which file to restore --
set BACKUP_FILE=%~1

if "!BACKUP_FILE!"=="" (
    if not exist "backups" (
        echo [ERROR] No backups folder found. Nothing to restore.
        echo Run backup.bat first, or pass a file: restore.bat C:\path\to\file.sql
        echo.
        pause
        exit /b 1
    )
    echo Available backups ^(newest last^):
    echo.
    dir /b /o:n "backups\hvacflow_*.sql" 2>nul
    echo.
    set /p BACKUP_NAME="Type the file name to restore (or close this window to cancel): "
    if "!BACKUP_NAME!"=="" (
        echo Cancelled.
        pause
        exit /b 0
    )
    set BACKUP_FILE=backups\!BACKUP_NAME!
)

if not exist "!BACKUP_FILE!" (
    echo [ERROR] File not found: !BACKUP_FILE!
    echo.
    pause
    exit /b 1
)

REM -- 3. Read DB credentials from .env --
if not exist ".env" (
    echo [ERROR] No .env file found. Run start.bat once first.
    echo.
    pause
    exit /b 1
)

set POSTGRES_USER=hvacflow
set POSTGRES_DB=hvacflow
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    if "%%a"=="POSTGRES_USER" set POSTGRES_USER=%%b
    if "%%a"=="POSTGRES_DB" set POSTGRES_DB=%%b
)

REM -- 4. Loud, explicit confirmation. This is destructive. --
echo.
echo ------------------------------------------------
echo   WARNING - THIS WILL REPLACE ALL CURRENT DATA
echo.
echo   Restoring : !BACKUP_FILE!
echo   Into      : database "!POSTGRES_DB!"
echo.
echo   Every order, unit, task and configuration change
echo   made SINCE that backup was taken will be lost.
echo ------------------------------------------------
echo.
set /p CONFIRM="Type RESTORE (all capitals) to continue: "
if not "!CONFIRM!"=="RESTORE" (
    echo.
    echo Cancelled - nothing was changed.
    echo.
    pause
    exit /b 0
)

REM -- 5. Safety net: snapshot the current data before overwriting it, so a
REM       mistaken restore is itself recoverable.
echo.
echo Taking a safety backup of the current data first...
for /f "delims=" %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmmss"') do set STAMP=%%t
if not exist "backups" mkdir "backups"
set SAFETY=backups\pre-restore_!STAMP!.sql
docker exec hvacflow_postgres pg_dump -U !POSTGRES_USER! -d !POSTGRES_DB! --clean --if-exists > "!SAFETY!"
if errorlevel 1 (
    echo [ERROR] Could not take a safety backup. Stopping - nothing was changed.
    if exist "!SAFETY!" del "!SAFETY!"
    echo.
    pause
    exit /b 1
)
echo Safety backup saved: !SAFETY!
echo.

REM -- 6. Restore. The dump was written with --clean --if-exists, so it drops
REM       and recreates each object; no manual wipe needed.
echo Restoring...
docker exec -i hvacflow_postgres psql -U !POSTGRES_USER! -d !POSTGRES_DB! < "!BACKUP_FILE!"

if errorlevel 1 (
    echo.
    echo [ERROR] Restore reported errors. Your previous data is still in:
    echo   !SAFETY!
    echo You can restore that file to get back to where you were.
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Restore complete.
echo.
echo   Restart HVACFlow ^(stop.bat then start.bat^) so
echo   the app picks up the restored data cleanly.
echo ================================================
echo.
pause
