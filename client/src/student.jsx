import { createContext, useContext, useState } from 'react';

const StudentContext = createContext(null);
const STORAGE_KEY = 'gacha_student';

// キオスク運用: いま誰がガチャを回しているか（生徒とスイカポイント残高）を
// アプリ全体で共有する。localStorage に持たせて、リロードしても選び直さなくて済む。
export function StudentProvider({ children }) {
  const [student, setStudentState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch { return null; }
  });

  function setStudent(s) {
    setStudentState(s);
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  }

  // サーバーから最新の残高を取り直す（スタッフが付与した分などを反映）。
  async function refresh() {
    if (!student) return;
    try {
      const r = await fetch(`/api/students/${student.id}`);
      if (r.ok) {
        const s = await r.json();
        if (s && s.id) setStudent(s);
        else setStudent(null); // 削除済み
      } else if (r.status === 404) {
        setStudent(null);
      }
    } catch { /* オフライン時は現状維持 */ }
  }

  return (
    <StudentContext.Provider value={{ student, setStudent, refresh }}>
      {children}
    </StudentContext.Provider>
  );
}

export function useStudent() {
  return useContext(StudentContext);
}
