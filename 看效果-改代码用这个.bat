@echo off
chcp 65001 >nul
cd /d "%~dp0"
title scoop words - 看效果

echo.
echo   ══════════════════════════════════════════
echo    看效果（改代码用的就是这个）
echo   ══════════════════════════════════════════
echo.
echo   浏览器会自动打开 http://localhost:5173
echo.
echo   改 src 里的任何文件，浏览器会自己刷新，
echo   不用重新运行这个脚本，也不用刷新页面。
echo.
echo   看完关掉这个黑窗口就行（或者按 Ctrl+C）。
echo.

start "" cmd /c "timeout /t 3 >nul & start http://localhost:5173"
call npm run dev

echo.
echo   服务已停止。
pause
