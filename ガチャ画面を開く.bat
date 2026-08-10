@echo off
chcp 65001 >nul
title ガチャ画面を開く（ガチャ用PC）

rem ============================================================
rem ★初回のみ設定★
rem 下の「set SERVER=」のあとに、職員PCのコンピューター名を書いてください。
rem   調べ方: 職員PCのコマンドプロンプトで  hostname  と打つと出てくる名前
rem   例:     set SERVER=JUKU-PC01
rem 名前でつながらない場合は、代わりに職員PCのIPアドレスを書いてください。
rem   例:     set SERVER=192.168.1.23
rem ============================================================
set SERVER=

if "%SERVER%"=="" (
  cls
  echo.
  echo  ★初回設定がまだです★
  echo.
  echo  このファイルを右クリック →「編集」（またはメモ帳で開く）で開いて、
  echo  「set SERVER=」のあとに職員PCのコンピューター名を書いてください。
  echo.
  echo  （職員PCで hostname と打つと名前がわかります）
  echo.
  pause
  exit /b
)

cls
echo.
echo  職員PCのガチャサーバーを探しています...
echo  （職員PC側で「ガチャ起動」が動いているか確認してください）
echo.

:wait
curl -s -o nul --max-time 2 "http://%SERVER%:3001/" && goto open
timeout /t 2 >nul
goto wait

:open
echo  見つかりました！ガチャ画面を全画面で開きます。
echo  （ガチャを終了するときは Alt + F4 キー）

rem Edge をキオスクモード（アドレスバーなしの全画面）で開く。無ければ普通のブラウザで開く
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" --kiosk "http://%SERVER%:3001/" --edge-kiosk-type=fullscreen --no-first-run
) else (
  start "" "http://%SERVER%:3001/"
)
