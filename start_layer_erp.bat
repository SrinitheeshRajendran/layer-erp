@echo off
cd /d "%~dp0"
title Layer ERP - Local Desktop Application
echo ===================================================
echo   Layer ERP - Local Desktop Application
echo   Starting local desktop application...
echo ===================================================
call npm --prefix renderer run build
set LAYER_ERP_USE_DIST=1
call npm start
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Application exited with error code %ERRORLEVEL%.
    pause
)
