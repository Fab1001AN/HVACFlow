@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ============================================================
REM   HVACFlow - Database Backup
REM
REM   Writes a timestamped .sql dump of the whole database to
REM   the backups\ folder, then deletes dumps older than the
REM   retention period below.
REM
REM   Run it by double-clicking, or schedule it (see BACKUP.md)
REM   to run automatically every night.
REM ============================================================

REM How many days of backups to keep. Older ones are deleted.
set RETENTION_DAYS=14

echo ================================================
echo   HVACFlow - Database Backup
echo ================================================
echo.

REM -- 1. Docker must be running, since the database lives in a container --
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop does not appear to be running.
    echo The database runs inside Docker, so it must be started first.
    echo Open Docker Desktop, wait for the whale icon to stop animating,
    echo then run this file again.
    echo.
    pause
    exit /b 1
)

REM -- 2. The database container must be up --
for /f "tokens=*" %%h in ('docker inspect -f "{{.State.Running}}" hvacflow_postgres 2^>nul') do set PG_RUNNING=%%h
if not "!PG_RUNNING!"=="true" (
    echo [ERROR] The database container ^(hvacflow_postgres^) is not running.
    echo Start HVACFlow first ^(start.bat^), then run this backup.
    echo.
    pause
    exit /b 1
)

REM -- 3. Read DB credentials from .env so this always matches the running DB --
REM     start.bat generates .env on first run with a real password.
if not exist ".env" (
    echo [ERROR] No .env file found. Run start.bat once first to create it.
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

REM -- 4. Build a sortable timestamp: YYYY-MM-DD_HHMMSS --
for /f "delims=" %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmmss"') do set STAMP=%%t

if not exist "backups" mkdir "backups"
set OUTFILE=backups\hvacflow_!STAMP!.sql

echo Backing up database "!POSTGRES_DB!" as user "!POSTGRES_USER!"...
echo Target: !OUTFILE!
echo.

REM -- 5. Dump. pg_dump runs INSIDE the container; we redirect its stdout
REM        to a file on this machine, so no volume mounting is needed.
docker exec hvacflow_postgres pg_dump -U !POSTGRES_USER! -d !POSTGRES_DB! --clean --if-exists > "!OUTFILE!"

if errorlevel 1 (
    echo.
    echo [ERROR] Backup failed. The partial file has been removed.
    if exist "!OUTFILE!" del "!OUTFILE!"
    echo.
    pause
    exit /b 1
)

REM -- 6. A zero-byte file means pg_dump wrote nothing - treat as failure --
for %%A in ("!OUTFILE!") do set SIZE=%%~zA
if "!SIZE!"=="0" (
    echo.
    echo [ERROR] Backup file is empty - something went wrong. Removing it.
    del "!OUTFILE!"
    echo.
    pause
    exit /b 1
)

echo Backup complete: !OUTFILE!  ^(!SIZE! bytes^)
echo.

REM -- 7. Delete dumps older than the retention period --
REM     Only matches hvacflow_*.sql. The pre-restore_*.sql safety snapshots
REM     taken by restore.bat are deliberately NEVER auto-deleted - they exist
REM     precisely because someone restored the wrong thing, so they should
REM     outlive normal rotation. Remove them by hand once you're confident.
echo Removing backups older than !RETENTION_DAYS! days...
forfiles /p "backups" /m "hvacflow_*.sql" /d -!RETENTION_DAYS! /c "cmd /c del @path" >nul 2>&1
echo Done.
echo.

REM -- 8. Reminder that a backup on the same disk is not a backup --
echo ------------------------------------------------
echo   IMPORTANT: copy the backups\ folder somewhere
echo   off this machine ^(OneDrive, network drive, USB^).
echo   A backup stored only on this disk will not
echo   survive a disk failure.
echo ------------------------------------------------
echo.

REM Only pause when run interactively, so scheduled runs don't hang
REM waiting for a keypress that never comes.
if /i "%~1"=="--quiet" exit /b 0
pause
