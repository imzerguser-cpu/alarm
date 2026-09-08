import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { shouldResetDaily } from './daily-reset.js';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export { shouldResetDaily };

export function subscribeSchedule(callback) {
  return onSnapshot(doc(db, 'schedule', 'weekly'), { includeMetadataChanges: true }, (snap) => {
    callback(snap.exists() ? snap.data() : {}, snap.metadata.fromCache);
  });
}

export function saveSchedule(weeklyData) {
  return setDoc(doc(db, 'schedule', 'weekly'), weeklyData);
}

export function subscribeRoster(callback) {
  return onSnapshot(doc(db, 'roster', 'students'), { includeMetadataChanges: true }, (snap) => {
    callback(snap.exists() ? (snap.data().list || []) : [], snap.metadata.fromCache);
  });
}

export function saveRoster(list) {
  return setDoc(doc(db, 'roster', 'students'), { list });
}

export function subscribeDaily(callback) {
  return onSnapshot(doc(db, 'daily', 'current'), { includeMetadataChanges: true }, (snap) => {
    callback(snap.exists() ? snap.data() : null, snap.metadata.fromCache);
  });
}

export function saveDaily(data) {
  return setDoc(doc(db, 'daily', 'current'), data, { merge: true });
}

export async function ensureTodayDaily(todayDateKey) {
  const ref = doc(db, 'daily', 'current');
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : null;
  if (!current || shouldResetDaily(current.date, todayDateKey)) {
    const fresh = { date: todayDateKey, morningNotice: '', generalNotice: '', todos: {} };
    await setDoc(ref, fresh);
    return fresh;
  }
  return current;
}
