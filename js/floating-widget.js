export function isDocumentPipSupported(win) {
  return typeof win === 'object' && win !== null && 'documentPictureInPicture' in win;
}

export async function openFloatingWidget({ getContent }) {
  if (!isDocumentPipSupported(window)) return null;

  const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 300, height: 220 });

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
  `;
  pipWindow.document.head.appendChild(style);

  const root = pipWindow.document.createElement('div');
  root.innerHTML = `
    <div class="fw-date" id="fwDate"></div>
    <div class="fw-time" id="fwTime">00:00:00</div>
    <div class="fw-period" id="fwPeriod"></div>
    <div class="fw-next" id="fwNext"></div>
    <div class="fw-timer" id="fwTimer"></div>
  `;
  pipWindow.document.body.appendChild(root);

  const update = () => {
    const content = getContent();
    pipWindow.document.getElementById('fwDate').textContent = content.date;
    pipWindow.document.getElementById('fwTime').textContent = content.time;
    pipWindow.document.getElementById('fwPeriod').textContent = content.period;
    pipWindow.document.getElementById('fwNext').textContent = content.nextAlarm;
    pipWindow.document.getElementById('fwTimer').textContent = content.timer;
  };
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
