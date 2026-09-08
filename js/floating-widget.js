export function isDocumentPipSupported(win) {
  return typeof win === 'object' && win !== null && 'documentPictureInPicture' in win;
}

export async function openFloatingWidget({ getContent }) {
  if (!isDocumentPipSupported(window)) return null;

  const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 260, height: 160 });

  const style = pipWindow.document.createElement('style');
  style.textContent = `
    body { margin: 0; background: #0e1420; color: #fff; font-family: 'Malgun Gothic', sans-serif;
           display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
    .fw-time { font-size: 2rem; font-weight: bold; }
    .fw-period { color: #ffcc00; margin-top: 6px; font-size: 1rem; }
    .fw-timer { margin-top: 6px; font-size: 1.3rem; }
  `;
  pipWindow.document.head.appendChild(style);

  const root = pipWindow.document.createElement('div');
  root.innerHTML = `
    <div class="fw-time" id="fwTime">00:00:00</div>
    <div class="fw-period" id="fwPeriod"></div>
    <div class="fw-timer" id="fwTimer"></div>
  `;
  pipWindow.document.body.appendChild(root);

  const intervalId = setInterval(() => {
    const content = getContent();
    pipWindow.document.getElementById('fwTime').textContent = content.time;
    pipWindow.document.getElementById('fwPeriod').textContent = content.period;
    pipWindow.document.getElementById('fwTimer').textContent = content.timer;
  }, 1000);

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
