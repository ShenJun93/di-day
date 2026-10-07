@echo off
rem Starts Docker Desktop if needed, then the brain (Gemma via llama.cpp) and the app, and opens the dashboard.
docker info >nul 2>&1 && goto docker_ready
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo Waiting for Docker...
:wait
timeout /t 5 >nul
docker info >nul 2>&1 || goto wait
:docker_ready
docker start lac-brain >nul 2>&1
start "" http://localhost:8787
node "%~dp0server.mjs"
