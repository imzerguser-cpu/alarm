import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, setDoc, getDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { shouldResetDaily } from './daily-reset.js';

const app = initializeApp(firebaseConfig);
// IndexedDB에 오프라인 캐시를 켜둔다 — 이게 없으면 오프라인 중에 쓴 내용은
// 메모리에만 있다가 탭을 닫으면 그대로 사라진다. 켜두면 오프라인 중 저장도
// 기기에 남아 있다가 다시 연결되면 자동으로 서버에 반영된다. 태블릿 한 대
// 에서만 여는 게 기본이라 persistentSingleTabManager로 충분하다(여러 탭을
// 동시에 열 계획이면 나중에 멀티탭 매니저로 바꾸면 된다).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
});

export { shouldResetDaily };

export function subscribeSchedule(callback, onError) {
  return onSnapshot(doc(db, 'schedule', 'weekly'), { includeMetadataChanges: true }, (snap) => {
    callback(snap.exists() ? snap.data() : {}, snap.metadata.fromCache);
  }, onError);
}

export function saveSchedule(weeklyData) {
  return setDoc(doc(db, 'schedule', 'weekly'), weeklyData);
}

// 교시별 과목 아래에 교사가 덧붙이는 세부 내용(선택 사항). schedule/weekly와
// 같은 요일→교시 키 구조를 쓰지만, 값이 있는 교시만 채워지는 성긴(sparse) 문서다.
export function subscribeScheduleNotes(callback, onError) {
  return onSnapshot(doc(db, 'schedule', 'notes'), { includeMetadataChanges: true }, (snap) => {
    callback(snap.exists() ? snap.data() : {}, snap.metadata.fromCache);
  }, onError);
}

export function saveScheduleNotes(notesData) {
  return setDoc(doc(db, 'schedule', 'notes'), notesData);
}

export function subscribeRoster(callback, onError) {
  return onSnapshot(doc(db, 'roster', 'students'), { includeMetadataChanges: true }, (snap) => {
    callback(snap.exists() ? (snap.data().list || []) : [], snap.metadata.fromCache);
  }, onError);
}

export function saveRoster(list) {
  return setDoc(doc(db, 'roster', 'students'), { list });
}

export function subscribeDaily(callback, onError) {
  return onSnapshot(doc(db, 'daily', 'current'), { includeMetadataChanges: true }, (snap) => {
    callback(snap.exists() ? snap.data() : null, snap.metadata.fromCache);
  }, onError);
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
    await setDoc(ref, fresh);
    return fresh;
  }
  return current;
}
