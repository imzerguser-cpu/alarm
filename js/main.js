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
      const nextTodos = { ...daily.todos, [String(student.no)]: todo.value };
      saveDaily({ todos: nextTodos });
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
