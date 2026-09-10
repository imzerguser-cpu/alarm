// 여러 선생님이 같은 웹앱을 각자 자기 반 데이터로 따로 쓸 수 있게 하는
// "교실 코드" 처리. Firestore 문서 경로 전체를 rooms/{roomId}/... 밑으로
// 옮기고, 이 roomId를 모르면 애초에 그 반 데이터에 접근할 방법이 없다
// (Firestore 규칙 자체는 열려 있지만 — 그 이유는 firestore.rules 참고 —
// roomId를 아는 사람만 그 데이터를 찾아올 수 있다는 게 실질적인 격리다).

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

// 사람이 직접 입력한 코드도 대소문자/공백 편차가 있을 수 있어 저장 전에 정규화한다.
export function normalizeRoomId(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
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
