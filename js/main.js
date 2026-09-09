import { getDayKey, getCurrentPeriodId, PERIODS } from './schedule-times.js';
import { buildTodayRows, renderTimetable } from './timetable.js';
import { INITIAL_SCHEDULE, INITIAL_ROSTER } from './seed-data.js';
import { initPinLock } from './pin-lock.js';
import {
  fetchSchedule, saveSchedule, fetchScheduleNotes, saveScheduleNotes,
  fetchRoster, saveRoster, saveDaily, ensureTodayDaily, deleteField,
} from './store.js';
import { formatHiClassText } from './notice-format.js';
import { isMorningActive } from './schedule-times.js';

// renderTimetableNow()가 모듈 최상단(아래 "기본값으로 화면을 바로 채운다" 자리)
// 에서 곧바로 한 번 호출되고, 그 안에서 renderWeeklyGrid()도 함께 불린다.
// 그 시점에는 이 아래쪽 "시간표 편집 폼 배선" 자리에 있는 const들이 아직
// 초기화되기 전이므로, renderWeeklyGrid()가 참조하는 값은 반드시 그보다
// 먼저 선언돼 있어야 한다(그렇지 않으면 TDZ ReferenceError로 모듈 전체가 멈춘다).
const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_LABELS = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금' };
const CLASS_PERIODS = PERIODS.filter((p) => p.kind === 'class');

// 편집은 항상 이 화면(태블릿)에서만 한다는 전제로, 실시간 구독(onSnapshot) 대신
// 페이지를 열 때 한 번만 서버에서 불러온다(아래 loadInitialData). 저장할 때는
// 화면도 같이 바로 갱신하므로, 계속 연결을 붙들고 있지 않아도 항상 최신이다.
// 다른 기기에서 편집했다면 이 화면은 새로고침해야 반영된다 — 그 대신 훨씬
// 단순하고, 배터리·데이터도 덜 쓴다.

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setConnStatus(fromCache) {
  document.getElementById('connStatus').hidden = !fromCache;
}

// 불러오기 실패(오프라인, 권한 거부, 설정 오류 등)를 조용히 삼키지 않고
// 콘솔에 남기면서 화면에도 "연결 끊김" 표시를 띄운다.
function handleLoadError(err) {
  console.error('Firestore 불러오기 오류:', err);
  setConnStatus(true);
}

function setSaveStatus(failed) {
  document.getElementById('saveStatus').hidden = !failed;
}

// saveX() 호출이 실패해도(Firebase 미설정, 오프라인 등) 그냥 넘어가면 교사는
// 방금 입력한 내용이 저장된 줄 알고 창을 닫아버릴 수 있다. "연결 끊김"(읽은
// 내용이 오래됐다는 뜻)과는 다른, "방금 입력이 저장 안 됐다"는 별도 표시를
// 띄운다 — 성공하면 지우고, 실패하면 다음 저장이 성공할 때까지 계속 보인다.
// saveSchedule/saveScheduleNotes/saveRoster/saveDaily 호출은 전부 이 함수로
// 감싸서 쓴다: `trackSave(saveDaily({...}))`.
function trackSave(promise) {
  return promise
    .then(() => setSaveStatus(false))
    .catch((err) => {
      console.error('Firestore 저장 오류:', err);
      setSaveStatus(true);
    });
}

// ---- 상태 (한 번 불러온 뒤로는 저장할 때마다 여기도 같이 갱신한다) ----
let currentSchedule = INITIAL_SCHEDULE;
let currentNotes = {};
let roster = INITIAL_ROSTER;
let daily = {
  date: toDateKey(new Date()), morningNotice: '', generalNotice: '', todos: {}, submits: {}, periodOverrides: {},
};

// ---- 렌더 함수 ----
function renderTimetableNow() {
  const now = new Date();
  const dayKey = getDayKey(now);
  const currentPeriodId = getCurrentPeriodId(now);
  const rows = buildTodayRows(currentSchedule, dayKey, currentPeriodId, currentNotes, daily.periodOverrides);
  const panel = document.getElementById('timetablePanel');
  renderTimetable(panel, rows);
  panel.classList.toggle('editable', window.__EDIT_MODE__);
  renderWeeklyGrid();
}

function renderStudentList() {
  const container = document.getElementById('studentList');
  // 포커스가 목록 안에 있는 동안에는 다시 그리지 않는다 — 편집모드 토글처럼
  // 다른 이유로 렌더가 다시 불릴 때, 교사가 입력 중이던 글자를 지우지 않기 위해서다.
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
      // 전체 배열을 saveRoster로 저장한다. 로컬 roster도 즉시 갱신해서
      // 하이클래스 복사 등 다른 기능이 최신 값을 읽게 한다.
      roster = roster.map((s) => (s.no === student.no ? { ...s, role: role.value } : s));
      trackSave(saveRoster(roster));
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

function renderNoticeGeneral() {
  const el = document.getElementById('noticeGeneralText');
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
  const active = window.__EDIT_MODE__ || (withinWindow && !!daily.morningNotice);
  banner.hidden = !active;
  textEl.contentEditable = window.__EDIT_MODE__ ? 'true' : 'false';
  if (active && document.activeElement !== textEl) {
    textEl.textContent = daily.morningNotice || '';
  }
}

// daily의 한 필드(todos 또는 submits) 안에서 이 학생 항목 하나만 갱신한다.
// 점 표기 문자열 키가 아니라 실제 중첩 객체로 넘겨야 setDoc(...,{merge:true})가
// 재귀적으로 병합해 다른 학생의 값을 그대로 보존한다(점 표기 키는 updateDoc
// 에서만 경로로 해석된다 — 이걸 착각해서 한 번 버그가 났던 자리). 로컬 daily도
// 같이 갱신해서 하이클래스 복사 등이 방금 입력한 값을 바로 읽게 한다.
function saveStudentField(fieldName, studentNo, value) {
  daily = { ...daily, [fieldName]: { ...daily[fieldName], [String(studentNo)]: value } };
  trackSave(saveDaily({ [fieldName]: { [String(studentNo)]: value } }));
}

// 기본값으로 우선 화면을 바로 채운다 — 응답을 기다리면(또는 Firebase가 아직
// 설정 전이라 응답이 아예 안 오면) 그동안 화면이 비어 보인다.
renderTimetableNow();
renderStudentList();
renderNoticeGeneral();
renderMorningBanner();

// ---- 시간표 편집 폼 배선 ----
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
function syncNoteField() {
  if (document.activeElement === ttEditNoteInput) return;
  const day = ttEditDaySelect.value;
  const period = ttEditPeriodSelect.value;
  ttEditNoteInput.value = (currentNotes[day] && currentNotes[day][period]) || '';
}
ttEditDaySelect.addEventListener('change', syncNoteField);
ttEditPeriodSelect.addEventListener('change', syncNoteField);

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
  currentSchedule = { ...currentSchedule, [day]: { ...currentSchedule[day], [period]: subject } };
  trackSave(saveSchedule(currentSchedule));

  // 세부 내용은 선택 사항이라 비워두면 그냥 과목명만 보이던 대로 유지된다.
  const noteValue = ttEditNoteInput.value.trim();
  currentNotes = { ...currentNotes, [day]: { ...currentNotes[day], [period]: noteValue } };
  trackSave(saveScheduleNotes(currentNotes));

  renderTimetableNow();
});

// ---- 관리자 모드: 월~금 전체 시간표 한눈에 보기 + 칸 클릭으로 선택 ----
// 실제 저장은 위 select/적용 버튼이 그대로 하고, 이 표는 "전체를 보면서
// 칸을 눌러 요일·교시를 고르는" 입력 보조 역할만 한다.
function renderWeeklyGrid() {
  const grid = document.getElementById('weeklyGrid');
  if (!grid) return;
  // 모듈 상단 const(ttEditDaySelect 등)에 기대지 않고 매번 다시 조회한다 —
  // 이 함수는 renderTimetableNow()를 통해 그 const들이 선언되기도 전인
  // 모듈 최초 실행 시점에 이미 한 번 불려서, 클로저 변수를 참조하면 TDZ
  // 오류(ReferenceError)로 모듈 전체가 멈춘다.
  const selectedDay = document.getElementById('ttEditDay').value;
  const selectedPeriod = document.getElementById('ttEditPeriod').value;
  grid.innerHTML = '';

  const corner = document.createElement('div');
  corner.className = 'wg-cell wg-head';
  grid.appendChild(corner);
  for (const day of WEEK_DAYS) {
    const head = document.createElement('div');
    head.className = 'wg-cell wg-head';
    head.textContent = DAY_LABELS[day];
    grid.appendChild(head);
  }

  for (const period of CLASS_PERIODS) {
    const labelCell = document.createElement('div');
    labelCell.className = 'wg-cell wg-period-label';
    labelCell.textContent = period.label;
    grid.appendChild(labelCell);

    for (const day of WEEK_DAYS) {
      const subject = (currentSchedule[day] && currentSchedule[day][period.id]) || '';
      const selected = selectedDay === day && selectedPeriod === period.id;
      const cell = document.createElement('div');
      cell.className = 'wg-cell' + (subject ? '' : ' wg-empty') + (selected ? ' wg-selected' : '');
      cell.textContent = subject || '-';
      cell.addEventListener('click', () => selectWeeklyCell(day, period.id));
      grid.appendChild(cell);
    }
  }
}

function selectWeeklyCell(day, periodId) {
  ttEditDaySelect.value = day;
  ttEditPeriodSelect.value = periodId;
  syncNoteField();
  const subjectValue = (currentSchedule[day] && currentSchedule[day][periodId]) || '';
  const presetValues = Array.from(subjectPreset.options).map((o) => o.value);
  if (subjectValue && presetValues.includes(subjectValue)) {
    subjectPreset.value = subjectValue;
    subjectCustom.hidden = true;
  } else if (subjectValue) {
    subjectPreset.value = '__custom';
    subjectCustom.hidden = false;
    subjectCustom.value = subjectValue;
  } else {
    subjectPreset.value = '__clear';
    subjectCustom.hidden = true;
  }
  renderWeeklyGrid();
}

// ---- 오늘만 시간표 바꾸기 (학생도 보는 화면의 시간표를 편집모드에서 직접 클릭) ----
// 매주 반복되는 기본 시간표(위 관리자 폼)와 달리, 여기서 바꾼 내용은
// daily/current 문서(periodOverrides)에만 저장되고 자정에 통째로 초기화된다
// — 현장학습처럼 그날 하루만 있는 일정을 반영하기 위한 용도라 반복 저장이
// 되면 안 된다.
const overrideModal = document.getElementById('overrideModal');
const overrideSubjectInput = document.getElementById('overrideSubjectInput');
const overrideNoteInput = document.getElementById('overrideNoteInput');
const overrideModalTitle = document.getElementById('overrideModalTitle');
let overrideTargetPeriodId = null;

function closeOverrideModal() {
  overrideModal.hidden = true;
  overrideTargetPeriodId = null;
}

function openOverrideModal(periodId) {
  const period = PERIODS.find((p) => p.id === periodId);
  if (!period) return;
  overrideTargetPeriodId = periodId;
  const dayKey = getDayKey(new Date());
  const existing = daily.periodOverrides && daily.periodOverrides[periodId];
  const baseSubject = period.kind === 'class'
    ? ((currentSchedule[dayKey] && currentSchedule[dayKey][periodId]) || '')
    : period.label;
  overrideModalTitle.textContent = `${period.label} — 오늘만 내용 바꾸기`;
  overrideSubjectInput.value = existing ? existing.subject : baseSubject;
  overrideNoteInput.value = existing ? (existing.note || '') : ((currentNotes[dayKey] && currentNotes[dayKey][periodId]) || '');
  overrideModal.hidden = false;
  overrideSubjectInput.focus();
}

document.getElementById('timetablePanel').addEventListener('click', (e) => {
  if (!window.__EDIT_MODE__) return;
  const row = e.target.closest('.timetable-row');
  if (!row) return;
  openOverrideModal(row.dataset.periodId);
});

document.getElementById('overrideCancelBtn').addEventListener('click', closeOverrideModal);
overrideModal.addEventListener('click', (e) => {
  if (e.target === overrideModal) closeOverrideModal();
});

document.getElementById('overrideApplyBtn').addEventListener('click', () => {
  if (!overrideTargetPeriodId) return;
  const subject = overrideSubjectInput.value.trim();
  if (!subject) {
    alert('내용을 입력해주세요.');
    return;
  }
  const note = overrideNoteInput.value.trim();
  const updated = { ...daily.periodOverrides, [overrideTargetPeriodId]: { subject, note } };
  daily = { ...daily, periodOverrides: updated };
  trackSave(saveDaily({ periodOverrides: { [overrideTargetPeriodId]: { subject, note } } }));
  renderTimetableNow();
  closeOverrideModal();
});

document.getElementById('overrideResetBtn').addEventListener('click', () => {
  if (!overrideTargetPeriodId) return;
  const updated = { ...daily.periodOverrides };
  delete updated[overrideTargetPeriodId];
  daily = { ...daily, periodOverrides: updated };
  // 병합 저장에서 키를 그냥 빼면(생략) 서버 문서에는 남아있는다 — 실제로
  // 지우려면 deleteField() 센티널을 그 키의 값으로 보내야 한다.
  trackSave(saveDaily({ periodOverrides: { [overrideTargetPeriodId]: deleteField() } }));
  renderTimetableNow();
  closeOverrideModal();
});

setInterval(renderTimetableNow, 30000);

// ---- 관리자 PIN ----
// 관리자 화면(엑셀 업로드, PIN 변경 등)에서 바꿀 수 있도록 localStorage에
// 저장해두고, 없으면 기본값 '1234'를 쓴다. let인 이유는 changePinBtn 클릭
// 시 바로 바뀌어야 하기 때문 — pin-lock.js에는 getCorrectPin 함수로 넘겨서
// 매번 최신 값을 물어보게 한다(값 자체를 넘기면 그 순간 값이 굳어버린다).
const PIN_STORAGE_KEY = 'classAdminPin';
// 사파리 콘텐츠 차단 등으로 localStorage 접근 자체가 막힌 환경도 있다
// (js/bell.js가 같은 이유로 이미 이렇게 감싸고 있다) — 감싸지 않으면
// 이 한 줄에서 던진 예외가 모듈 전체를 멈춰 세워 시간표·알림장·타이머까지
// 다 같이 죽는다.
let EDIT_PIN = '1234';
try {
  EDIT_PIN = localStorage.getItem(PIN_STORAGE_KEY) || '1234';
} catch (err) {
  console.error('PIN을 불러오지 못했습니다:', err);
}
window.__EDIT_MODE__ = false;

initPinLock({
  buttonEl: document.getElementById('editModeBtn'),
  modalEl: document.getElementById('pinModal'),
  inputEl: document.getElementById('pinInput'),
  submitEl: document.getElementById('pinSubmitBtn'),
  cancelEl: document.getElementById('pinCancelBtn'),
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
  try {
    localStorage.setItem(PIN_STORAGE_KEY, value);
  } catch (err) {
    console.error('PIN을 저장하지 못했습니다:', err);
  }
  input.value = '';
  // PIN은 이 브라우저에만 저장된다(다른 기기와 공유되는 시간표·알림장과
  // 다르게, 태블릿·PC 등 기기마다 따로 바꿔야 한다는 점을 분명히 알려준다).
  alert('이 기기(브라우저)에서 PIN이 변경되었습니다. 다른 태블릿/PC에서는 각각 따로 바꿔야 합니다.');
});

// ---- 알림장 상단 안내문 ----
// contentEditable에서 Enter는 <div>/<br>을 만든다. textContent는 그 사이에 아무
// 구분자도 넣지 않아 여러 줄이 한 줄로 뭉개지므로, 실제 줄바꿈을 보존하는
// innerText를 쓴다(CSS white-space: pre-wrap과 formatHiClassText가 \n을 전제).
document.getElementById('noticeGeneralText').addEventListener('blur', (e) => {
  if (!window.__EDIT_MODE__) return;
  daily = { ...daily, generalNotice: e.target.innerText };
  trackSave(saveDaily({ generalNotice: e.target.innerText }));
});

document.getElementById('morningBannerText').addEventListener('blur', (e) => {
  if (!window.__EDIT_MODE__) return;
  daily = { ...daily, morningNotice: e.target.innerText };
  trackSave(saveDaily({ morningNotice: e.target.innerText }));
});

// 태블릿이 자정을 넘겨 계속 켜져 있어도 날짜 변경을 감지해 daily를 새로 초기화한다.
let lastCheckedDateKey = toDateKey(new Date());
setInterval(() => {
  renderMorningBanner();
  const nowKey = toDateKey(new Date());
  if (nowKey !== lastCheckedDateKey) {
    lastCheckedDateKey = nowKey;
    ensureTodayDaily(nowKey)
      .then((fresh) => {
        daily = fresh;
        renderStudentList();
        renderNoticeGeneral();
        renderMorningBanner();
        renderTimetableNow(); // 오늘만 바꿔둔 시간표(periodOverrides)도 자정에 같이 초기화된다.
      })
      .catch(handleLoadError);
  }
}, 15000);

// ---- 학생 직접 추가 ----
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
  roster = [...roster, { no, name, role: '' }].sort((a, b) => a.no - b.no);
  trackSave(saveRoster(roster));
  renderStudentList();
  nameInput.value = '';
  noInput.value = '';
});

// ---- 엑셀 업로드 ----
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
    roster = list.map((s) => {
      const prev = roster.find((r) => r.name === s.name);
      return prev ? { ...s, role: prev.role } : s;
    });
    trackSave(saveRoster(roster));
    renderStudentList();
  },
});

// ---- 하이클래스 복사 ----
document.getElementById('hiclassCopyBtn').addEventListener('click', async () => {
  const text = formatHiClassText(daily.generalNotice, roster, daily.todos, daily.submits);
  try {
    await navigator.clipboard.writeText(text);
    alert('클립보드에 복사했습니다. 하이클래스에 붙여넣어 주세요.');
  } catch (err) {
    alert('클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
  }
});

// ---- PWA 설치 ----
import { wireInstallButton } from './pwa-install.js';

wireInstallButton({
  buttonEl: document.getElementById('installBtn'),
  messageEl: document.getElementById('installMessage'),
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

// ---- 타이머 ----
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

// ---- PC 플로팅 위젯 ----
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

// ---- 초기 데이터 한 번 불러오기 ----
// 여기서부터는 위에서 정의한 모든 렌더 함수·상태·이벤트 배선이 끝난 뒤이므로
// (이 함수는 맨 마지막에 호출된다) 어떤 순서 문제도 없다.
async function loadInitialData() {
  // 앞선 단계(예: 시간표 읽기)가 실패했다면, 뒤 단계(roster)가 서버에서 정상
  // 응답을 받았다는 이유만으로 "연결 끊김" 표시를 지우면 안 된다 — 그러면
  // 시간표가 조용히 기본값으로 대체된 사실을 교사가 알아챌 방법이 없어지고,
  // 그 상태에서 한 칸만 수정해도 saveSchedule은 병합 없는 전체 덮어쓰기라
  // 서버의 실제 시간표를 영구히 지울 수 있다.
  let hadError = false;

  try {
    const { data, fromCache } = await fetchSchedule();
    currentSchedule = Object.keys(data).length ? data : INITIAL_SCHEDULE;
    // 캐시에서 온 빈 응답(오프라인/콜드 스타트)으로 시드를 덮어쓰면, 교사가
    // 편집해 둔 서버의 실제 시간표가 재연결 시 초기값으로 되돌아간다.
    // 서버에서 확인된 빈 문서일 때만 시드를 업로드한다.
    if (!Object.keys(data).length && !fromCache) {
      trackSave(saveSchedule(INITIAL_SCHEDULE));
    }
  } catch (err) {
    handleLoadError(err);
    hadError = true;
  }

  try {
    const { data } = await fetchScheduleNotes();
    currentNotes = data || {};
  } catch (err) {
    handleLoadError(err);
    hadError = true;
  }
  renderTimetableNow();
  syncNoteField();

  try {
    const { data: list, fromCache } = await fetchRoster();
    roster = list.length ? list : INITIAL_ROSTER;
    if (!list.length && !fromCache) {
      trackSave(saveRoster(INITIAL_ROSTER));
    }
    setConnStatus(hadError || fromCache);
  } catch (err) {
    handleLoadError(err);
    hadError = true;
  }
  renderStudentList();

  try {
    daily = await ensureTodayDaily(toDateKey(new Date()));
  } catch (err) {
    handleLoadError(err);
  }
  renderStudentList();
  renderNoticeGeneral();
  renderMorningBanner();
  renderTimetableNow();
}

loadInitialData();
