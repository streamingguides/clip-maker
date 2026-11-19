@echo off
title Clip Maker - Live Tunnel
echo ============================================
echo   Clip Maker - Online Live (Cloudflare Tunnel)
echo ============================================
echo.
echo Step 1: Tool start kar raha hun (ek dusri window khule gi)...
start "Clip Maker Server" cmd /k "cd /d %~dp0 && call start.bat"
echo Us window ko khula rakhein. Browser me http://localhost:3000 khul jaye
echo to samjhein tool tayyar hai.
echo.
echo Step 2: Tunnel start ho raha hai (20 second baad)...
timeout /t 20 /nobreak >nul

set CF=
where cloudflared >nul 2>nul && set CF=cloudflared
if not defined CF if exist "%~dp0cloudflared.exe" set CF="%~dp0cloudflared.exe"
if not defined CF (
  echo.
  echo *** cloudflared nahi mila ***
  echo Pehle ek dafa ye install karein - Command Prompt me likhein:
  echo     winget install Cloudflare.cloudflared
  echo Ya is page se cloudflared-windows-amd64.exe download karke
  echo is folder me rakhein aur us ka naam cloudflared.exe kar dein:
  echo     https://github.com/cloudflare/cloudflared/releases
  echo Phir live.bat dobara chalain.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Neeche jo https://.....trycloudflare.com wala link aye ga
echo   WAHI aap ka LIVE link hai.
echo   Jo bhi wo link khole ga, tool use kar sakega.
echo   Ye window band ki to link bhi band ho jayega.
echo ============================================
echo.
%CF% tunnel --url http://localhost:3000
pause
