import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Gacha from './pages/Gacha.jsx';
import Prizes from './pages/Prizes.jsx';
import Wins from './pages/Wins.jsx';
import Admin from './pages/Admin.jsx';
import { StudentProvider, useStudent } from './student.jsx';

function Header() {
  const { student, setStudent } = useStudent();
  const navigate = useNavigate();

  function switchStudent() {
    setStudent(null);
    navigate('/');
  }

  return (
    <header className="header">
      <Link to="/" className="logo">
        <span className="logo-emoji">🍉</span>
        <span>東進スイカガチャ</span>
      </Link>
      {student && (
        <div className="wallet">
          <span className="wallet-name">{student.name}</span>
          <span className="wallet-points"><span className="wallet-melon">🍉</span>{student.points}</span>
          <button className="wallet-switch" onClick={switchStudent}>ログイン画面に戻る</button>
        </div>
      )}
    </header>
  );
}

export default function App() {
  return (
    <StudentProvider>
      <div className="app">
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/gacha/:key" element={<Gacha />} />
            <Route path="/gacha/:key/prizes" element={<Prizes />} />
            <Route path="/wins" element={<Wins />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </main>
        <div className="field" aria-hidden="true">
          {Array.from({ length: 14 }).map((_, i) => <span key={i} style={{ '--i': i }} />)}
        </div>
      </div>
    </StudentProvider>
  );
}
