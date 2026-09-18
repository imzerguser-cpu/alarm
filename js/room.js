// 여러 선생님이 같은 웹앱을 각자 자기 반 데이터로 따로 쓸 수 있게 하는
// "교실 코드" 처리. Firestore 문서 경로 전체를 rooms/{roomId}/... 밑으로
// 옮기고, 이 roomId를 모르면 애초에 그 반 데이터에 접근할 방법이 없다
// (Firestore 규칙 자체는 열려 있지만 — 그 이유는 firestore.rules 참고 —
// roomId를 아는 사람만 그 데이터를 찾아올 수 있다는 게 실질적인 격리다).

import { firebaseConfig } from './firebase-config.js';

const STORAGE_KEY = 'classBellRoomId';
// 손으로 옮겨 적을 때 헷갈리는 글자(0/O, 1/I/L)는 뺀다.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXY23456789';

export function generateRoomId() {
  let id = '';
  for (let i = 0; i < 6; i += 1) {
    id += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return id;
}

// 무작위 생성 코드(위 CODE_CHARS)뿐 아니라, 선생님이 직접 정한 이름(한글,
// 띄어쓰기 포함 가능 — 예: "3학년2반")도 여기로 들어온다. 대소문자는 그대로
// 두되(한글은 대소문자 개념이 없고, 무작위 코드는 원래도 대문자라 영향 없음),
// Firestore 문서 ID에 못 쓰는 글자("/")와 공백 뭉치만 정리한다.
export function normalizeRoomId(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\//g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 40);
  if (cleaned === '.' || cleaned === '..') return '';
  return cleaned;
}

export function getRoomIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room');
  return raw ? normalizeRoomId(raw) : null;
}

export function loadStoredRoomId() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch (err) {
    return null;
  }
}

export function saveRoomId(roomId) {
  try {
    localStorage.setItem(STORAGE_KEY, roomId);
  } catch (err) {
    // 사파리 콘텐츠 차단 등으로 저장이 안 되면, 이 기기에서는 매번 URL의
    // ?room= 이나 재입력에 의존하게 된다 — 조용히 넘어간다.
  }
}

export function clearStoredRoomId() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    // 위와 같은 이유로 무시.
  }
}

// URL의 ?room=이 최우선이다(다른 기기에서 링크를 눌러 열었을 때, 그 기기에
// 저장된 다른 교실 코드보다 지금 누른 링크가 가리키는 교실이 맞아야 한다).
// URL에 없으면 이 기기에 저장된 값을 쓰고, 그것도 없으면 null을 돌려줘서
// "아직 교실을 선택하지 않았다"는 뜻으로 쓴다.
export function resolveRoomId() {
  const fromUrl = getRoomIdFromUrl();
  if (fromUrl) {
    saveRoomId(fromUrl);
    return fromUrl;
  }
  return loadStoredRoomId();
}

// 다른 기기(태블릿, 전자칠판)에 그대로 옮겨 적거나, 링크를 눌러 바로 그
// 교실로 들어올 수 있도록 현재 페이지 주소에 ?room=코드를 붙인 절대 URL을 만든다.
export function buildRoomUrl(pageFileName, roomId) {
  const url = new URL(pageFileName, window.location.href);
  url.searchParams.set('room', roomId);
  return url.toString();
}

// 선생님이 직접 이름을 정할 때, 이미 다른 반이 그 이름을 쓰고 있는지 미리
// 확인한다. js/store.js의 setRoomId()는 앱 전체가 공유하는 상태라 여기서
// "확인만 해보는" 용도로 건드리면 그사이 실행 중인 다른 저장/불러오기가
// 엉뚱한 교실을 향하게 될 위험이 있다 — 그래서 store.js를 거치지 않고,
// Firestore 규칙이 어차피 열려 있다는 점을 이용해 이 요청만 따로 보낸다.
export async function checkRoomExists(roomId) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
      `/databases/(default)/documents/rooms/${encodeURIComponent(roomId)}/settings/admin`;
    const res = await fetch(url);
    return res.status === 200;
  } catch (err) {
    return false; // 확인 자체가 실패하면(오프라인 등) 새로 만드는 쪽을 막지 않는다.
  }
}
