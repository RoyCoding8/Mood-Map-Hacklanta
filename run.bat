@echo off
title MoodMap Dev

:: Kill any stale processes on ports 3001, 5173 and 8000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo.
echo  Starting MoodMap...
echo  Backend:  http://localhost:3001
echo  Python:   http://localhost:8000
echo  Frontend: http://localhost:5173
echo.

call uv sync --project py-service >nul 2>&1
call uv run --project py-service py-ingest >nul 2>&1

:: Start Python backend, Node backend in background, frontend in foreground
start "MoodMap Python" /min cmd /c "cd /d %~dp0 && uv run --project py-service py-service"
timeout /t 2 /nobreak >nul
start "MoodMap Backend" /min cmd /c "cd /d %~dp0 && node server.js"
timeout /t 2 /nobreak >nul
start http://localhost:5173
cd /d %~dp0
npx vite --open
