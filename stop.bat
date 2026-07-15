@echo off
cd /d "%~dp0"

echo Stopping HVACFlow database container...
echo (If the app servers are still running in another window,
echo  press Ctrl+C in that window first.)
echo.

docker-compose down

echo.
echo Done. Your data is preserved - just run start.bat again next time.
pause
