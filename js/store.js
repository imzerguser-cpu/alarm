import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, setDoc, getDoc, deleteField,
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

export { shouldResetDaily, deleteField };

// 여러 선생님이 같은 앱을 각자 반 데이터로 따로 쓸 수 있도록, 모든 문서를
// rooms/{roomId}/... 밑에 둔다. main.js는 페이지를 시작할 때(교실 코드가
// 정해진 뒤) 가장 먼저 setRoomId()를 호출해야 하고, 그 전에는
// 아래 fetch*/save* 함수를 쓸 수 없다(교실이 안 정해진 채로 아무 데나 읽고
// 쓰면 안 되므로 일부러 예외를 던진다).
let currentRoomId = null;

export function setRoomId(roomId) {
  currentRoomId = roomId;
}

function roomDoc(collectionName, docId) {
  if (!currentRoomId) {
    throw new Error('교실 코드가 설정되지 않았습니다. setRoomId()를 먼저 호출해야 합니다.');
  }
  return doc(db, 'rooms', currentRoomId, collectionName, docId);
}

// 편집은 항상 이 화면(태블릿)에서만 한다는 전제로, 실시간 구독(onSnapshot)
// 대신 페이지를 열 때 한 번만 불러온다. 편집한 내용은 저장할 때 화면에도
// 바로 반영하므로(main.js) 구독 없이도 화면은 항상 최신이다. 다른 기기에서
// 편집했다면 이 화면은 다시 열어야 반영된다 — 그 대신 계속 연결을 붙들고
// 있지 않아도 되니 훨씬 단순하고, 배터리·데이터도 덜 쓴다.
export async function fetchSchedule() {
  const snap = await getDoc(roomDoc('schedule', 'weekly'));
  return { data: snap.exists() ? snap.data() : {}, fromCache: snap.metadata.fromCache };
}

export function saveSchedule(weeklyData) {
  return setDoc(roomDoc('schedule', 'weekly'), weeklyData);
}

// 교시별 과목 아래에 교사가 덧붙이는 세부 내용(선택 사항). schedule/weekly와
// 같은 요일→교시 키 구조를 쓰지만, 값이 있는 교시만 채워지는 성긴(sparse) 문서다.
export async function fetchScheduleNotes() {
  const snap = await getDoc(roomDoc('schedule', 'notes'));
  return { data: snap.exists() ? snap.data() : {}, fromCache: snap.metadata.fromCache };
}

export function saveScheduleNotes(notesData) {
  return setDoc(roomDoc('schedule', 'notes'), notesData);
}

export async function fetchRoster() {
  const snap = await getDoc(roomDoc('roster', 'students'));
  return { data: snap.exists() ? (snap.data().list || []) : [], fromCache: snap.metadata.fromCache };
}

export function saveRoster(list) {
  return setDoc(roomDoc('roster', 'students'), { list });
}

export function saveDaily(data) {
  return setDoc(roomDoc('daily', 'current'), data, { merge: true });
}

// 수업종 알림 설정(아침 고정 알림, 쉬는시간 기본 멘트, 과목별 특별 알림).
// 기기마다 따로 있던 PIN과 달리 이건 원래도 "모든 기기에 똑같이 반영"돼야
// 맞는 값이라 Firestore에 둔다.
export async function fetchBellConfig() {
  const snap = await getDoc(roomDoc('bellConfig', 'current'));
  return { data: snap.exists() ? snap.data() : null, fromCache: snap.metadata.fromCache };
}

// merge:true — 아침 고정 알림/쉬는시간 기본 멘트/과목별 알림을 각각 다른
// 화면 섹션에서 따로 저장하므로, 매번 문서 전체를 다시 보내지 않고 바뀐
// 필드만 보내도 나머지가 지워지지 않아야 한다(saveDaily와 같은 이유).
export function saveBellConfig(data) {
  return setDoc(roomDoc('bellConfig', 'current'), data, { merge: true });
}

// 관리자 PIN. 예전에는 기기별 localStorage에 따로 저장했는데, "한 곳에서
// 바꾸면 다른 기기에도 반영돼야 한다"는 요청으로 여기로 옮겼다.
export async function fetchAdminPin() {
  const snap = await getDoc(roomDoc('settings', 'admin'));
  return { data: snap.exists() ? snap.data() : null, fromCache: snap.metadata.fromCache };
}

// merge:true — 이 문서(settings/admin)에는 PIN 말고 화면 설정(예:
// studentAccordionDefaultOpen)도 같이 들어있으므로, PIN만 저장할 때 그
// 설정을 지우면 안 된다.
export function saveAdminPin(pin) {
  return setDoc(roomDoc('settings', 'admin'), { pin }, { merge: true });
}

// 학생 목록 아코디언(1인1역/해야할일/제출할것)의 기본 펼침 상태. PIN과 같은
// 문서(settings/admin)에 같이 저장한다 — 둘 다 "기기 상관없이 똑같아야 하는
// 화면 설정"이라는 점이 같기 때문이다.
export async function fetchUiSettings() {
  const snap = await getDoc(roomDoc('settings', 'admin'));
  return { data: snap.exists() ? snap.data() : null, fromCache: snap.metadata.fromCache };
}

export function saveUiSettings(data) {
  return setDoc(roomDoc('settings', 'admin'), data, { merge: true });
}

export async function ensureTodayDaily(todayDateKey) {
  const ref = roomDoc('daily', 'current');
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : null;
  if (!current || shouldResetDaily(current.date, todayDateKey)) {
    const fresh = {
      date: todayDateKey, morningNotice: '', generalNotice: '', todos: {}, submits: {}, periodOverrides: {},
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
