import { getDayKey, getCurrentPeriodId } from './schedule-times.js';
import { buildTodayRows, renderTimetable } from './timetable.js';
import { INITIAL_SCHEDULE } from './seed-data.js';
import { initPinLock } from './pin-lock.js';
import { subscribeSchedule, saveSchedule } from './store.js';

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
