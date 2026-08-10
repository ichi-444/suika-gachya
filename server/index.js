const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// 管理画面はサーバーを動かしているPC（＝職員PC, localhost）からのみ許可する。
// ガチャ用PCはLAN経由の別PCなので remoteAddress がループバックにならず弾かれる。
function isLocalRequest(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// 金色スイカ演出: 一定確率で「金色スイカ」が出て、出たら景品プールを
// SR以上（SR/SSR）に絞る＝SR以上確定にする。確率はここで調整。
const GOLDEN_CHANCE = 0.08;
const RARE_RARITIES = new Set(['SR', 'SSR']);

function withProbabilities(prizes) {
  const total = prizes.filter(p => p.active).reduce((s, p) => s + p.weight, 0);
  return prizes.map(p => ({
    ...p,
    active: !!p.active,
    probability: p.active && total > 0 ? (p.weight / total) * 100 : 0,
    sold_out: p.initial_stock !== -1 && p.remaining_stock <= 0
  }));
}

app.get('/api/gachas', (req, res) => {
  const gachas = db.prepare('SELECT * FROM gachas ORDER BY sort_order, id').all();
  res.json(gachas);
});

app.get('/api/gachas/:key', (req, res) => {
  const gacha = db.prepare('SELECT * FROM gachas WHERE key = ?').get(req.params.key);
  if (!gacha) return res.status(404).json({ error: 'gacha not found' });
  const prizes = db.prepare(`
    SELECT * FROM prizes
    WHERE gacha_id = ? AND active = 1
    ORDER BY CASE rarity WHEN 'SSR' THEN 0 WHEN 'SR' THEN 1 WHEN 'R' THEN 2 ELSE 3 END, id
  `).all(gacha.id);
  res.json({ ...gacha, prizes: withProbabilities(prizes) });
});

// ===== Students（生徒とスイカポイント。キオスク側で使う公開API）=====
app.get('/api/students', (req, res) => {
  const students = db.prepare('SELECT id, name, points FROM students ORDER BY name').all();
  res.json(students);
});

app.get('/api/students/:id', (req, res) => {
  const s = db.prepare('SELECT id, name, points FROM students WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: '生徒が見つかりません' });
  res.json(s);
});

// キオスク: 生徒本人が「獲得景品」を見る。いつ・どの景品を獲得したかを1件ずつ新しい順で返す。
// スタッフが景品を渡すときの照合にも使う。本人がガチャ用PC(LAN)から見るので公開API（管理APIではない）。
app.get('/api/students/:id/pulls', (req, res) => {
  const student = db.prepare('SELECT id, name FROM students WHERE id = ?').get(req.params.id);
  if (!student) return res.status(404).json({ error: '生徒が見つかりません' });
  const pulls = db.prepare(`
    SELECT pl.id, pl.pulled_at, pl.delivered,
           p.name AS prize_name, p.emoji AS prize_emoji, p.rarity,
           g.name AS gacha_name, g.icon AS gacha_icon
    FROM pulls pl
    LEFT JOIN prizes p ON pl.prize_id = p.id
    LEFT JOIN gachas g ON pl.gacha_id = g.id
    WHERE pl.student_id = ?
    ORDER BY pl.id DESC
  `).all(student.id);
  res.json({ student, pulls });
});

app.post('/api/gachas/:key/pull', (req, res) => {
  const gacha = db.prepare('SELECT * FROM gachas WHERE key = ?').get(req.params.key);
  if (!gacha) return res.status(404).json({ error: 'gacha not found' });

  // 生徒とスイカポイントの確認（誰の残高から引くか）
  const studentId = req.body && req.body.student_id;
  const student = studentId ? db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) : null;
  if (!student) return res.status(400).json({ error: '生徒を選んでください' });

  const cost = gacha.cost || 0;
  if (student.points < cost) {
    return res.status(400).json({
      error: `スイカポイントがたりないよ（ひつよう ${cost}🍉 / のこり ${student.points}🍉）`
    });
  }

  const prizes = db.prepare(`
    SELECT * FROM prizes
    WHERE gacha_id = ? AND active = 1 AND (initial_stock = -1 OR remaining_stock > 0)
  `).all(gacha.id);

  if (prizes.length === 0) {
    return res.status(400).json({ error: '景品が登録されていません' });
  }

  // 金色スイカ抽選。当たれば景品プールをSR以上に絞る（＝SR以上確定）。
  // SR以上の在庫が無ければ金色は出ない（通常抽選にフォールバック）。
  const rarePool = prizes.filter(p => RARE_RARITIES.has(p.rarity) && p.weight > 0);
  const golden = Math.random() < GOLDEN_CHANCE && rarePool.length > 0;
  const pool = golden ? rarePool : prizes;

  const total = pool.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return res.status(400).json({ error: '当選確率が設定されていません' });

  let rand = Math.random() * total;
  let selected = pool[pool.length - 1];
  for (const p of pool) {
    rand -= p.weight;
    if (rand <= 0) { selected = p; break; }
  }

  // 在庫・ポイント・履歴をひとまとめに更新（node:sqlite は手動トランザクション）
  db.exec('BEGIN');
  try {
    if (selected.initial_stock !== -1) {
      db.prepare('UPDATE prizes SET remaining_stock = remaining_stock - 1 WHERE id = ?').run(selected.id);
    }
    db.prepare('UPDATE students SET points = points - ? WHERE id = ?').run(cost, student.id);
    db.prepare('INSERT INTO pulls (gacha_id, prize_id, student_id, cost) VALUES (?, ?, ?, ?)')
      .run(gacha.id, selected.id, student.id, cost);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const fresh = db.prepare('SELECT * FROM prizes WHERE id = ?').get(selected.id);
  res.json({
    prize: { ...fresh, active: !!fresh.active },
    golden,
    cost,
    points: student.points - cost
  });
});

// ===== Admin =====
// 管理APIは職員PC(localhost)からのみ。ガチャ用PCなど別PCからは 403。
app.use('/api/admin', (req, res, next) => {
  if (!isLocalRequest(req)) {
    return res.status(403).json({ error: '管理画面はサーバーを動かしているPCからのみ利用できます' });
  }
  next();
});

app.get('/api/admin/gachas', (req, res) => {
  const gachas = db.prepare('SELECT * FROM gachas ORDER BY sort_order, id').all();
  const result = gachas.map(g => {
    const prizes = db.prepare('SELECT * FROM prizes WHERE gacha_id = ? ORDER BY id').all(g.id);
    return { ...g, prizes: withProbabilities(prizes) };
  });
  res.json(result);
});

app.put('/api/admin/gachas/:id', (req, res) => {
  const { name, description, color, icon, cost } = req.body;
  const c = Math.max(0, Math.round(Number(cost)) || 0);
  db.prepare('UPDATE gachas SET name = ?, description = ?, color = ?, icon = ?, cost = ? WHERE id = ?')
    .run(name, description || '', color, icon || '🎁', c, req.params.id);
  res.json({ ok: true });
});

// ===== Admin: 生徒とスイカポイント =====
app.get('/api/admin/students', (req, res) => {
  // spent   = 累計使用（引いた時点のコスト合計。旧データは現在のガチャコストで代用）
  // granted = 累計付与（残高 + 使用。初期付与/±操作/残高編集すべてで 残高=付与-使用 が成立する）
  const students = db.prepare(`
    SELECT s.id, s.name, s.points,
           COUNT(pl.id) AS pulls,
           COALESCE(SUM(COALESCE(pl.cost, g.cost)), 0) AS spent,
           s.points + COALESCE(SUM(COALESCE(pl.cost, g.cost)), 0) AS granted
    FROM students s
    LEFT JOIN pulls  pl ON pl.student_id = s.id
    LEFT JOIN gachas g  ON g.id = pl.gacha_id
    GROUP BY s.id
    ORDER BY s.name
  `).all();
  res.json(students);
});

app.post('/api/admin/students', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '名前を入力してください' });
  const points = Math.max(0, Math.round(Number(req.body.points)) || 0);
  const r = db.prepare('INSERT INTO students (name, points) VALUES (?, ?)').run(name, points);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/admin/students/:id', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '名前を入力してください' });
  const points = Math.max(0, Math.round(Number(req.body.points)) || 0);
  db.prepare('UPDATE students SET name = ?, points = ? WHERE id = ?').run(name, points, req.params.id);
  res.json({ ok: true });
});

// 頑張りに応じてスイカポイントを付与/減算（+5 などのクイック操作用）
app.post('/api/admin/students/:id/points', (req, res) => {
  const delta = Math.round(Number(req.body.delta)) || 0;
  db.prepare('UPDATE students SET points = MAX(0, points + ?) WHERE id = ?').run(delta, req.params.id);
  const s = db.prepare('SELECT id, name, points FROM students WHERE id = ?').get(req.params.id);
  res.json(s);
});

app.delete('/api/admin/students/:id', (req, res) => {
  db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/prizes', (req, res) => {
  const { gacha_id, name, description, emoji, rarity, weight, initial_stock } = req.body;
  const stock = Number.isInteger(initial_stock) ? initial_stock : -1;
  const r = db.prepare(`
    INSERT INTO prizes (gacha_id, name, description, emoji, rarity, weight, initial_stock, remaining_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(gacha_id, name, description || '', emoji || '🎁', rarity || 'N', weight ?? 10, stock, stock);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/admin/prizes/:id', (req, res) => {
  const { name, description, emoji, rarity, weight, initial_stock, remaining_stock, active } = req.body;
  db.prepare(`
    UPDATE prizes SET name = ?, description = ?, emoji = ?, rarity = ?,
    weight = ?, initial_stock = ?, remaining_stock = ?, active = ?
    WHERE id = ?
  `).run(name, description || '', emoji || '🎁', rarity || 'N',
         weight ?? 10, initial_stock, remaining_stock, active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/prizes/:id', (req, res) => {
  db.prepare('DELETE FROM prizes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/prizes/:id/reset-stock', (req, res) => {
  db.prepare('UPDATE prizes SET remaining_stock = initial_stock WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT g.id AS gacha_id, g.name AS gacha_name, g.icon AS gacha_icon,
           p.id AS prize_id, p.name AS prize_name, p.emoji AS prize_emoji, p.rarity,
           COUNT(*) AS count
    FROM pulls pl
    JOIN gachas g ON pl.gacha_id = g.id
    LEFT JOIN prizes p ON pl.prize_id = p.id
    GROUP BY pl.gacha_id, pl.prize_id
    ORDER BY g.sort_order, g.id, count DESC
  `).all();
  const totalPulls = db.prepare('SELECT COUNT(*) AS c FROM pulls').get().c;
  const perGacha = db.prepare(`
    SELECT g.id, g.name, g.icon, COUNT(pl.id) AS count
    FROM gachas g
    LEFT JOIN pulls pl ON pl.gacha_id = g.id
    GROUP BY g.id
    ORDER BY g.sort_order, g.id
  `).all();
  res.json({ stats, totalPulls, perGacha });
});

// 1回ごとの履歴（だれが・いつ・何を引いたか）。新しい順。
// limit を渡さなければ全件返す（管理画面で全履歴を見られるように）。
app.get('/api/admin/pulls', (req, res) => {
  const base = `
    SELECT pl.id, pl.pulled_at, pl.delivered,
           s.name AS student_name,
           g.name AS gacha_name, g.icon AS gacha_icon,
           p.name AS prize_name, p.emoji AS prize_emoji, p.rarity
    FROM pulls pl
    LEFT JOIN students s ON pl.student_id = s.id
    LEFT JOIN gachas   g ON pl.gacha_id   = g.id
    LEFT JOIN prizes   p ON pl.prize_id   = p.id
    ORDER BY pl.id DESC
  `;
  const limit = Number(req.query.limit);
  const pulls = limit > 0
    ? db.prepare(base + ' LIMIT ?').all(Math.min(20000, Math.floor(limit)))
    : db.prepare(base).all();
  const total = db.prepare('SELECT COUNT(*) AS c FROM pulls').get().c;
  res.json({ pulls, total });
});

app.post('/api/admin/pulls/reset', (req, res) => {
  db.prepare('DELETE FROM pulls').run();
  res.json({ ok: true });
});

// 景品の引き渡し済みフラグを切り替える（管理画面のチェックボックス）
app.post('/api/admin/pulls/:id/delivered', (req, res) => {
  const delivered = req.body && req.body.delivered ? 1 : 0;
  db.prepare('UPDATE pulls SET delivered = ? WHERE id = ?').run(delivered, req.params.id);
  res.json({ ok: true, delivered });
});

// ===== 静的配信（塾内LAN運用: client/dist をこのサーバーから配信） =====
const DIST = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(DIST));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  // ガチャ用PC（別PC）から /admin を開こうとしてもトップへ戻す。管理画面は職員PCのみ。
  if (req.path.startsWith('/admin') && !isLocalRequest(req)) return res.redirect('/');
  res.sendFile(path.join(DIST, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎰 Gacha: http://localhost:${PORT} （他のPCからは http://<このPCのIP>:${PORT}）`);
});
