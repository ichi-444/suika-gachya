import { useEffect, useState } from 'react';

const RARITIES = [
  { value: 'N',   label: 'N（ノーマル）' },
  { value: 'R',   label: 'R（レア）' },
  { value: 'SR',  label: 'SR（スーパーレア）' },
  { value: 'SSR', label: 'SSR（超レア）' }
];

// 「はずれ」は渡すものが無いので引き渡しチェックの対象外にする（初期データ名に合わせた判定）。
function isMiss(p) {
  return (p.prize_name || '') === 'はずれ';
}

// pulled_at は SQLite の CURRENT_TIMESTAMP（UTC文字列）。職員PCのローカル時刻に直して表示。
function fmtTime(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

export default function Admin() {
  const [gachas, setGachas] = useState([]);
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState(null);
  const [pulls, setPulls] = useState({ pulls: [], total: 0 });
  const [editing, setEditing] = useState(null); // prize being edited (or new)
  const [editingGacha, setEditingGacha] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);

  async function load() {
    const [g, st, s, pl] = await Promise.all([
      fetch('/api/admin/gachas').then(r => r.json()),
      fetch('/api/admin/students').then(r => r.json()),
      fetch('/api/admin/stats').then(r => r.json()),
      fetch('/api/admin/pulls').then(r => r.json())
    ]);
    setGachas(g);
    setStudents(st);
    setStats(s);
    setPulls(pl);
  }

  useEffect(() => { load(); }, []);

  async function savePrize(prize) {
    const isNew = !prize.id;
    const url = isNew ? '/api/admin/prizes' : `/api/admin/prizes/${prize.id}`;
    await fetch(url, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prize)
    });
    setEditing(null);
    load();
  }

  async function deletePrize(id) {
    if (!confirm('この景品を削除しますか？')) return;
    await fetch(`/api/admin/prizes/${id}`, { method: 'DELETE' });
    load();
  }

  async function resetStock(id) {
    await fetch(`/api/admin/prizes/${id}/reset-stock`, { method: 'POST' });
    load();
  }

  async function saveGacha(g) {
    await fetch(`/api/admin/gachas/${g.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...g, cost: Number(g.cost) || 0 })
    });
    setEditingGacha(null);
    load();
  }

  async function resetPulls() {
    if (!confirm('当選履歴をすべてリセットします。よろしいですか？')) return;
    await fetch('/api/admin/pulls/reset', { method: 'POST' });
    load();
  }

  // 景品を渡したかのチェック。件数が多いので全体リロードせず該当行だけ更新する。
  async function toggleDelivered(id, delivered) {
    await fetch(`/api/admin/pulls/${id}/delivered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delivered })
    });
    setPulls(prev => ({
      ...prev,
      pulls: prev.pulls.map(p => p.id === id ? { ...p, delivered: delivered ? 1 : 0 } : p)
    }));
  }

  async function saveStudent(s) {
    const isNew = !s.id;
    const url = isNew ? '/api/admin/students' : `/api/admin/students/${s.id}`;
    await fetch(url, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: s.name, points: Number(s.points) || 0 })
    });
    setEditingStudent(null);
    load();
  }

  async function deleteStudent(id) {
    if (!confirm('この生徒を削除しますか？（スイカポイントも消えます）')) return;
    await fetch(`/api/admin/students/${id}`, { method: 'DELETE' });
    load();
  }

  // 頑張りに応じてスイカポイントを付与/減算（+5 などのクイック操作）
  async function addPoints(id, delta) {
    await fetch(`/api/admin/students/${id}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta })
    });
    load();
  }

  const totalBalance = students.reduce((a, s) => a + (s.points || 0), 0);
  const totalGranted = students.reduce((a, s) => a + (s.granted || 0), 0);
  const totalSpent = students.reduce((a, s) => a + (s.spent || 0), 0);

  return (
    <div className="admin-page">
      <h1 className="page-title">
        <span className="page-title-chip" style={{ background: '#3ba55d' }}>⚙️</span>
        管理画面
      </h1>

      {stats && (
        <div className="stats-summary">
          <div className="stat-box">
            <span className="stat-label">総ガチャ回数</span>
            <span className="stat-value">{stats.totalPulls}</span>
          </div>
          {stats.perGacha.map(p => (
            <div key={p.id} className="stat-box">
              <span className="stat-label">{p.icon} {p.name}</span>
              <span className="stat-value">{p.count}</span>
            </div>
          ))}
          <button className="btn-ghost danger" onClick={resetPulls}>履歴リセット</button>
        </div>
      )}

      {/* ===== 生徒とスイカポイント ===== */}
      <section className="admin-students">
        <header className="admin-section-head">
          <h2>🍉 生徒とスイカポイント</h2>
          <button
            className="btn-melon sm"
            onClick={() => setEditingStudent({ name: '', points: 0 })}
          >
            + 生徒を追加
          </button>
        </header>
        {students.length > 0 && (
          <div className="points-totals">
            <span className="pt-box"><span className="pt-label">累計付与</span><span className="pt-value">🍉 {totalGranted}</span></span>
            <span className="pt-box"><span className="pt-label">累計使用</span><span className="pt-value">🍉 {totalSpent}</span></span>
            <span className="pt-box"><span className="pt-label">現在の残高合計</span><span className="pt-value">🍉 {totalBalance}</span></span>
          </div>
        )}
        <div className="table-scroll">
          <table className="student-table">
            <thead>
              <tr>
                <th>名前</th>
                <th>残高</th>
                <th>累計付与</th>
                <th>累計使用</th>
                <th>回した回数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id}>
                  <td className="student-cell">{s.name}</td>
                  <td className="points-cell"><span className="melon">🍉</span> {s.points}</td>
                  <td className="granted-cell">🍉 {s.granted ?? 0}</td>
                  <td className="spent-cell">🍉 {s.spent ?? 0}</td>
                  <td>{s.pulls}</td>
                  <td>
                    <div className="ops-cell">
                      <span className="give-cell">
                        <button onClick={() => addPoints(s.id, 1)}>+1</button>
                        <button onClick={() => addPoints(s.id, 5)}>+5</button>
                        <button onClick={() => addPoints(s.id, 10)}>+10</button>
                        <button className="minus" onClick={() => addPoints(s.id, -5)}>-5</button>
                      </span>
                      <span className="ops-divider" aria-hidden="true" />
                      <span className="actions-cell">
                        <button onClick={() => setEditingStudent({ ...s })}>編集</button>
                        <button onClick={() => deleteStudent(s.id)} className="danger">削除</button>
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr><td colSpan="6" className="empty-cell">生徒がいません。「+ 生徒を追加」から登録してください。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {gachas.map(gacha => (
        <section key={gacha.id} className="admin-gacha">
          <header className="admin-gacha-header" style={{ background: gacha.color }}>
            <h2>
              {gacha.icon} {gacha.name}
              <span className="gacha-cost-badge">🍉 {gacha.cost} / 回</span>
            </h2>
            <div className="admin-gacha-actions">
              <button onClick={() => setEditingGacha({ ...gacha })}>ガチャ設定</button>
              <button onClick={() => setEditing({
                gacha_id: gacha.id, name: '', description: '', emoji: '🎁',
                rarity: 'N', weight: 10, initial_stock: -1, active: 1
              })}>+ 景品追加</button>
            </div>
          </header>

          <div className="table-scroll">
            <table className="prize-table">
              <thead>
                <tr>
                  <th></th><th>名前</th><th>レア</th><th>重み</th><th>確率</th><th>在庫</th><th>有効</th><th></th>
                </tr>
              </thead>
              <tbody>
                {gacha.prizes.map(p => (
                  <tr key={p.id} className={!p.active ? 'inactive' : ''}>
                    <td className="emoji-cell">{p.emoji}</td>
                    <td>
                      <div className="prize-name">{p.name}</div>
                      {p.description && <div className="prize-sub">{p.description}</div>}
                    </td>
                    <td><span className={`rarity-tag rarity-${p.rarity}`}>{p.rarity}</span></td>
                    <td>{p.weight}</td>
                    <td>{p.active ? `${p.probability.toFixed(1)}%` : '-'}</td>
                    <td>
                      {p.initial_stock === -1
                        ? '∞'
                        : <span className={p.remaining_stock <= 0 ? 'out' : ''}>{p.remaining_stock} / {p.initial_stock}</span>}
                    </td>
                    <td>{p.active ? '✓' : '—'}</td>
                    <td className="actions-cell">
                      <button onClick={() => setEditing({ ...p })}>編集</button>
                      {p.initial_stock !== -1 && (
                        <button onClick={() => resetStock(p.id)}>在庫戻す</button>
                      )}
                      <button onClick={() => deletePrize(p.id)} className="danger">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {pulls.pulls.length > 0 && (
        <section className="admin-stats">
          <div className="admin-section-head">
            <h2>🕒 ガチャ履歴</h2>
            <span className="log-count">全 {pulls.total} 件</span>
          </div>
          <div className="table-scroll log-scroll">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>生徒</th>
                  <th>ガチャ</th>
                  <th>景品</th>
                  <th>レア</th>
                  <th>引き渡し</th>
                </tr>
              </thead>
              <tbody>
                {pulls.pulls.map(p => (
                  <tr key={p.id} className={!isMiss(p) && p.delivered ? 'delivered-row' : ''}>
                    <td className="log-time">{fmtTime(p.pulled_at)}</td>
                    <td className="log-student">{p.student_name || '（不明）'}</td>
                    <td>{p.gacha_icon} {p.gacha_name}</td>
                    <td>{p.prize_emoji || '?'} {p.prize_name || '(削除済み)'}</td>
                    <td>{p.rarity && <span className={`rarity-tag rarity-${p.rarity}`}>{p.rarity}</span>}</td>
                    <td className="deliver-cell">
                      {isMiss(p) ? (
                        <span className="deliver-na">—</span>
                      ) : (
                        <label className={`deliver-check ${p.delivered ? 'done' : ''}`}>
                          <input
                            type="checkbox"
                            checked={!!p.delivered}
                            onChange={e => toggleDelivered(p.id, e.target.checked)}
                          />
                          <span>{p.delivered ? '済' : '未'}</span>
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stats && stats.stats.length > 0 && (
        <section className="admin-stats">
          <h2>📊 景品ごとの集計</h2>
          <div className="table-scroll">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>ガチャ</th>
                  <th>景品</th>
                  <th>レア</th>
                  <th>当選回数</th>
                </tr>
              </thead>
              <tbody>
                {stats.stats.map((s, i) => (
                  <tr key={i}>
                    <td>{s.gacha_icon} {s.gacha_name}</td>
                    <td>{s.prize_emoji || '?'} {s.prize_name || '(削除済み)'}</td>
                    <td>{s.rarity && <span className={`rarity-tag rarity-${s.rarity}`}>{s.rarity}</span>}</td>
                    <td><strong>{s.count}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editing && (
        <PrizeModal
          prize={editing}
          onSave={savePrize}
          onCancel={() => setEditing(null)}
        />
      )}

      {editingGacha && (
        <GachaModal
          gacha={editingGacha}
          onSave={saveGacha}
          onCancel={() => setEditingGacha(null)}
        />
      )}

      {editingStudent && (
        <StudentModal
          student={editingStudent}
          onSave={saveStudent}
          onCancel={() => setEditingStudent(null)}
        />
      )}
    </div>
  );
}

function PrizeModal({ prize, onSave, onCancel }) {
  const [form, setForm] = useState({
    ...prize,
    active: prize.active === undefined ? true : !!prize.active
  });
  const isNew = !prize.id;

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function submit(e) {
    e.preventDefault();
    onSave({
      ...form,
      weight: Number(form.weight) || 0,
      initial_stock: Number(form.initial_stock),
      remaining_stock: isNew ? Number(form.initial_stock) : Number(form.remaining_stock),
      active: form.active ? 1 : 0
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{isNew ? '景品を追加' : '景品を編集'}</h3>
        <form onSubmit={submit}>
          <div className="row">
            <label className="emoji-input">
              絵文字
              <input value={form.emoji || ''} onChange={e => update('emoji', e.target.value)} maxLength="4" />
            </label>
            <label className="flex-1">
              名前
              <input value={form.name || ''} onChange={e => update('name', e.target.value)} required />
            </label>
          </div>
          <label>
            説明
            <input value={form.description || ''} onChange={e => update('description', e.target.value)} />
          </label>
          <div className="row">
            <label className="flex-1">
              レアリティ
              <select value={form.rarity} onChange={e => update('rarity', e.target.value)}>
                {RARITIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label className="flex-1">
              重み（大きいほど出やすい）
              <input type="number" value={form.weight} onChange={e => update('weight', e.target.value)} min="0" required />
            </label>
          </div>
          <div className="row">
            <label className="flex-1">
              初期在庫（-1 = 無制限）
              <input type="number" value={form.initial_stock} onChange={e => update('initial_stock', e.target.value)} required />
            </label>
            {!isNew && (
              <label className="flex-1">
                残り在庫
                <input type="number" value={form.remaining_stock} onChange={e => update('remaining_stock', e.target.value)} />
              </label>
            )}
          </div>
          {!isNew && (
            <label className="checkbox">
              <input type="checkbox" checked={!!form.active} onChange={e => update('active', e.target.checked)} />
              この景品を有効にする
            </label>
          )}
          <div className="modal-actions">
            <button type="button" onClick={onCancel}>キャンセル</button>
            <button type="submit" className="primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GachaModal({ gacha, onSave, onCancel }) {
  const [form, setForm] = useState({ ...gacha });

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function submit(e) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>ガチャ設定</h3>
        <form onSubmit={submit}>
          <div className="row">
            <label className="emoji-input">
              アイコン
              <input value={form.icon || ''} onChange={e => update('icon', e.target.value)} maxLength="4" />
            </label>
            <label className="flex-1">
              ガチャ名
              <input value={form.name || ''} onChange={e => update('name', e.target.value)} required />
            </label>
          </div>
          <label>
            説明
            <input value={form.description || ''} onChange={e => update('description', e.target.value)} />
          </label>
          <div className="row">
            <label className="flex-1">
              1回のコスト（スイカポイント）
              <input type="number" min="0" value={form.cost ?? 0} onChange={e => update('cost', e.target.value)} required />
            </label>
            <label className="flex-1">
              テーマカラー
              <input type="color" value={form.color} onChange={e => update('color', e.target.value)} />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onCancel}>キャンセル</button>
            <button type="submit" className="primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StudentModal({ student, onSave, onCancel }) {
  const [form, setForm] = useState({ ...student });
  const isNew = !student.id;

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function submit(e) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{isNew ? '生徒を追加' : '生徒を編集'}</h3>
        <form onSubmit={submit}>
          <label>
            名前
            <input value={form.name || ''} onChange={e => update('name', e.target.value)} required autoFocus />
          </label>
          <label>
            スイカポイント（残高）
            <input type="number" min="0" value={form.points ?? 0} onChange={e => update('points', e.target.value)} required />
          </label>
          <div className="modal-actions">
            <button type="button" onClick={onCancel}>キャンセル</button>
            <button type="submit" className="primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
}
