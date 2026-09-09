import { getDayKey, getCurrentPeriodId, PERIODS } from './schedule-times.js';
import { buildTodayRows, renderTimetable } from './timetable.js';
import { INITIAL_SCHEDULE } from './seed-data.js';
import { fetchSchedule, fetchScheduleNotes, ensureTodayDaily, fetchBellConfig } from './store.js';
import { computeTodayBellSchedule, DEFAULT_BELL_CONFIG } from './bell-schedule.js';

// 화면 고정(키오스크)용 표시 전용 페이지 — index.html(관리자용)에서 저장한
// 시간표/오늘만 변경 내용을 그대로 읽어와 보여주기만 한다. 여기서는 아무것도
// 저장하지 않으므로 store.js의 save* 함수들은 아예 가져오지 않는다.

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

let currentSchedule = INITIAL_SCHEDULE;
let currentNotes = {};
let periodOverrides = {};
let bellConfig = DEFAULT_BELL_CONFIG;

function renderTimetableNow() {
  const now = new Date();
  const dayKey = getDayKey(now);
  const currentPeriodId = getCurrentPeriodId(now);
  const rows = buildTodayRows(currentSchedule, dayKey, currentPeriodId, currentNotes, periodOverrides);
  renderTimetable(document.getElementById('timetablePanel'), rows);
}

// 이 화면도 index.html과 마찬가지로 실제 수업종 알림(음성)을 그대로 울려야
// 하므로, 오늘 시간표+알림 설정을 조합해 js/bell.js에 밀어 넣는다.
function pushBellSchedule() {
  if (!window.classBell || !window.classBell.setSchedule) return;
  const dayKey = getDayKey(new Date());
  const items = computeTodayBellSchedule({
    periods: PERIODS,
    daySubjects: currentSchedule[dayKey] || {},
    bellConfig,
  });
  window.classBell.setSchedule(items);
}

function setConnStatus(failed) {
  document.getElementById('connStatusDisplay').hidden = !failed;
}

async function refreshFromServer() {
  let failed = false;

  try {
    const { data, fromCache } = await fetchSchedule();
    if (Object.keys(data).length) currentSchedule = data;
    if (fromCache) failed = true;
  } catch (err) {
    console.error('시간표 불러오기 실패:', err);
    failed = true;
  }

  try {
    const { data, fromCache } = await fetchScheduleNotes();
    currentNotes = data || {};
    if (fromCache) failed = true;
  } catch (err) {
    console.error('세부 내용 불러오기 실패:', err);
    failed = true;
  }

  try {
    const daily = await ensureTodayDaily(toDateKey(new Date()));
    periodOverrides = daily.periodOverrides || {};
  } catch (err) {
    console.error('오늘의 임시 시간표 불러오기 실패:', err);
    failed = true;
  }

  try {
    const { data, fromCache } = await fetchBellConfig();
    if (data) bellConfig = data;
    if (fromCache) failed = true;
  } catch (err) {
    console.error('알림 설정 불러오기 실패:', err);
    failed = true;
  }

  setConnStatus(failed);
  renderTimetableNow();
  pushBellSchedule();
}

renderTimetableNow(); // 서버 응답 전에도 기본 시간표로 화면을 바로 채운다.
refreshFromServer();
// 관리자 화면에서 바꾼 내용이 이 화면에도 곧 반영되도록 주기적으로 다시 불러온다.
setInterval(refreshFromServer, 20000);
setInterval(renderTimetableNow, 30000); // 현재 교시 강조 표시가 시간 경과에 따라 갱신되도록.

const manualRefreshBtn = document.getElementById('manualRefreshBtn');
const manualRefreshStatus = document.getElementById('manualRefreshStatus');
manualRefreshBtn.addEventListener('click', async () => {
  manualRefreshBtn.disabled = true;
  manualRefreshStatus.textContent = '새로고침 중...';
  await refreshFromServer();
  manualRefreshStatus.textContent = '완료 (' + new Date().toLocaleTimeString('ko-KR') + ')';
  manualRefreshBtn.disabled = false;
});
