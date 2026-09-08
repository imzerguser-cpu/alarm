import { getDayKey, getCurrentPeriodId } from './schedule-times.js';
import { buildTodayRows, renderTimetable } from './timetable.js';
import { INITIAL_SCHEDULE } from './seed-data.js';
import { initPinLock } from './pin-lock.js';
import { subscribeSchedule, saveSchedule } from './store.js';

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setConnStatus(fromCache) {
  document.getElementById('connStatus').hidden = !fromCache;
}

let currentSchedule = INITIAL_SCHEDULE;

function renderTimetableNow() {
  const now = new Date();
  const dayKey = getDayKey(now);
  const currentPeriodId = getCurrentPeriodId(now);
  const rows = buildTodayRows(currentSchedule, dayKey, currentPeriodId);
  renderTimetable(document.getElementById('timetablePanel'), rows);
}

subscribeSchedule((data) => {
  currentSchedule = Object.keys(data).length ? data : INITIAL_SCHEDULE;
  if (!Object.keys(data).length) {
    saveSchedule(INITIAL_SCHEDULE); // 최초 1회 시드 업로드
  }
  renderTimetableNow();
});

setInterval(renderTimetableNow, 30000);

// 시간표 편집 폼 배선
const subjectPreset = document.getElementById('ttEditSubjectPreset');
const subjectCustom = document.getElementById('ttEditSubjectCustom');
subjectPreset.addEventListener('change', () => {
  subjectCustom.hidden = subjectPreset.value !== '__custom';
});
document.getElementById('ttEditApplyBtn').addEventListener('click', () => {
  const day = document.getElementById('ttEditDay').value;
  const period = document.getElementById('ttEditPeriod').value;
  const subject = subjectPreset.value === '__custom' ? subjectCustom.value.trim() : subjectPreset.value;
  if (!subject) return;
  const next = { ...currentSchedule, [day]: { ...currentSchedule[day], [period]: subject } };
  saveSchedule(next);
});

const EDIT_PIN = '1234'; // TODO: 원하는 PIN으로 바꾸세요.
window.__EDIT_MODE__ = false;

initPinLock({
  buttonEl: document.getElementById('editModeBtn'),
  modalEl: document.getElementById('pinModal'),
  inputEl: document.getElementById('pinInput'),
  submitEl: document.getElementById('pinSubmitBtn'),
  correctPin: EDIT_PIN,
  onUnlock: () => {
    window.__EDIT_MODE__ = true;
    document.body.classList.add('edit-mode');
    if (typeof renderStudentList === 'function') renderStudentList();
    if (typeof renderNoticeGeneral === 'function') renderNoticeGeneral();
  },
});

import {
  subscribeRoster, saveRoster, subscribeDaily, saveDaily, ensureTodayDaily,
} from './store.js';
import { formatHiClassText } from './notice-format.js';
import { isMorningActive } from './schedule-times.js';
import { INITIAL_ROSTER } from './seed-data.js';

let roster = INITIAL_ROSTER;
let daily = { date: toDateKey(new Date()), morningNotice: '', generalNotice: '', todos: {} };

function renderStudentList() {
  const container = document.getElementById('studentList');
  container.innerHTML = '';
  for (const student of roster) {
    const row = document.createElement('div');
    row.className = 'student-row';
    row.dataset.no = String(student.no);

    const name = document.createElement('span');
    name.className = 's-name';
    name.textContent = `${student.no}. ${student.name}`;

    const role = document.createElement('span');
    role.className = 's-role';
    role.textContent = student.role || '';

    const todo = document.createElement('input');
    todo.className = 's-todo';
    todo.type = 'text';
    todo.placeholder = '해야할일 / 제출할 것';
    todo.value = (daily.todos && daily.todos[String(student.no)]) || '';
    todo.disabled = !window.__EDIT_MODE__;
    todo.addEventListener('change', () => {
      // 로컬 daily.todos를 펼쳐서 통째로 저장하면, 학생 여러 명의 할일을
      // Firestore 응답이 오기 전에 연달아 수정할 때 먼저 쓴 값이 나중 쓰기에
      // 덮여 사라질 수 있다(경쟁 조건). setDoc(..., {merge:true})는 중첩 객체를
      // 재귀적으로 병합하므로(점 표기 문자열 키가 아니라 실제 중첩 객체로 넘겨야
      // 함 — 점 표기 키는 updateDoc에서만 경로로 해석되고 setDoc+merge에서는
      // 점이 포함된 하나의 리터럴 필드명으로 취급된다), todos 필드 안의 이
      // 학생 항목만 갱신되고 다른 학생의 값은 그대로 보존된다.
      saveDaily({ todos: { [String(student.no)]: todo.value } });
    });

    row.append(name, role, todo);
    container.appendChild(row);
  }
}

function renderNoticeGeneral() {
  const el = document.getElementById('noticeGeneralText');
  el.textContent = daily.generalNotice || '';
  el.contentEditable = window.__EDIT_MODE__ ? 'true' : 'false';
}

function renderMorningBanner() {
  const banner = document.getElementById('morningBanner');
  const active = isMorningActive(new Date()) && !!daily.morningNotice;
  banner.hidden = !active;
  if (active) {
    document.getElementById('morningBannerText').textContent = daily.morningNotice;
  }
}

document.getElementById('noticeGeneralText').addEventListener('blur', (e) => {
  if (!window.__EDIT_MODE__) return;
  saveDaily({ generalNotice: e.target.textContent });
});

subscribeRoster((list, fromCache) => {
  roster = list.length ? list : INITIAL_ROSTER;
  setConnStatus(fromCache);
  renderStudentList();
});

ensureTodayDaily(toDateKey(new Date())).then(() => {
  subscribeDaily((data, fromCache) => {
    if (!data) return;
    daily = data;
    setConnStatus(fromCache);
    renderStudentList();
    renderNoticeGeneral();
    renderMorningBanner();
  });
});

setInterval(renderMorningBanner, 15000);

document.getElementById('studentAddBtn').addEventListener('click', () => {
  const input = document.getElementById('studentAddNameInput');
  const name = input.value.trim();
  if (!name) return;
  const nextNo = roster.reduce((max, s) => Math.max(max, s.no), 0) + 1;
  const next = [...roster, { no: nextNo, name, role: '' }];
  saveRoster(next);
  input.value = '';
});

import { wireExcelInput } from './excel-import.js';

wireExcelInput({
  buttonEl: document.getElementById('excelUploadBtn'),
  fileInputEl: document.getElementById('excelFileInput'),
  onParsed: (list) => {
    // 기존 1인1역(role) 값은 이름이 같으면 유지
    const merged = list.map((s) => {
      const prev = roster.find((r) => r.name === s.name);
      return prev ? { ...s, role: prev.role } : s;
    });
    saveRoster(merged);
  },
});

document.getElementById('hiclassCopyBtn').addEventListener('click', async () => {
  const text = formatHiClassText(daily.generalNotice, roster, daily.todos);
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
