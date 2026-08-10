import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

const ORDER = ['SSR', 'SR', 'R', 'N'];
const LABEL = { SSR: '超レア', SR: 'スーパーレア', R: 'レア', N: 'ノーマル' };

export default function Prizes() {
  const { key } = useParams();
  const [gacha, setGacha] = useState(null);

  useEffect(() => {
    fetch(`/api/gachas/${key}`).then(r => r.json()).then(setGacha);
  }, [key]);

  if (!gacha) return <div className="loading">読み込み中...</div>;

  const grouped = {};
  for (const p of gacha.prizes) {
    if (!grouped[p.rarity]) grouped[p.rarity] = [];
    grouped[p.rarity].push(p);
  }

  return (
    <div className="prizes-page" style={{ '--theme': gacha.color }}>
      <Link to={`/gacha/${key}`} className="back-link">← ガチャに戻る</Link>
      <h1 className="page-title">
        <span style={{ background: gacha.color }} className="page-title-chip">{gacha.icon}</span>
        {gacha.name} の景品
      </h1>

      {ORDER.filter(r => grouped[r]).map(rarity => (
        <div key={rarity} className="rarity-section">
          <h2 className={`rarity-header rarity-${rarity}`}>
            {rarity} <span className="rarity-label">{LABEL[rarity]}</span>
          </h2>
          <div className="prize-grid">
            {grouped[rarity].map(p => (
              <div key={p.id} className={`prize-card rarity-${p.rarity} ${p.sold_out ? 'sold' : ''}`}>
                <div className="prize-bubble">
                  <span className="prize-emoji">{p.emoji}</span>
                </div>
                <h3>{p.name}</h3>
                {p.description && <p className="prize-desc">{p.description}</p>}
                <div className="prize-meta">
                  <span className="probability">{p.probability.toFixed(1)}%</span>
                </div>
                {p.sold_out && <div className="sold-out-tag">SOLD OUT</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
