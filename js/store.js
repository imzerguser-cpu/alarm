import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, setDoc, getDoc,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { shouldResetDaily } from './daily-reset.js';

const app = initializeApp(firebaseConfig);
// IndexedDB에 오프라인 캐시를 켜둔다 — 이게 없으면 오프라인 중에 쓴 내용은
// 메모리에만 있다가 탭을 닫으면 그대로 사라진다. 켜두면 오프라인 중 저장도
// 기기에 남아 있다가 다시 연결되면 자동으로 서버에 반영된다.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
});

export { shouldResetDaily };

// 편집은 항상 이 화면(태블릿)에서만 한다는 전제로, 실시간 구독(onSnapshot)
// 대신 페이지를 열 때 한 번만 불러온다. 편집한 내용은 저장할 때 화면에도
// 바로 반영하므로(main.js) 구독 없이도 화면은 항상 최신이다. 다른 기기에서
// 편집했다면 이 화면은 다시 열어야 반영된다 — 그 대신 계속 연결을 붙들고
// 있지 않아도 되니 훨씬 단순하고, 배터리·데이터도 덜 쓴다.
export async function fetchSchedule() {
  const snap = await getDoc(doc(db, 'schedule', 'weekly'));
  return { data: snap.exists() ? snap.data() : {}, fromCache: snap.metadata.fromCache };
}

export function saveSchedule(weeklyData) {
  return setDoc(doc(db, 'schedule', 'weekly'), weeklyData);
}

// 교시별 과목 아래에 교사가 덧붙이는 세부 내용(선택 사항). schedule/weekly와
// 같은 요일→교시 키 구조를 쓰지만, 값이 있는 교시만 채워지는 성긴(sparse) 문서다.
export async function fetchScheduleNotes() {
  const snap = await getDoc(doc(db, 'schedule', 'notes'));
  return { data: snap.exists() ? snap.data() : {}, fromCache: snap.metadata.fromCache };
}

export function saveScheduleNotes(notesData) {
  return setDoc(doc(db, 'schedule', 'notes'), notesData);
}

export async function fetchRoster() {
  const snap = await getDoc(doc(db, 'roster', 'students'));
  return { data: snap.exists() ? (snap.data().list || []) : [], fromCache: snap.metadata.fromCache };
}

export function saveRoster(list) {
  return setDoc(doc(db, 'roster', 'students'), { list });
}

export function saveDaily(data) {
  return setDoc(doc(db, 'daily', 'current'), data, { merge: true });
}

export async function ensureTodayDaily(todayDateKey) {
  const ref = doc(db, 'daily', 'current');
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : null;
  if (!current || shouldResetDaily(current.date, todayDateKey)) {
    const fresh = {
      date: todayDateKey, morningNotice: '', generalNotice: '', todos: {}, submits: {},
    };
    // setDoc()은 오프라인 지속성이 켜진 상태에서 오프라인이면 실제 서버 응답이
    // 올 때까지 프라미스가 resolve되지 않는다(로컬 캐시에는 즉시 반영되지만).
    // await하면 자정 날짜 전환이나 최초 로드가 오프라인 상태에서 그대로
    // 멈춰버리므로(재연결 전까지 화면에 어제 내용이 그대로 남는다), 쓰기는
    // 백그라운드로 흘려보내고 fresh는 즉시 반환한다.
    setDoc(ref, fresh).catch((err) => console.error('daily 초기화 저장 실패:', err));
    return fresh;
  }
  return current;
}
