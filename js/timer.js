export function formatCountdown(remainingSeconds) {
  const clamped = Math.max(0, Math.round(remainingSeconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function computeRemaining(totalSeconds, startedAtMs, nowMs) {
  const elapsed = Math.floor((nowMs - startedAtMs) / 1000);
  return Math.max(0, totalSeconds - elapsed);
}

export function clampMinutesToSeconds(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(Math.min(n, 60) * 60);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ko-KR';
  window.speechSynthesis.speak(utter);
}

export function wireTimerWidget({
  presetButtons, customInput, customSetBtn, displayEl, startBtn, pauseBtn, resetBtn,
}) {
  let totalSeconds = 0;
  let startedAtMs = null;
  let remaining = 0;
  let intervalId = null;

  function render() {
    displayEl.textContent = formatCountdown(remaining);
  }

  function setTotal(seconds) {
    totalSeconds = seconds;
    remaining = seconds;
    startedAtMs = null;
    clearInterval(intervalId);
    intervalId = null;
    render();
  }

  function tick() {
    remaining = computeRemaining(totalSeconds, startedAtMs, Date.now());
    render();
    if (remaining <= 0) {
      clearInterval(intervalId);
      intervalId = null;
      speak('타이머가 끝났습니다.');
      displayEl.classList.add('done');
    }
  }

  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => setTotal(Number(btn.dataset.seconds)));
  });

  customSetBtn.addEventListener('click', () => {
    const seconds = clampMinutesToSeconds(customInput.value);
    if (seconds === null) {
      alert('1~60 사이의 분(숫자)을 입력해주세요.');
      return;
    }
    setTotal(seconds);
  });

  startBtn.addEventListener('click', () => {
    if (totalSeconds <= 0 || intervalId) return;
    displayEl.classList.remove('done');
    startedAtMs = Date.now() - (totalSeconds - remaining) * 1000;
    intervalId = setInterval(tick, 1000);
  });

  pauseBtn.addEventListener('click', () => {
    clearInterval(intervalId);
    intervalId = null;
  });

  resetBtn.addEventListener('click', () => setTotal(totalSeconds));

  render();
}
