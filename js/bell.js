(function () {
  const STORAGE_KEY = 'classBellSchedule';
  const FIRED_KEY = 'classBellFired';

  const DEFAULT_SCHEDULE = [
    { time: '08:45', message: '교실 청소, 자리 정리를 하고 가정통신문을 확인해서 제출하세요.' },
    { time: '08:50', message: '유창성 읽기를 시작합니다. 1분씩 세 번 반복하세요.' },
    { time: '08:55', message: '1교시 수업을 준비하세요.' },
    { time: '09:48', message: '쉬는 시간이 2분 남았습니다. 화장실에 다녀오고 수업을 준비하세요.' },
    { time: '10:48', message: '쉬는 시간이 2분 남았습니다. 화장실에 다녀오고 수업을 준비하세요.' },
    { time: '11:38', message: '쉬는 시간이 2분 남았습니다. 화장실에 다녀오고 수업을 준비하세요.' },
    { time: '13:18', message: '점심시간이 2분 남았습니다. 화장실에 다녀오고 수업을 준비하세요.' },
    { time: '14:08', message: '쉬는 시간이 2분 남았습니다. 화장실에 다녀오고 수업을 준비하세요.' }
  ];

  const clockNowEl = document.getElementById('clockNow');
  const clockDateEl = document.getElementById('clockDate');
  const nextAlarmInfoEl = document.getElementById('nextAlarmInfo');
  const startBtn = document.getElementById('startBellBtn');
  const stopBtn = document.getElementById('stopBellBtn');
  const testVoiceBtn = document.getElementById('testVoiceBtn');
  const bellStatusEl = document.getElementById('bellStatus');
  const scheduleListEl = document.getElementById('scheduleList');
  const addRowBtn = document.getElementById('addRowBtn');
  const saveScheduleBtn = document.getElementById('saveScheduleBtn');
  const alarmBannerEl = document.getElementById('alarmBanner');
  const alarmBannerTextEl = document.getElementById('alarmBannerText');
  const alarmBannerCloseBtn = document.getElementById('alarmBannerCloseBtn');

  let schedule = loadSchedule();
  let running = false;
  let tickTimer = null;
  let bannerHideTimer = null;

  function loadSchedule() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SCHEDULE.map((item) => ({ ...item }));
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (err) {
      console.error('알림 시간표를 불러오지 못했습니다:', err);
    }
    return DEFAULT_SCHEDULE.map((item) => ({ ...item }));
  }

  function saveSchedule() {
    schedule.sort((a, b) => a.time.localeCompare(b.time));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
    renderSchedule();
  }

  function todayKey() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }

  function loadFiredToday() {
    try {
      const raw = localStorage.getItem(FIRED_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (parsed.date !== todayKey()) return new Set();
      return new Set(parsed.times || []);
    } catch (err) {
      return new Set();
    }
  }

  function markFired(time) {
    const fired = loadFiredToday();
    fired.add(time);
    localStorage.setItem(FIRED_KEY, JSON.stringify({ date: todayKey(), times: Array.from(fired) }));
  }

  function pickKoreanVoice() {
    const voices = window.speechSynthesis.getVoices();
    const koreanVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('ko'));
    if (!koreanVoices.length) return null;
    // Web Speech API는 성별 정보를 따로 주지 않아 이름으로 추정할 수밖에 없다.
    // "Microsoft InJoon"처럼 이름에 남성을 암시하는 표현이 있으면 그걸 우선한다.
    const maleHint = koreanVoices.find((v) => /male|남성|injoon/i.test(v.name));
    return maleHint || koreanVoices[0];
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) {
      alert('이 브라우저는 음성 안내를 지원하지 않습니다.');
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = 1.08; // 기존(0.95)보다 아주 조금 빠르게
    utter.pitch = 0.9; // 살짝 낮춰 더 자연스러운 남성 톤에 가깝게
    const voice = pickKoreanVoice();
    if (voice) utter.voice = voice;
    window.speechSynthesis.speak(utter);
  }

  function showBanner(text) {
    alarmBannerTextEl.textContent = text;
    alarmBannerEl.classList.add('show');
    clearTimeout(bannerHideTimer);
    bannerHideTimer = setTimeout(hideBanner, 20000);
  }

  function hideBanner() {
    alarmBannerEl.classList.remove('show');
    clearTimeout(bannerHideTimer);
  }

  function currentHms() {
    const now = new Date();
    return {
      hm: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
      hms: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0')
    };
  }

  function updateClock() {
    const now = new Date();
    const { hms } = currentHms();
    clockNowEl.textContent = hms;
    clockDateEl.textContent = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    updateNextAlarmInfo();
  }

  function updateNextAlarmInfo() {
    const { hm } = currentHms();
    const upcoming = schedule
      .filter((item) => item.time >= hm)
      .sort((a, b) => a.time.localeCompare(b.time))[0];
    if (!upcoming) {
      nextAlarmInfoEl.textContent = '오늘 예정된 다음 알림이 없습니다.';
      return;
    }
    nextAlarmInfoEl.textContent = `다음 알림 ${upcoming.time} — ${upcoming.message}`;
  }

  function checkAlarms() {
    if (!running) return;
    const { hm } = currentHms();
    const fired = loadFiredToday();
    schedule.forEach((item) => {
      if (item.time === hm && !fired.has(item.time)) {
        markFired(item.time);
        speak(item.message);
        showBanner(`${item.time} — ${item.message}`);
      }
    });
  }

  function tick() {
    updateClock();
    checkAlarms();
  }

  function startBell() {
    if (running) return;
    running = true;
    speak('교실 수업 알리미를 시작합니다.');
    tickTimer = setInterval(tick, 1000);
    tick();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    bellStatusEl.textContent = '알리미가 작동 중입니다.';
    bellStatusEl.classList.add('on');
  }

  function stopBell() {
    running = false;
    clearInterval(tickTimer);
    tickTimer = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    bellStatusEl.textContent = '알리미가 꺼져 있습니다. 시작 버튼을 눌러주세요.';
    bellStatusEl.classList.remove('on');
  }

  function renderSchedule() {
    scheduleListEl.innerHTML = '';
    schedule.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'schedule-row';

      const timeInput = document.createElement('input');
      timeInput.type = 'time';
      timeInput.value = item.time;
      timeInput.addEventListener('change', () => { schedule[index].time = timeInput.value; });

      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.value = item.message;
      textInput.addEventListener('change', () => { schedule[index].message = textInput.value; });

      const testBtn = document.createElement('button');
      testBtn.className = 'row-test-btn';
      testBtn.textContent = '테스트';
      testBtn.addEventListener('click', () => speak(schedule[index].message));

      const delBtn = document.createElement('button');
      delBtn.className = 'row-del-btn';
      delBtn.textContent = '삭제';
      delBtn.addEventListener('click', () => {
        schedule.splice(index, 1);
        saveSchedule();
      });

      row.appendChild(timeInput);
      row.appendChild(textInput);
      row.appendChild(testBtn);
      row.appendChild(delBtn);
      scheduleListEl.appendChild(row);
    });
  }

  startBtn.addEventListener('click', startBell);
  stopBtn.addEventListener('click', stopBell);
  testVoiceBtn.addEventListener('click', () => speak('음성 안내 테스트입니다.'));
  alarmBannerCloseBtn.addEventListener('click', hideBanner);
  addRowBtn.addEventListener('click', () => {
    schedule.push({ time: '09:00', message: '새 알림 내용을 입력하세요.' });
    schedule.sort((a, b) => a.time.localeCompare(b.time));
    renderSchedule();
  });
  saveScheduleBtn.addEventListener('click', () => {
    saveSchedule();
    alert('알림 시간표를 저장했습니다.');
  });

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {};
  }

  renderSchedule();
  updateClock();
})();
