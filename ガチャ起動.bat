@echo off
chcp 65001 >nul
title ガチャ サーバー（職員PC・この黒い窓は開いたままにしてください）
cd /d "%~dp0"

cls
echo ============================================================
echo          夏の勉強ガチャ  サーバー（職員PCで起動）
echo ============================================================
echo.

rem --- この職員PCのIPアドレスを自動で探す（192.168 か 10. で始まるもの） ---
set "IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /r /c:"IPv4.*192\.168\." /c:"IPv4.*10\."') do (
  if not defined IP set "IP=%%a"
)
set "IP=%IP: =%"

if defined IP (
  echo   【ガチャ用PC】のブラウザで、次のアドレスを開いてください
  echo.
  echo        http://%IP%:3001
  echo.
  echo   （開いたら F11 キーで全画面にすると見やすいです）
) else (
  echo   IPアドレスを自動で見つけられませんでした。下の一覧から
  echo   「192.168」で始まる番号を使ってください：
  echo.
  ipconfig ^| findstr "IPv4"
)
echo.
echo   【管理画面】はこの職員PCのブラウザだけで開けます（数秒後に自動で開きます）
echo        http://localhost:3001/admin
echo.
echo   ※ ガチャ用PCから管理画面は開けません（自動でブロックされます）
echo.
echo ============================================================
echo   この黒い窓は「閉じない」でください（閉じると止まります）
echo   終わるときだけ、右上の × ボタンを押してください
echo ============================================================
echo.

rem サーバーの起動を数秒待ってから、この職員PCのブラウザで管理画面を自動で開く
start "" cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:3001/admin"

:loop
node server\index.js
echo.
echo [!] サーバーが止まりました。5秒後に自動で立ち上げ直します...
echo     完全に終わるときは、この窓の × ボタンを押してください。
timeout /t 5 >nul
goto loop
