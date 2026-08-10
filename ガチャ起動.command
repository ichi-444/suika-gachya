#!/bin/bash
# Mac用の起動スクリプト（Windowsの「ガチャ起動.bat」と同じ動きの確認用）
# 職員PCで起動する想定。ダブルクリックで起動できます

cd "$(dirname "$0")"

clear
echo "============================================================"
echo "         夏の勉強ガチャ  サーバー（職員PC・Mac確認用）"
echo "============================================================"
echo

# この職員PCのIPアドレスを自動で探す
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

if [ -n "$IP" ]; then
  echo "  【ガチャ用PC】のブラウザで、次のアドレスを開いてください"
  echo
  echo "        http://$IP:3001"
  echo
  echo "  （開いたら全画面（⌘+Control+F）にすると見やすいです）"
else
  echo "  IPアドレスを自動で見つけられませんでした。"
  echo "  「システム設定 → Wi-Fi → 詳細」でIPアドレスを確認してください。"
fi

echo
echo "  【管理画面】はこの職員PCのブラウザだけで開けます（数秒後に自動で開きます）"
echo "        http://localhost:3001/admin"
echo
echo "  ※ ガチャ用PCから管理画面は開けません（自動でブロックされます）"
echo
echo "============================================================"
echo "  この画面は閉じないでください（閉じるとガチャが止まります）"
echo "  終わるときは Control + C を押してください"
echo "============================================================"
echo

# サーバーの起動を数秒待ってから、この職員PCのブラウザで管理画面を自動で開く
( sleep 3; open "http://localhost:3001/admin" ) &

# サーバーが落ちても自動で立ち上げ直す
while true; do
  node server/index.js
  echo
  echo "[!] サーバーが止まりました。5秒後に自動で立ち上げ直します..."
  echo "    完全に終わるときは Control + C を押してください。"
  sleep 5
done
