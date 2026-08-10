import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStudent } from '../student.jsx';

// 「はずれ」は受け取るものが無いので引き渡し表示を出さない。
function isMiss(p) {
  return (p.prize_name || '') === 'はずれ';
}

// pulled_at は SQLite の CURRENT_TIMESTAMP（UTC文字列）。ローカルの月日 時:分に直す。
function fmtTime(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

export default function Wins() {
  const navigate = useNavigate();
  const { student } = useStudent();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!student) { navigate('/'); return; }
    fetch(`/api/students/${student.id}/pulls`).then(r => r.json()).then(setData);
  }, [student, navigate]);

  if (!student) return null;
  if (!data) return <div className="loading">読み込み中...</div>;

  return (
    <div className="wins-page">
      <Link to="/" className="back-link">← 戻る</Link>
      <h1 className="page-title">
        <span className="page-title-chip" style={{ background: 'var(--flesh)' }}>🏆</span>
        {student.name}さんの獲得景品
      </h1>

      {data.pulls.length === 0 ? (
        <p className="empty-note">
          まだ何も当てていません。<br />ガチャをまわしてみよう！
        </p>
      ) : (
        <ul className="win-log">
          {data.pulls.map(p => (
            <li key={p.id} className={`win-row rarity-${p.rarity || 'N'}`}>
              <span className="win-time">{fmtTime(p.pulled_at)}</span>
              <span className="win-emoji">{p.prize_emoji || '❓'}</span>
              <span className="win-name">{p.prize_name || '(不明)'}</span>
              {!isMiss(p) && (
                <span className={`win-deliver ${p.delivered ? 'done' : 'pending'}`}>
                  {p.delivered ? '✓ 受け取り済み' : '未受け取り'}
                </span>
              )}
              <span className="win-gacha">{p.gacha_icon} {p.gacha_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
