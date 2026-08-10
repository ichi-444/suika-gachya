import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useStudent } from '../student.jsx';

// スイカが割れる演出の長さ。styles.css の melon-half / smash-stick のアニメと合わせる。
const BREAK_MS = 1500;

export default function Gacha() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { student, setStudent } = useStudent();
  const [gacha, setGacha] = useState(null);
  const [phase, setPhase] = useState('ready'); // ready | loading | aim | breaking | revealed
  const [result, setResult] = useState(null);
  const [golden, setGolden] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!student) { navigate('/'); return; }
    fetch(`/api/gachas/${key}`).then(r => r.json()).then(setGacha);
  }, [key, student, navigate]);

  if (!student) return null;
  if (!gacha) return <div className="loading">読み込み中...</div>;

  const cost = gacha.cost ?? 0;
  const canPull = student.points >= cost;

  // スタート → サーバーで抽選（ここで金色スイカかどうかも決まる）
  async function start() {
    if (!canPull || phase !== 'ready') return;
    setPhase('loading');
    setResult(null);
    setGolden(false);
    setError(null);
    try {
      const res = await fetch(`/api/gachas/${key}/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: student.id })
      }).then(r => r.json());
      if (res.error) {
        setError(res.error);
        setPhase('ready');
        return;
      }
      if (typeof res.points === 'number') setStudent({ ...student, points: res.points });
      setResult(res.prize);
      setGolden(!!res.golden);
      setPhase('aim');
    } catch (e) {
      setError('通信エラーが発生しました');
      setPhase('ready');
    }
  }

  // タップ → 棒でスイカを割る
  function smash() {
    if (phase !== 'aim') return;
    setPhase('breaking');
    setTimeout(() => setPhase('revealed'), BREAK_MS);
  }

  function again() {
    setPhase('ready');
    setResult(null);
    setGolden(false);
    setError(null);
  }

  const showMelon = phase === 'loading' || phase === 'aim' || phase === 'breaking';

  return (
    <div className="gacha-page" style={{ '--theme': gacha.color }}>
      <Link to="/" className="back-link">← 戻る</Link>
      <h1 className="page-title">
        <span style={{ background: gacha.color }} className="page-title-chip">{gacha.icon}</span>
        {gacha.name}
      </h1>
      <p className="description">{gacha.description}</p>

      {error && <div className="error-box">{error}</div>}

      <div className="gacha-stage">
        {phase === 'ready' && (
          <div className="smash-intro">
            <div className="smash-peek" aria-hidden="true">
              <span className="smash-peek-melon">🍉</span>
              <span className="smash-peek-stick" />
            </div>
            <div className="smash-start-wrap">
              <button className="smash-start" onClick={start} disabled={!canPull}>
                {canPull ? 'スイカ割り スタート！' : 'ポイントが足りません'}
              </button>
            </div>
            <div className="cost-panel">
              <div className="cost-chip cost-need">
                <span className="cost-chip-label">必要ポイント</span>
                <span className="cost-chip-value"><span className="melon">🍉</span>{cost}</span>
              </div>
              <div className="cost-chip cost-have">
                <span className="cost-chip-label">所持ポイント</span>
                <span className="cost-chip-value"><span className="melon">🍉</span>{student.points}</span>
              </div>
            </div>
            {!canPull && (
              <p className="need-more">
                スイカポイントがあと <strong>{cost - student.points}🍉</strong> 必要です
              </p>
            )}
          </div>
        )}

        {showMelon && (
          <div className="smash-stage">
            {golden && (
              <div className="golden-banner">✨ 金色スイカ！SR以上確定 ✨</div>
            )}
            <div className="smash-arena">
              <button
                className={[
                  'big-melon',
                  golden ? 'golden' : '',
                  phase === 'breaking' ? 'breaking' : ''
                ].filter(Boolean).join(' ')}
                onClick={smash}
                disabled={phase !== 'aim'}
                aria-label="スイカを割る"
              >
                <span className="melon-core" />
                <span className="seed-burst" aria-hidden="true">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <span key={i} style={{ '--r': `${i * 45}deg` }} />
                  ))}
                </span>
                <span className="melon-prize">{result?.emoji}</span>
                <span className="melon-half left" />
                <span className="melon-half right" />
              </button>
              <span className={`smash-stick ${phase === 'breaking' ? 'swing' : ''}`} aria-hidden="true" />
            </div>
            {phase !== 'breaking' && (
              <p className="smash-hint">
                {phase === 'loading' ? 'スイカを用意中…' : 'タップして棒で割ろう！'}
              </p>
            )}
          </div>
        )}

        {phase === 'revealed' && result && (
          <div className="result-stage">
            {golden && <div className="golden-tag">✨ 金色スイカ ボーナス ✨</div>}
            <div className={`result-card rarity-${result.rarity}`}>
              <div className="rarity-badge">{result.rarity}</div>
              <div className="result-emoji">{result.emoji}</div>
              <h2 className="result-name">{result.name}</h2>
              {result.description && <p className="result-desc">{result.description}</p>}
            </div>
            <div className="result-actions">
              {canPull ? (
                <button className="btn-melon" onClick={again}>
                  もう一回！<span className="btn-sub">🍉{cost}</span>
                </button>
              ) : (
                <span className="btn-melon disabled">ポイントが足りません</span>
              )}
              <Link to="/" className="btn-ghost">トップへ</Link>
            </div>
          </div>
        )}
      </div>

      {phase === 'ready' && (
        <div className="actions">
          <Link to={`/gacha/${key}/prizes`} className="btn-ghost">
            景品を見る
          </Link>
        </div>
      )}
    </div>
  );
}
