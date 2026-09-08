import { getDayKey, getCurrentPeriodId } from './schedule-times.js';
import { buildTodayRows, renderTimetable } from './timetable.js';
import { INITIAL_SCHEDULE } from './seed-data.js';
import { initPinLock } from './pin-lock.js';
import {
  subscribeSchedule, saveSchedule, subscribeScheduleNotes, saveScheduleNotes,
} from './store.js';

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setConnStatus(fromCache) {
  document.getElementById('connStatus').hidden = !fromCache;
}

// onSnapshot/getDoc 실패(오프라인, 권한 거부, 설정 오류 등)를 조용히 삼키지 않고
// 콘솔에 남기면서 화면에도 "연결 끊김" 표시를 띄운다.
function handleSubscribeError(err) {
  console.error('Firestore 구독 오류:', err);
  setConnStatus(true);
}

// saveX() 호출이 실패해도(Firebase 미설정, 오프라인 등) 그냥 넘어가면
// 교사는 방금 입력한 내용이 저장된 줄 알고 창을 닫아버릴 수 있다.
// 구독 오류와 같은 "연결 끊김" 표시를 그대로 재사용해 눈에 보이게 한다.
function handleSaveError(err) {
  console.error('Firestore 저장 오류:', err);
  setConnStatus(true);
}

let currentSchedule = INITIAL_SCHEDULE;
let currentNotes = {};

function renderTimetableNow() {
  const now = new Date();
  const dayKey = getDayKey(now);
  const currentPeriodId = getCurrentPeriodId(now);
  const rows = buildTodayRows(currentSchedule, dayKey, currentPeriodId, currentNotes);
  renderTimetable(document.getElementById('timetablePanel'), rows);
}
// Firestore 응답을 기다리지 않고 우선 기본값(INITIAL_SCHEDULE)으로 바로 그린다.
// 응답이 오면 그 값으로 다시 그려진다 — 이게 없으면 응답이 오기 전까지(또는
// Firebase가 아직 설정 전이라 응답이 늦어지는 동안) 화면이 잠깐 비어 보인다.
renderTimetableNow();

// 시간표 편집 폼 배선 — subscribeScheduleNotes의 콜백이 이 아래 선언들을
// 참조하므로(구독 등록보다 먼저 정의해야 TDZ 걱정 없이 안전하다), 구독보다 위에 둔다.
const subjectPreset = document.getElementById('ttEditSubjectPreset');
const subjectCustom = document.getElementById('ttEditSubjectCustom');
const ttEditDaySelect = document.getElementById('ttEditDay');
const ttEditPeriodSelect = document.getElementById('ttEditPeriod');
const ttEditNoteInput = document.getElementById('ttEditNote');

subjectPreset.addEventListener('change', () => {
  subjectCustom.hidden = subjectPreset.value !== '__custom';
});

// 요일/교시를 바꿀 때마다 그 교시에 이미 저장된 세부 내용을 입력칸에 채워준다.
// 이게 없으면 "과목만 바꾸고 싶었는데 적용을 누르니 세부 내용이 빈 값으로
// 덮어써져 사라지는" 일이 생긴다 — 항상 지금 칸에 보이는 값 그대로 다시
// 저장하기 때문에, 이 값 자체가 항상 최신 상태를 반영해야 안전하다.
// 다만 스냅샷 echo로 다시 호출될 때 교사가 이 칸에 한창 입력 중이면 건드리지
// 않는다 — 알림장/안내문에 이미 쓰던 것과 같은 보호 패턴이다.
function syncNoteField() {
  if (document.activeElement === ttEditNoteInput) return;
  const day = ttEditDaySelect.value;
  const period = ttEditPeriodSelect.value;
  ttEditNoteInput.value = (currentNotes[day] && currentNotes[day][period]) || '';
}
ttEditDaySelect.addEventListener('change', syncNoteField);
ttEditPeriodSelect.addEventListener('change', syncNoteField);

subscribeSchedule((data, fromCache) => {
  currentSchedule = Object.keys(data).length ? data : INITIAL_SCHEDULE;
  // 캐시에서 온 빈 스냅샷(오프라인/콜드 스타트)으로 시드를 덮어쓰면, 교사가
  // 편집해 둔 서버의 실제 시간표가 재연결 시 초기값으로 되돌아간다.
  // 서버에서 확인된 빈 문서일 때만 시드를 업로드한다.
  if (!Object.keys(data).length && !fromCache) {
    saveSchedule(INITIAL_SCHEDULE).catch(handleSaveError); // 최초 1회 시드 업로드
  }
  renderTimetableNow();
}, handleSubscribeError);

subscribeScheduleNotes((data) => {
  currentNotes = data || {};
  renderTimetableNow();
  syncNoteField();
}, handleSubscribeError);

setInterval(renderTimetableNow, 30000);

document.getElementById('ttEditApplyBtn').addEventListener('click', () => {
  const day = ttEditDaySelect.value;
  const period = ttEditPeriodSelect.value;
  let subject;
  if (subjectPreset.value === '__clear') {
    subject = ''; // 해당 교시 비우기(시간표에서 사라짐)
  } else if (subjectPreset.value === '__custom') {
    subject = subjectCustom.value.trim();
    if (!subject) return;
  } else {
    subject = subjectPreset.value;
  }
  const next = { ...currentSchedule, [day]: { ...currentSchedule[day], [period]: subject } };
  saveSchedule(next).catch(handleSaveError);

  // 세부 내용은 선택 사항이라 비워두면 그냥 과목명만 보이던 대로 유지된다.
  const noteValue = ttEditNoteInput.value.trim();
  const nextNotes = { ...currentNotes, [day]: { ...currentNotes[day], [period]: noteValue } };
  saveScheduleNotes(nextNotes).catch(handleSaveError);
});

// 관리자 화면(엑셀 업로드, PIN 변경 등)에서 바꿀 수 있도록 localStorage에
// 저장해두고, 없으면 기본값 '1234'를 쓴다. let인 이유는 changePinBtn 클릭
// 시 바로 바뀌어야 하기 때문 — pin-lock.js에는 getCorrectPin 함수로 넘겨서
// 매번 최신 값을 물어보게 한다(값 자체를 넘기면 그 순간 값이 굳어버린다).
const PIN_STORAGE_KEY = 'classAdminPin';
let EDIT_PIN = localStorage.getItem(PIN_STORAGE_KEY) || '1234';
window.__EDIT_MODE__ = false;

initPinLock({
  buttonEl: document.getElementById('editModeBtn'),
  modalEl: document.getElementById('pinModal'),
  inputEl: document.getElementById('pinInput'),
  submitEl: document.getElementById('pinSubmitBtn'),
  getCorrectPin: () => EDIT_PIN,
  // 편집 버튼은 토글이다. 잠금 해제 상태에서 누르면 PIN 없이 바로 다시 잠근다
  // (교실 공용 태블릿이 하루 종일 켜져 있으므로 다시 잠글 수단이 필요하다).
  isUnlocked: () => window.__EDIT_MODE__,
  onUnlock: () => {
    window.__EDIT_MODE__ = true;
    document.body.classList.add('edit-mode');
    renderStudentList();
    renderNoticeGeneral();
    renderMorningBanner();
  },
  onLock: () => {
    window.__EDIT_MODE__ = false;
    document.body.classList.remove('edit-mode');
    renderStudentList();
    renderNoticeGeneral();
    renderMorningBanner();
  },
});

// PIN 변경은 관리자 모드 안에서만 보이는 버튼이라(CSS), 이미 잠금 해제된
// 상태에서만 눌릴 수 있다 — 별도로 window.__EDIT_MODE__를 다시 확인하지 않는다.
document.getElementById('changePinBtn').addEventListener('click', () => {
  const input = document.getElementById('newPinInput');
  const value = input.value.trim();
  if (!/^\d{4}$/.test(value)) {
    alert('PIN은 숫자 4자리로 입력해주세요.');
    return;
  }
  EDIT_PIN = value;
  localStorage.setItem(PIN_STORAGE_KEY, value);
  input.value = '';
  alert('PIN이 변경되었습니다. 다음에 관리자 모드에 들어갈 때부터 새 PIN을 사용하세요.');
});

import {
  subscribeRoster, saveRoster, subscribeDaily, saveDaily, ensureTodayDaily,
} from './store.js';
import { formatHiClassText } from './notice-format.js';
import { isMorningActive } from './schedule-times.js';
import { INITIAL_ROSTER } from './seed-data.js';

let roster = INITIAL_ROSTER;
let daily = {
  date: toDateKey(new Date()), morningNotice: '', generalNotice: '', todos: {}, submits: {},
};

// daily의 한 필드(todos 또는 submits) 안에서 이 학생 항목 하나만 갱신한다.
// 점 표기 문자열 키가 아니라 실제 중첩 객체로 넘겨야 setDoc(...,{merge:true})가
// 재귀적으로 병합해 다른 학생의 값을 그대로 보존한다(점 표기 키는 updateDoc
// 에서만 경로로 해석된다 — 이걸 착각해서 한 번 버그가 났던 자리).
function saveStudentField(fieldName, studentNo, value) {
  saveDaily({ [fieldName]: { [String(studentNo)]: value } }).catch(handleSaveError);
}

function renderStudentList() {
  const container = document.getElementById('studentList');
  // 스냅샷이 올 때마다 목록을 통째로 다시 그리면(자기 자신의 쓰기 echo 포함),
  // 교사가 입력 중이던 아직 저장 안 된 글자가 지워진다. 포커스가 목록 안에 있는
  // 동안에는 다시 그리지 않는다 — 포커스를 잃는 순간(blur/change) 이미 저장되므로
  // 그 다음 스냅샷에서 안전하게 갱신된다.
  if (container.contains(document.activeElement)) return;
  container.innerHTML = '';
  for (const student of roster) {
    const row = document.createElement('div');
    row.className = 'student-row';
    row.dataset.no = String(student.no);

    const name = document.createElement('div');
    name.className = 's-name';
    name.textContent = `${student.no}. ${student.name}`;

    const role = document.createElement('input');
    role.className = 's-role';
    role.type = 'text';
    role.placeholder = '1인1역';
    role.value = student.role || '';
    role.disabled = !window.__EDIT_MODE__;
    role.addEventListener('change', () => {
      // role은 daily가 아니라 roster 배열에 있으므로, 해당 학생 항목만 교체한
      // 전체 배열을 saveRoster로 저장한다.
      const nextRoster = roster.map((s) => (s.no === student.no ? { ...s, role: role.value } : s));
      saveRoster(nextRoster).catch(handleSaveError);
    });

    const todo = document.createElement('input');
    todo.className = 's-todo';
    todo.type = 'text';
    todo.placeholder = '해야할일';
    todo.value = (daily.todos && daily.todos[String(student.no)]) || '';
    todo.disabled = !window.__EDIT_MODE__;
    todo.addEventListener('change', () => saveStudentField('todos', student.no, todo.value));

    const submit = document.createElement('input');
    submit.className = 's-submit';
    submit.type = 'text';
    submit.placeholder = '제출할것';
    submit.value = (daily.submits && daily.submits[String(student.no)]) || '';
    submit.disabled = !window.__EDIT_MODE__;
    submit.addEventListener('change', () => saveStudentField('submits', student.no, submit.value));

    row.append(name, role, todo, submit);
    container.appendChild(row);
  }
}
renderStudentList(); // 위와 같은 이유로 기본 명단(INITIAL_ROSTER)을 바로 그린다.

function renderNoticeGeneral() {
  const el = document.getElementById('noticeGeneralText');
  // 편집 중(포커스가 이 요소에 있음)에는 덮어쓰지 않는다.
  if (document.activeElement !== el) {
    el.textContent = daily.generalNotice || '';
  }
  el.contentEditable = window.__EDIT_MODE__ ? 'true' : 'false';
}

function renderMorningBanner() {
  const banner = document.getElementById('morningBanner');
  const textEl = document.getElementById('morningBannerText');
  const withinWindow = isMorningActive(new Date());
  // 편집모드에서는 시간대·내용과 무관하게 배너를 띄운다 — 그래야 아직 비어 있거나
  // 아침활동 시간이 아닐 때도 교사가 눌러서 입력할 대상이 화면에 존재한다.
  // 편집모드가 아닐 때는 기존 규칙(아침활동 시간 + 내용 있음) 그대로.
  const active = window.__EDIT_MODE__ || (withinWindow && !!daily.morningNotice);
  banner.hidden = !active;
  textEl.contentEditable = window.__EDIT_MODE__ ? 'true' : 'false';
  if (active && document.activeElement !== textEl) {
    textEl.textContent = daily.morningNotice || '';
  }
}
renderNoticeGeneral(); // 위와 같은 이유로 빈 기본값으로 바로 그린다.
renderMorningBanner();

// contentEditable에서 Enter는 <div>/<br>을 만든다. textContent는 그 사이에 아무
// 구분자도 넣지 않아 여러 줄이 한 줄로 뭉개지므로, 실제 줄바꿈을 보존하는
// innerText를 쓴다(CSS white-space: pre-wrap과 formatHiClassText가 \n을 전제).
document.getElementById('noticeGeneralText').addEventListener('blur', (e) => {
  if (!window.__EDIT_MODE__) return;
  saveDaily({ generalNotice: e.target.innerText }).catch(handleSaveError);
});

document.getElementById('morningBannerText').addEventListener('blur', (e) => {
  if (!window.__EDIT_MODE__) return;
  saveDaily({ morningNotice: e.target.innerText }).catch(handleSaveError);
});

subscribeRoster((list, fromCache) => {
  roster = list.length ? list : INITIAL_ROSTER;
  // 학생 명단도 시간표와 같은 규칙: 서버에서 확인된 빈 문서일 때만 시드를 올린다.
  if (!list.length && !fromCache) {
    saveRoster(INITIAL_ROSTER).catch(handleSaveError);
  }
  setConnStatus(fromCache);
  renderStudentList();
}, handleSubscribeError);

// 구독 등록은 시드 점검(ensureTodayDaily) 성공 여부와 분리한다. 오프라인 콜드
// 스타트로 getDoc이 실패하면, 예전에는 subscribeDaily가 아예 등록되지 않아
// 알림장이 영영 렌더링되지 않았다.
subscribeDaily((data, fromCache) => {
  if (!data) return;
  daily = data;
  setConnStatus(fromCache);
  renderStudentList();
  renderNoticeGeneral();
  renderMorningBanner();
}, handleSubscribeError);

ensureTodayDaily(toDateKey(new Date())).catch(handleSubscribeError);

// 태블릿이 자정을 넘겨 계속 켜져 있어도 날짜 변경을 감지해 daily를 새로 초기화한다.
let lastCheckedDateKey = toDateKey(new Date());
setInterval(() => {
  renderMorningBanner();
  const nowKey = toDateKey(new Date());
  if (nowKey !== lastCheckedDateKey) {
    lastCheckedDateKey = nowKey;
    ensureTodayDaily(nowKey).catch(handleSubscribeError);
  }
}, 15000);

document.getElementById('studentAddBtn').addEventListener('click', () => {
  if (!window.__EDIT_MODE__) return;
  const nameInput = document.getElementById('studentAddNameInput');
  const noInput = document.getElementById('studentAddNoInput');
  const name = nameInput.value.trim();
  if (!name) return;
  const suggestedNo = roster.reduce((max, s) => Math.max(max, s.no), 0) + 1;
  // 번호를 비워두면 자동으로 다음 번호를 매기고, 직접 입력하면 그 번호를 쓴다.
  const no = noInput.value.trim() ? Number(noInput.value) : suggestedNo;
  if (!Number.isInteger(no) || no <= 0) {
    alert('번호는 1 이상의 정수로 입력해주세요.');
    return;
  }
  if (roster.some((s) => s.no === no)) {
    alert(`이미 ${no}번 학생이 있습니다. 다른 번호를 입력해주세요.`);
    return;
  }
  // 번호를 직접 골라 넣을 수 있으니, 그 번호가 목록 중간이어도 순서대로
  // 보이도록 저장 전에 번호순으로 정렬한다.
  const next = [...roster, { no, name, role: '' }].sort((a, b) => a.no - b.no);
  saveRoster(next).catch(handleSaveError);
  nameInput.value = '';
  noInput.value = '';
});

import { wireExcelInput } from './excel-import.js';

wireExcelInput({
  buttonEl: document.getElementById('excelUploadBtn'),
  fileInputEl: document.getElementById('excelFileInput'),
  onParsed: (list) => {
    // 빈 시트/헤더만 있는 시트는 parseRosterRows가 예외 없이 []를 돌려준다.
    // 그대로 저장하면 명단 전체가 되돌릴 수 없이 지워지므로 막는다.
    if (!list.length) {
      alert('엑셀에서 학생 정보를 찾지 못했습니다. 명단을 변경하지 않았습니다.');
      return;
    }
    // 기존 1인1역(role) 값은 이름이 같으면 유지
    const merged = list.map((s) => {
      const prev = roster.find((r) => r.name === s.name);
      return prev ? { ...s, role: prev.role } : s;
    });
    saveRoster(merged).catch(handleSaveError);
  },
});

document.getElementById('hiclassCopyBtn').addEventListener('click', async () => {
  const text = formatHiClassText(daily.generalNotice, roster, daily.todos, daily.submits);
  try {
    await navigator.clipboard.writeText(text);
    alert('클립보드에 복사했습니다. 하이클래스에 붙여넣어 주세요.');
  } catch (err) {
    alert('클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
  }
});

import { wireInstallButton } from './pwa-install.js';

wireInstallButton({
  buttonEl: document.getElementById('installBtn'),
  messageEl: document.getElementById('installMessage'),
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

import { wireTimerWidget } from './timer.js';

wireTimerWidget({
  presetButtons: Array.from(document.querySelectorAll('.timer-presets button')),
  customInput: document.getElementById('timerCustomMinutes'),
  customSetBtn: document.getElementById('timerCustomSetBtn'),
  displayEl: document.getElementById('timerDisplay'),
  startBtn: document.getElementById('timerStartBtn'),
  pauseBtn: document.getElementById('timerPauseBtn'),
  resetBtn: document.getElementById('timerResetBtn'),
});

import { wireFloatingWidgetButton } from './floating-widget.js';

wireFloatingWidgetButton({
  buttonEl: document.getElementById('floatingWidgetBtn'),
  messageEl: document.getElementById('floatingWidgetMessage'),
  getContent: () => {
    const currentRow = document.querySelector('.timetable-row.current');
    return {
      date: document.getElementById('clockDate').textContent,
      time: document.getElementById('clockNow').textContent,
      period: currentRow ? currentRow.querySelector('.tt-subject-text').textContent.trim() : '쉬는 시간',
      nextAlarm: document.getElementById('nextAlarmInfo').textContent,
      timer: document.getElementById('timerDisplay').textContent,
      // 본 화면의 "연결 끊김" 표시와 같은 값을 그대로 읽어서 플로팅 창에도
      // 띄운다 — PC 화면만 보고 있으면 본 페이지의 경고를 놓치기 쉽다.
      connLost: !document.getElementById('connStatus').hidden,
    };
  },
});
