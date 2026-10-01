@echo off
chcp 65001 >nul
cd /d "%~dp0"
title scoop words - 出包

echo.
echo   ══════════════════════════════════════════
echo    出包（生成可以双击 / 传到手机上的版本）
echo   ══════════════════════════════════════════
echo.
echo   两步：
echo     1. 网页版构建（部署包要读它的产物，必须先跑）
echo     2. 单文件 + 部署包
echo.
echo   产物会写到： ..\new-scoop-发布\
echo     Scoop Words-电脑版.html   双击就能用
echo     Scoop Words-手机版.html   拷到手机上用
echo     部署包\  +  部署包.zip      传上去当网页用
echo     使用说明.txt
echo.
echo   要写到别的地方，改 build.config.json 里的 outDir。
echo.

echo   [1/2] 网页版构建...
call npm run build
if errorlevel 1 goto fail

echo.
echo   [2/2] 单文件 + 部署包...
call npm run build:desktop
if errorlevel 1 goto fail

echo.
echo   ✓ 出包完成，产物在 ..\new-scoop-发布\
echo.
start "" explorer "%~dp0..\new-scoop-发布"
pause
exit /b 0

:fail
echo.
echo   ✗ 出错了，往上翻看红字。
echo     最常见的是忘了先装依赖： npm install --ignore-scripts
echo.
pause
exit /b 1
