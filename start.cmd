@echo off
rem Starts the brain (Docker) and the app, then opens the dashboard.
docker start lac-brain >nul 2>&1
start "" http://localhost:8787
node "%~dp0server.mjs"
