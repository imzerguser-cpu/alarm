export function isDocumentPipSupported(win) {
  return typeof win === 'object' && win !== null && 'documentPictureInPicture' in win;
}

export async function openFloatingWidget({ getContent }) {
  if (!isDocumentPipSupported(window)) return null;

  const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 300, height: 260 });

  const style = pipWindow.document.createElement('style');
  style.textContent = `
    body { margin: 0; background: #0e1420; color: #fff; font-family: 'Malgun Gothic', sans-serif;
           display: flex; flex-direction: column; align-items: center; justify-content: center;
           height: 100vh; gap: 2px; padding: 10px; text-align: center; }
    .fw-date { color: #9aa7bd; font-size: 0.9rem; }
    .fw-time { font-size: 2rem; font-weight: bold; }
    .fw-period { color: #ffcc00; margin-top: 4px; font-size: 1.1rem; font-weight: bold; }
    .fw-next { margin-top: 6px; font-size: 0.8rem; color: #9aa7bd; }
    .fw-timer { margin-top: 4px; font-size: 1.1rem; }
    .fw-controls { margin-top: 8px; display: flex; gap: 8px; }
    .fw-controls button {
      padding: 6px 12px; border-radius: 8px; border: none; cursor: pointer;
      font-weight: bold; font-size: 0.85rem;
    }
    #fwStartBtn { background: #2ecc71; color: #062; }
    #fwStopBtn { background: #555; color: #fff; }
    .fw-controls button:disabled { background: #333; color: #777; cursor: not-allowed; }
  `;
  pipWindow.document.head.appendChild(style);

  const root = pipWindow.document.createElement('div');
  root.innerHTML = `
    <div class="fw-date" id="fwDate"></div>
    <div class="fw-time" id="fwTime">00:00:00</div>
    <div class="fw-period" id="fwPeriod"></div>
    <div class="fw-next" id="fwNext"></div>
    <div class="fw-timer" id="fwTimer"></div>
    <div class="fw-controls">
      <button id="fwStartBtn">▶ 시작</button>
      <button id="fwStopBtn">⏹ 중지</button>
    </div>
  `;
  pipWindow.document.body.appendChild(root);

  const startBtn = pipWindow.document.getElementById('fwStartBtn');
  const stopBtn = pipWindow.document.getElementById('fwStopBtn');

  const update = () => {
    const content = getContent();
    pipWindow.document.getElementById('fwDate').textContent = content.date;
    pipWindow.document.getElementById('fwTime').textContent = content.time;
    pipWindow.document.getElementById('fwPeriod').textContent = content.period;
    pipWindow.document.getElementById('fwNext').textContent = content.nextAlarm;
    pipWindow.document.getElementById('fwTimer').textContent = content.timer;
    const running = window.classBell ? window.classBell.isRunning() : false;
    startBtn.disabled = running;
    stopBtn.disabled = !running;
  };

  // window.classBell은 js/bell.js가 노출하는 최소 창구다(같은 window를 공유
  // 하므로 여기서도 그대로 호출된다). 혹시 bell.js가 아직 로드되기 전이면
  // 버튼을 눌러도 조용히 아무 일도 안 하도록 존재 여부만 확인한다. 클릭 직후
  // update()도 바로 불러줘야 disabled 상태가 다음 1초 tick까지 안 밀린다.
  startBtn.addEventListener('click', () => {
    if (window.classBell) window.classBell.start();
    update();
  });
  stopBtn.addEventListener('click', () => {
    if (window.classBell) window.classBell.stop();
    update();
  });

  update();
  const intervalId = setInterval(update, 1000);

  pipWindow.addEventListener('pagehide', () => clearInterval(intervalId));

  return pipWindow;
}

export function wireFloatingWidgetButton({ buttonEl, messageEl, getContent }) {
  if (!isDocumentPipSupported(window)) {
    buttonEl.disabled = true;
    messageEl.textContent = '이 브라우저는 지원하지 않습니다 (데스크톱 크롬/엣지 최신 버전에서 사용해주세요).';
    return;
  }
  buttonEl.addEventListener('click', () => openFloatingWidget({ getContent }));
}
