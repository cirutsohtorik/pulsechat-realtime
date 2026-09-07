@echo off
echo =======================================================
echo   PulseChat - Push to GitHub Helper
echo   Author: cirutsohtorik (https://github.com/cirutsohtorik)
echo =======================================================
echo.

:: 1. Check if git is available
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git is not found in PATH.
    echo Please make sure Git is installed and restart this terminal.
    pause
    exit /b 1
)

:: 2. Initialize Git if not already done
if not exist ".git" (
    echo [*] Initializing new Git repository...
    git init -b main
) else (
    echo [*] Git repository already initialized.
)

:: 3. Stage and commit
echo [*] Staging project files...
git add .

echo [*] Creating commit...
git commit -m "feat: initial release of PulseChat real-time engine with WebSockets & persistence"

echo.
echo =======================================================
echo   Ready to connect to GitHub!
echo =======================================================
echo 1. Go to https://github.com/new and create a repository named:
echo    pulsechat-realtime
echo 2. Do NOT initialize with README, .gitignore, or license (we have them).
echo 3. Enter your repository URL below (or press Enter to use default):
set /p REPO_URL="Repository URL [https://github.com/cirutsohtorik/pulsechat-realtime.git]: "

if "%REPO_URL%"=="" (
    set REPO_URL=https://github.com/cirutsohtorik/pulsechat-realtime.git
)

echo [*] Setting remote origin to %REPO_URL%...
git remote remove origin 2>nul
git remote add origin %REPO_URL%

echo [*] Pushing to GitHub main branch...
git push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCCESS] PulseChat is now published to your GitHub!
    echo Visit: https://github.com/cirutsohtorik/pulsechat-realtime
) else (
    echo.
    echo [NOTE] If push failed due to authentication, make sure you are logged in:
    echo        Run: git push -u origin main
)

echo.
pause
