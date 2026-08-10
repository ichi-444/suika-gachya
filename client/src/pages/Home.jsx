import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStudent } from '../student.jsx';

export default function Home() {
  const { student, setStudent, refresh } = useStudent();
  const [gachas, setGachas] = useState([]);
  const [students, setStudents] = useState([]);

  useEffect(() => {
    fetch('/api/gachas').then(r => r.json()).then(setGachas);
  }, []);

  // 選択中の生徒がいれば、トップに戻るたびに最新の残高へ更新する
  useEffect(() => {
    if (student) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 生徒未選択のときだけ、選ぶための一覧を取りに行く
  useEffect(() => {
    if (!student) fetch('/api/students').then(r => r.json()).then(setStudents);
  }, [student]);

  if (!student) return <StudentPicker students={students} onPick={setStudent} />;

  return (
    <div className="home">
      <div className="home-hero">
        <p className="hero-hi">こんにちは、<strong>{student.name}</strong>さん！</p>
        <h1 className="title">ガチャを選んでください</h1>
        <p className="wallet-big">
          スイカポイント
          <span className="wallet-big-count"><span className="melon">🍉</span>{student.points}</span>
        </p>
        <div className="wins-link-row">
          <Link to="/wins" className="btn-ghost wins-link">🏆 獲得景品一覧</Link>
        </div>
      </div>

      <div className="gacha-grid">
        {gachas.map((g, i) => {
          const afford = student.points >= (g.cost ?? 0);
          return (
            <div
              key={g.id}
              className="gacha-card"
              style={{ '--theme': g.color, animationDelay: `${i * 0.08}s` }}
            >
              <div className="gacha-melon">
                <span className="gacha-icon-big">{g.icon}</span>
              </div>
              <h2>{g.name}</h2>
              <p>{g.description}</p>
              <div className="cost-tag" data-afford={afford ? '1' : '0'}>
                <span className="melon">🍉</span> {g.cost} ポイント
              </div>
              <div className="gacha-buttons">
                {afford ? (
                  <Link to={`/gacha/${g.key}`} className="btn-melon">回す！</Link>
                ) : (
                  <span className="btn-melon disabled">ポイントが足りません</span>
                )}
                <Link to={`/gacha/${g.key}/prizes`} className="btn-ghost">景品を見る</Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// あかさたな…の行分け（大人数の名簿を頭文字でしぼるため）
const KANA_ROWS = [
  ['あ', 'あいうえおぁぃぅぇぉ'],
  ['か', 'かきくけこがぎぐげご'],
  ['さ', 'さしすせそざじずぜぞ'],
  ['た', 'たちつてとだぢづでどっ'],
  ['な', 'なにぬねの'],
  ['は', 'はひふへほばびぶべぼぱぴぷぺぽ'],
  ['ま', 'まみむめも'],
  ['や', 'やゆよゃゅょ'],
  ['ら', 'らりるれろ'],
  ['わ', 'わをんゐゑー']
];

function rowOf(name) {
  const t = (name || '').trim();
  if (!t) return 'その他';
  let c = t[0];
  const code = c.charCodeAt(0);
  if (code >= 0x30a1 && code <= 0x30f6) c = String.fromCharCode(code - 0x60); // カタカナ→ひらがな
  for (const [label, chars] of KANA_ROWS) if (chars.includes(c)) return label;
  return 'その他';
}

function StudentPicker({ students, onPick }) {
  const [q, setQ] = useState('');
  const [row, setRow] = useState('すべて');

  const query = q.trim();
  // 検索文字があれば頭文字フィルタは無視して名簿全体から絞り込む
  const filtered = students.filter(s => {
    if (query) return s.name.includes(query);
    if (row === 'すべて') return true;
    return rowOf(s.name) === row;
  });

  // 実際に生徒がいる行だけインデックスに出す
  const present = new Set(students.map(s => rowOf(s.name)));
  const tabs = ['すべて', ...KANA_ROWS.map(r => r[0]), 'その他']
    .filter(r => r === 'すべて' || present.has(r));

  return (
    <div className="picker">
      <div className="picker-head">
        <span className="picker-melon">🍉</span>
        <h1 className="title">「東進スイカガチャ」へようこそ</h1>
        <p className="subtitle">自分の名前を選んでください</p>
      </div>

      {students.length === 0 ? (
        <p className="empty-note">
          まだ生徒が登録されていません。<br />スタッフが管理画面から追加してください。
        </p>
      ) : (
        <>
          <div className="picker-tools">
            <div className="search-box">
              <span className="search-ico" aria-hidden="true">🔍</span>
              <input
                type="text"
                placeholder="名前検索"
                value={q}
                onChange={e => { setQ(e.target.value); setRow('すべて'); }}
              />
              {q && (
                <button className="search-clear" onClick={() => setQ('')} aria-label="消す">×</button>
              )}
            </div>
            {!query && (
              <div className="kana-index">
                {tabs.map(r => (
                  <button
                    key={r}
                    className={`kana-tab ${row === r ? 'active' : ''}`}
                    onClick={() => setRow(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="picker-count">{filtered.length}人</p>

          {filtered.length === 0 ? (
            <p className="empty-note">見つかりません。<br />名前を確認してください。</p>
          ) : (
            <div className="student-grid">
              {filtered.map((s, i) => (
                <button
                  key={s.id}
                  className="student-chip"
                  style={{ animationDelay: `${Math.min(i, 24) * 0.03}s` }}
                  onClick={() => onPick(s)}
                >
                  <span className="student-face">🍉</span>
                  <span className="student-name">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
