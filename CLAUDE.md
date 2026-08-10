# CLAUDE.md

夏期講習イベント用のガチャシステム。生徒がブラウザで**スイカポイントを消費して**ガチャを回し、スタッフが管理画面から景品・確率・在庫、そして**生徒とスイカポイント残高**を調整する。テーマは「スイカ×夏」。

## アーキテクチャ

```
server/  Express API（port 3001）
  db.js     スキーマ定義＋初期データ投入（gachas/prizes/pulls/students の4テーブル）
  index.js  全APIエンドポイント
client/  React + Vite（port 5173, /api を 3001 にproxy）
  src/pages/  Home / Gacha / Prizes / Wins / Admin の5画面
  src/student.jsx  生徒（いま誰が回しているか＝残高）を全画面で共有する Context。localStorage 永続。
  src/styles.css  スイカ×夏の見た目（レトロなガチャポン機・スイカ配色・bobble/wobbleアニメ）
```

ガチャは「3種類固定（normal/premium/daily）」が前提。`gachas` テーブルの行は初期データで作られ、追加は想定しない（中身・色・名前・**コスト**は管理画面から変更可）。

## スイカポイント経済

- 生徒ごとに `students.points`（スイカポイント残高）を持つ。スタッフが頑張りに応じて管理画面で付与/減算する。
- ガチャは `gachas.cost`（1回あたりの消費ポイント。ガチャごとに設定）を消費して回す。残高不足なら 400 エラーで弾く。
- キオスク動線: トップで生徒を選ぶ（`/api/students`）→ ヘッダーに残高表示 → ガチャを回すと `pull` が残高を引く。選択中の生徒は `student.jsx`（localStorage）で保持し、「べつのひと」でリセット。
- `POST /api/gachas/:key/pull` は `{ student_id }` 必須。在庫減算・ポイント減算・pulls記録を1トランザクション（`BEGIN`/`COMMIT`/`ROLLBACK` 手動）で行い、`{ prize, cost, points }` を返す。
- 生徒本人の「獲得景品」は公開API `GET /api/students/:id/pulls`（いつ何を当てたかを1件ずつ新しい順で返す。prize/gacha を LEFT JOIN、pulled_at つき）。スタッフが景品を渡すときの照合に使う。キオスク（ガチャ用PC/LAN）から見るので管理APIではない。フロントは `Wins.jsx`（`/wins`。`fmtTime` で pulled_at のUTC文字列→ローカル月日時分に変換）、Home からリンク。※「はずれ」も1件として表示される。
- 生徒管理API（`/api/admin/students*`）は管理API扱い＝**職員PC(localhost)のみ**。付与のクイック操作は `POST /api/admin/students/:id/points` の `{ delta }`（`MAX(0, ...)` で負にならない）。

## DB

組み込みの `node:sqlite` を使用。`server/gacha.db` に永続化。`.gitignore` 済み。

- **better-sqlite3 は使わない**。Node 26 でネイティブビルド（node-gyp）が失敗するため `node:sqlite` に置き換えた経緯がある。
- `node:sqlite` には `db.transaction(fn)` が無い。トランザクションは `db.exec('BEGIN')` / `COMMIT` / `ROLLBACK` を手動で書く（`server/index.js` のpullハンドラ参照）。
- 戻り値の行オブジェクトは null-prototype だが、spread と JSON.stringify は問題なく動く。
- **マイグレーション**: スイカポイント経済の追加で `gachas.cost` 列・`pulls.student_id` 列・`students` テーブルが増えた。`db.js` は `PRAGMA table_info` で列の有無を見て `ALTER TABLE ADD COLUMN` する（既存DBを消さずに移行できる）。既存の3ガチャには normal=5 / premium=15 / daily=10 のコストを移行時に入れる。生徒サンプルは students が空のときだけ投入。

## 確率計算

`weight` の比率で抽選。`withProbabilities()`（server/index.js）で `active && stock>0` の景品の重み合計から % を算出してクライアントに返す。実際の抽選も同じ集合から `Math.random() * total` で行う。

**金色スイカ（SR以上確定）**: pullハンドラで `GOLDEN_CHANCE`（既定8%）の抽選に当たると「金色スイカ」になり、景品プールを SR/SSR（`RARE_RARITIES`）だけに絞って抽選する＝SR以上確定。SR以上の在庫が無ければ金色は出ず通常抽選にフォールバックする。pullレスポンスに `golden`（真偽）を返し、フロント（Gacha.jsx）はスイカを金色表示＋「SR以上確定」バナーにする。確率を変えるなら `server/index.js` 冒頭の `GOLDEN_CHANCE`。

## 起動

```bash
npm run dev   # ルートで実行。concurrently で server/client 両方起動
npm start     # 本番: client をビルドして server が dist/ ごと配信（port 3001のみ）
```

個別に起動するなら `npm run dev:server` / `npm run dev:client`。本番はserverが `client/dist` を静的配信し、非 `/api` パスは index.html にフォールバックする（server/index.js 末尾）。

**本番は2台構成**：職員PCでサーバー起動＋管理、ガチャ用PCで生徒がプレイ（ガチャのみ）。ルートの `ガチャ起動.bat`（Windows）/ `ガチャ起動.command`（Mac確認用）が職員PC用ランチャーで、LAN IP（ガチャ用PC向けURL）を表示→サーバー起動→数秒後に職員PCで `localhost:3001/admin` を自動オープン→クラッシュ時は自動再起動する。ガチャ用PC側は `ガチャ画面を開く.bat`：冒頭の `SERVER=`（職員PCのコンピューター名、初回のみ設定）に curl で疎通確認しながら待機→Edgeのキオスクモード（`--kiosk`）で全画面表示する。運用手順は `スタッフ手順書.txt`。

**管理画面の保護**（`server/index.js`）: `/admin`（HTML）と `/api/admin/*` はサーバー稼働PC＝職員PCのループバック（`isLocalRequest`: `127.0.0.1` / `::1` / `::ffff:127.0.0.1`）からのみ許可。ガチャ用PCなどLAN経由の別PCは、`/admin` はトップへリダイレクト、管理APIは 403。認証は無いが「管理はサーバーPCのみ」で生徒の誤操作を防ぐ設計。したがって**職員PCでも管理画面は必ず `localhost` で開く**こと（自分のLAN IP経由だとループバックにならず弾かれる）。別PCから管理したくなった場合はこの方式では不可で、Basic認証等の追加が必要。

## よくある変更ポイント

- **景品の初期データ**: `server/db.js` の `insertPrize.run(...)` 群。空DBのときだけ走る（既存DBには影響なし）。初期データを変えたい場合は `server/gacha.db` を削除してから起動。
- **新しい管理API**: `server/index.js` の `/api/admin/*` 系に追加。フロントは `client/src/pages/Admin.jsx` の `load()` / 各ハンドラで呼ぶ。
- **ガチャのコスト**: `gachas.cost`。管理画面の「ガチャ設定」モーダルで変更。抽選の可否判定は `pull` ハンドラ内（`student.points < cost`）。
- **生徒・スイカポイント**: `students` テーブルと `/api/admin/students*`。管理画面の「生徒とスイカポイント」セクション（`Admin.jsx` の `StudentModal` / `addPoints`）。キオスク側の残高は `student.jsx` の Context 経由（`useStudent()`）。
- **ガチャ履歴（だれが・いつ）**: `GET /api/admin/pulls`（`pulls` に `students`/`gachas`/`prizes` を LEFT JOIN、id降順、既定300件）。`Admin.jsx` の「ガチャ履歴」表。`pulled_at` は SQLite の UTC 文字列なので `fmtTime()` でローカル時刻へ変換して表示。旧データ（student_id=NULL）は「（不明）」。集計版は「景品ごとの集計」（`/api/admin/stats`）で別立て。
- **景品の引き渡しチェック**: `pulls.delivered`（0=まだ/1=済）。管理画面「ガチャ履歴」の「引き渡し」列のチェックボックスで切替＝`POST /api/admin/pulls/:id/delivered` の `{ delivered }`（職員PCのみ）。`Admin.jsx` の `toggleDelivered()` は件数が多いので全体リロードせず該当行だけ state 更新する。生徒側は `Wins.jsx` で「✓ 受け取り済み／未受け取り」バッジ表示（`GET /api/students/:id/pulls` が `delivered` を返す）。「はずれ」は渡すものが無いので両画面とも対象外（`isMiss()` で `prize_name === 'はずれ'` 判定。名前を変えるならこのヘルパーを直す）。
- **生徒選択の大人数対応**: `Home.jsx` の `StudentPicker`。検索ボックス＋あかさたなインデックス（`KANA_ROWS`/`rowOf()` で頭文字を行に分類、カタカナは自動でひらがな化）。名前が漢字/英字の生徒は「その他」に入るので、大人数運用ではひらがな登録が前提。
- **演出の調整**: ガチャは「スイカ割り」演出。フェーズは `Gacha.jsx` の `phase`（`ready`→`loading`→`aim`→`breaking`→`revealed`）。`ready` で大きなスイカと棒が出て「スタート」でサーバー抽選（金色判定込み）→`aim` でスイカ（金色なら金）＋棒を表示→タップで `smash()`→棒が振られてスイカが左右に割れ景品が飛び出す。割れる長さは `Gacha.jsx` の `BREAK_MS`（既定1500ms）と `styles.css` の `stickSwing`/`halfLeft`/`halfRight`/`prizeOut` を合わせる。スイカ本体・棒・金色・種（果肉に静止表示。飛び散らない）は `styles.css` の「スイカ割り」節（`.big-melon`/`.melon-half`/`.melon-core`/`.smash-stick`/`.seed-burst`/`.golden-banner`）。
- **レアリティ追加**: 現状 N/R/SR/SSR の4段階。追加するなら `client/src/pages/Prizes.jsx` の `ORDER`/`LABEL`、`Admin.jsx` の `RARITIES`、`styles.css` の `.rarity-XXX` を全部触る。

## 想定外のこと

- 認証は無い（管理画面 `/admin` も誰でも開ける）。塾内LANや短期イベント前提。公開するなら Basic 認証等を追加。
- スイカポイントは生徒ごとの残高。付与はスタッフの手動運用（頑張りに応じて管理画面で加算）。生徒の識別はキオスクで名前をタップするだけ（PIN等の本人確認は無い＝短期イベント前提。生徒が別人の名前を選べてしまう点は割り切り）。
- 「日替わりガチャ」は自動切替ではなく、スタッフが管理画面でその日の景品を有効/無効にする運用。
