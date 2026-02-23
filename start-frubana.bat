@echo off
cd /d "C:\Users\Usuario\frubana-express"
start "Frubana Express Server" cmd /k npm run dev -- -p 3001
timeout /t 3 /nobreak >nul
start http://localhost:3001
