(function () {
  const STORAGE_KEY = 'classBellSchedule';
  const FIRED_KEY = 'classBellFired';
  const RUNNING_KEY = 'classBellRunning';
  const ALARM_REPEAT_COUNT = 3;

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
  const bellRunningStatusEl = document.getElementById('bellRunningStatus');
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
  // 상태를 기억해두지 않으면 새로고침·태블릿 재부팅마다 알리미가 꺼진 채로
  // 돌아온다. localStorage에 기억해뒀다가 그대로 이어간다(시작/중지 버튼 자체는
  // 이제 항상 보이지만, 그래도 매번 다시 누르게 하고 싶지는 않다).
  let running = false;
  try {
    running = localStorage.getItem(RUNNING_KEY) === 'true';
  } catch (err) {
    // 사파리 콘텐츠 차단 등으로 localStorage 접근 자체가 막힌 환경에서도
    // (loadSchedule/loadFiredToday와 같은 방식으로) 여기서 멈추지 않고 "꺼짐"
    // 기본값으로 계속 진행한다 — 그래야 학생용 시계가 죽지 않는다.
  }
  let tickTimer = null;
  let bannerHideTimer = null;
  let wakeLockSentinel = null;

  // 관리자 모드가 아니어도 항상 보이는 자리(상단 시계 옆)에 켜짐/꺼짐을 표시한다.
  function updateRunningBadge() {
    if (!bellRunningStatusEl) return;
    bellRunningStatusEl.textContent = running ? '🔔 알리미 켜짐' : '🔕 알리미 꺼짐';
    bellRunningStatusEl.classList.toggle('on', running);
  }

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
    // "male"만 보면 "Female"에도 걸리므로 여성을 암시하는 이름은 먼저 제외한다.
    const maleHint = koreanVoices.find(
      (v) => /male|남성|injoon/i.test(v.name) && !/female|여성/i.test(v.name),
    );
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

  // 실제 수업종 알림은 한 번만 말하면 교실이 시끄러울 때 놓치기 쉬워서
  // 같은 문장을 세 번 반복하고 멈춘다(무한 반복 아님). onend로 다음 발화를
  // 이어 붙여야 브라우저가 겹쳐 말하지 않는다.
  function speakOnceAsync(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ko-KR';
      utter.rate = 1.08;
      utter.pitch = 0.9;
      const voice = pickKoreanVoice();
      if (voice) utter.voice = voice;
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.speak(utter);
    });
  }

  async function speakRepeated(text, times) {
    window.speechSynthesis.cancel();
    for (let i = 0; i < times; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await speakOnceAsync(text);
    }
  }

  // 태블릿에서 다른 앱을 보고 있으면 이 탭은 백그라운드로 밀려나 음성 재생이
  // 브라우저 정책상 끊긴다. Service Worker의 showNotification()은 이 경우에도
  // 시스템 알림(소리+진동)을 띄울 수 있으므로 최소한의 대안으로 사용한다.
  // (Service Worker 안에서는 speechSynthesis 자체를 쓸 수 없어 완전한 대체는 불가능하다.)
  function notifyInBackground(message) {
    if (document.visibilityState !== 'hidden') return;
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    navigator.serviceWorker.ready
      .then((reg) => {
        if (reg.active) {
          reg.active.postMessage({ type: 'SHOW_ALARM_NOTIFICATION', title: '🔔 교실 수업 알리미', body: message });
        }
      })
      .catch(() => {});
  }

  // 화면이 꺼지지 않아야 이 탭이 계속 살아있는다. 다른 앱으로 전환하면 OS가
  // wake lock을 자동 해제하므로, 다시 이 탭이 보일 때 running 상태면 재요청한다.
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
    } catch (err) {
      // 지원 안 되거나 권한이 없는 환경 - 조용히 무시
    }
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) {
      wakeLockSentinel.release().catch(() => {});
      wakeLockSentinel = null;
    }
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
    };
  }

  // 알림 시각 비교(checkAlarms/updateNextAlarmInfo)와 시간표 데이터는 전부
  // 24시간 "HH:MM" 문자열을 그대로 비교하므로 그 로직은 건드리지 않는다.
  // 여기 두 함수는 오직 "화면에 뭐라고 보여줄지"만 12시간(오전/오후)으로 바꾼다.
  function formatTime12(hh, mm) {
    const period = hh < 12 ? '오전' : '오후';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${period} ${h12}:${String(mm).padStart(2, '0')}`;
  }

  function formatTime12FromHHMM(hhmm) {
    const [hh, mm] = hhmm.split(':').map(Number);
    return formatTime12(hh, mm);
  }

  function updateClock() {
    const now = new Date();
    clockNowEl.textContent = `${formatTime12(now.getHours(), now.getMinutes())}:${String(now.getSeconds()).padStart(2, '0')}`;
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
    nextAlarmInfoEl.textContent = `다음 알림 ${formatTime12FromHHMM(upcoming.time)} — ${upcoming.message}`;
  }

  function checkAlarms() {
    if (!running) return;
    const { hm } = currentHms();
    const fired = loadFiredToday();
    schedule.forEach((item) => {
      if (item.time === hm && !fired.has(item.time)) {
        markFired(item.time);
        speakRepeated(item.message, ALARM_REPEAT_COUNT);
        notifyInBackground(item.message);
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
    localStorage.setItem(RUNNING_KEY, 'true');
    speak('교실 수업 알리미를 시작합니다.');
    // 알림 권한도, 화면 유지도 사용자 클릭(제스처) 안에서 요청해야 브라우저가 막지 않는다.
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    requestWakeLock();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    bellStatusEl.textContent = '알리미가 작동 중입니다.';
    bellStatusEl.classList.add('on');
    updateRunningBadge();
  }

  function stopBell() {
    running = false;
    localStorage.setItem(RUNNING_KEY, 'false');
    releaseWakeLock();
    startBtn.disabled = false;
    stopBtn.disabled = true;
    bellStatusEl.textContent = '알리미가 꺼져 있습니다. 시작 버튼을 눌러주세요.';
    bellStatusEl.classList.remove('on');
    updateRunningBadge();
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
  // 새로고침/재부팅 후에도 켜져 있던 상태 그대로 이어간다. HTML은 "꺼짐"을
  // 기본값으로 그려두므로, 실제로 켜져 있었다면 버튼·문구를 그 상태로 맞춘다.
  // speak()는 호출하지 않는다 — 페이지가 막 열린 시점에 사용자 동작 없이
  // 음성을 재생하면 브라우저가 막을 수 있고, 굳이 매번 안내할 필요도 없다.
  if (running) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    bellStatusEl.textContent = '알리미가 작동 중입니다.';
    bellStatusEl.classList.add('on');
    requestWakeLock();
  }
  updateRunningBadge();

  // 다른 앱으로 전환했다가 이 탭으로 돌아오면 OS가 자동 해제한 wake lock을
  // 다시 잡아준다(잡아뒀던 화면-꺼짐-방지 상태를 이어간다).
  document.addEventListener('visibilitychange', () => {
    if (running && document.visibilityState === 'visible' && !wakeLockSentinel) {
      requestWakeLock();
    }
  });
  // 화면 상단의 시계와 "다음 알림" 표시는 관리자 모드 여부와 무관하게 항상
  // 최신이어야 한다(학생이 보는 화면에도 큰 시계가 계속 가야 하고, PC 플로팅
  // 위젯도 #nextAlarmInfo의 텍스트를 그대로 읽는다). 시작/중지/음성테스트
  // 버튼도 이제 항상 화면에 보이므로, 시계 틱은 그 버튼 상태와 별개로 항상
  // 돌리고, 실제 음성 알림 여부만 running 플래그로 checkAlarms() 안에서 켜고 끈다.
  tickTimer = setInterval(tick, 1000);
  tick();

  // PC 플로팅 위젯(js/floating-widget.js)에서도 시작/중지 버튼을 쓸 수 있도록
  // 최소한의 창구만 열어둔다. Document Picture-in-Picture 창은 이 페이지와
  // 같은 자바스크립트 실행 환경(같은 window)을 공유하므로 그대로 호출된다.
  //
  // setSchedule: main.js가 오늘 시간표(Firestore)와 알림 설정(bellConfig)을
  // 조합해 계산한 "오늘 알림 목록"을 여기로 밀어 넣는다.
  // bell.js 자체는 시간표를 모르고 그냥 {time, message} 목록을 받아 그 시각에
  // 말해주는 역할만 한다 — 계산은 js/bell-schedule.js(순수 함수)가 한다.
  window.classBell = {
    start: startBell,
    stop: stopBell,
    isRunning: () => running,
    setSchedule: (newSchedule) => {
      if (!Array.isArray(newSchedule)) return;
      schedule = newSchedule;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
      renderSchedule();
      updateNextAlarmInfo();
    },
  };
})();
