const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'gacha.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS gachas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#ff7eb9',
    icon TEXT DEFAULT '🎁',
    cost INTEGER NOT NULL DEFAULT 5,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS prizes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gacha_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    emoji TEXT DEFAULT '🎁',
    rarity TEXT DEFAULT 'N',
    weight INTEGER NOT NULL DEFAULT 10,
    initial_stock INTEGER NOT NULL DEFAULT -1,
    remaining_stock INTEGER NOT NULL DEFAULT -1,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (gacha_id) REFERENCES gachas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pulls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gacha_id INTEGER NOT NULL,
    prize_id INTEGER,
    student_id INTEGER,
    pulled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// ===== マイグレーション（既存DBに列を後付け。node:sqlite には db.transaction が無いので手動）=====
function hasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
}

// スイカポイント経済の追加前に作られたDBには cost / student_id が無いので足す。
if (!hasColumn('gachas', 'cost')) {
  db.exec('ALTER TABLE gachas ADD COLUMN cost INTEGER NOT NULL DEFAULT 5');
  // 標準3種の初期コスト（管理画面から変更可）
  db.prepare("UPDATE gachas SET cost = 25 WHERE key = 'normal'").run();
  db.prepare("UPDATE gachas SET cost = 25 WHERE key = 'premium'").run();
  db.prepare("UPDATE gachas SET cost = 5  WHERE key = 'daily'").run();
}
if (!hasColumn('pulls', 'student_id')) {
  db.exec('ALTER TABLE pulls ADD COLUMN student_id INTEGER');
}
// 累計使用ポイントを正確に集計するため、引いた時点のコストを1件ずつ記録する。
// 旧データ（NULL）はコスト不明なので、集計時に現在のガチャコストで代用する。
if (!hasColumn('pulls', 'cost')) {
  db.exec('ALTER TABLE pulls ADD COLUMN cost INTEGER');
}
// 景品をスタッフが生徒に引き渡したか（0=まだ / 1=済）。管理画面でチェック、生徒画面でも確認できる。
if (!hasColumn('pulls', 'delivered')) {
  db.exec('ALTER TABLE pulls ADD COLUMN delivered INTEGER NOT NULL DEFAULT 0');
}

// ===== 初期データ（空DBのときだけ）=====
const gachaCount = db.prepare('SELECT COUNT(*) AS c FROM gachas').get().c;
if (gachaCount === 0) {
  const insertGacha = db.prepare(`
    INSERT INTO gachas (key, name, description, color, icon, cost, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertGacha.run('normal',  '文房具ガチャ', '可愛い文房具が当たるよ！',    '#5ec8ff', '🖊️', 25, 1);
  insertGacha.run('premium', '食べ物ガチャ', 'おかしやアイスが当たるよ！',  '#ffb547', '🍩', 25, 2);
  insertGacha.run('daily',   'プチガチャ',   '5ポイントでミニ景品ゲット！', '#ff7eb9', '🌟', 5,  3);

  const insertPrize = db.prepare(`
    INSERT INTO prizes (gacha_id, name, description, emoji, rarity, weight, initial_stock, remaining_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 文房具ガチャ（normal）
  insertPrize.run(1, '単語帳',            '英単語を覚えようね',                 '📝', 'N',  25, -1, -1);
  insertPrize.run(1, 'おもしろ消しゴム',  '消しゴムを一つ選んでね',             '🍡', 'N',  35, -1, -1);
  insertPrize.run(1, 'ヘアクリップ',      '前髪が邪魔にならない！',             '📎', 'R',  20, 20, 20);
  insertPrize.run(1, '靴下',              '可愛い靴下がたくさん！！',           '🧦', 'SR', 17, 10, 10);
  insertPrize.run(1, 'シャーペン券',      '好きなシャーペンを買ってもらえるよ', '🖊', 'SSR', 3, 2,  2);

  // 食べ物ガチャ（premium）
  insertPrize.run(2, 'ブタメン',          'おいしいねー',                       '🍜', 'N',  25, 50, 50);
  insertPrize.run(2, 'アイスバー',        '好きなアイスを選んでね！',           '🍦', 'R',  25, -1, -1);
  insertPrize.run(2, 'ラムネ',            '夏の飲み物といえば！',               '🍹', 'R',  25, 15, 15);
  insertPrize.run(2, 'ハーゲンダッツ',    'みんな大好き',                       '🍨', 'SR', 20, 18, 18);
  insertPrize.run(2, 'ミスドドーナツ二つ券','ドーナツと交換できるよ！',         '🍩', 'SSR', 5, 3,  3);

  // プチガチャ（daily）
  insertPrize.run(3, '駄菓子',            '好きな駄菓子を選んでね',             '🍭', 'N',  40, -1, -1);
  insertPrize.run(3, '文具',              'いっぱい勉強してね',                 '📝', 'N',  40, -1, -1);
  insertPrize.run(3, 'アイスバー',        '好きなアイスバーを選んでね！',       '🍦', 'R',  20, -1, -1);
}

// 生徒サンプル（空のときだけ。実運用ではスタッフが管理画面で追加・編集する）
const studentCount = db.prepare('SELECT COUNT(*) AS c FROM students').get().c;
if (studentCount === 0) {
  const insertStudent = db.prepare('INSERT INTO students (name, points) VALUES (?, ?)');
  insertStudent.run('たなか', 35);
  insertStudent.run('さとう', 20);
  insertStudent.run('すずき', 50);
  insertStudent.run('やまだ', 12);
  insertStudent.run('いとう', 28);
  insertStudent.run('こばやし', 8);
}

module.exports = db;
