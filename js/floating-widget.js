export function isDocumentPipSupported(win) {
  return typeof win === 'object' && win !== null && 'documentPictureInPicture' in win;
}

export async function openFloatingWidget({ getContent }) {
  if (!isDocumentPipSupported(window)) return null;

  // 전자칠판 한 구석에 계속 띄워두고 오늘 시간표 전체를 보는 용도라, 한 줄짜리
  // 요약보다 세로로 긴 창이 낫다. 그래도 사용자가 직접 크기를 조절할 수 있다.
  const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 260, height: 480 });

  const style = pipWindow.document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    body { margin: 0; background: #0e1420; color: #fff; font-family: 'Malgun Gothic', sans-serif;
           display: flex; flex-direction: column; height: 100vh; text-align: center; overflow: hidden; }
    .fw-header { flex: none; padding: 8px 8px 4px; }
    .fw-date { color: #9aa7bd; font-size: 0.78rem; }
    .fw-time { font-size: 1.3rem; font-weight: bold; }
    .fw-next { margin-top: 4px; font-size: 0.72rem; color: #ffcc00; line-height: 1.3; }
    .fw-conn { margin-top: 4px; font-size: 0.72rem; color: #e74c3c; }
    .fw-conn[hidden] { display: none; }

    .fw-timetable { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 4px 8px; }
    .fw-row {
      display: flex; align-items: center; justify-content: space-between; gap: 6px;
      padding: 5px 8px; border-radius: 8px; background: #1a2233; margin-bottom: 4px; font-size: 0.78rem;
    }
    .fw-row.current { background: #ffcc00; color: #111; font-weight: bold; }
    .fw-row .fw-row-time { color: #9aa7bd; flex: none; white-space: nowrap; }
    .fw-row.current .fw-row-time { color: #333; }
    .fw-row .fw-row-subject { flex: 1; text-align: right; }

    .fw-footer { flex: none; padding: 6px 8px 10px; }
    .fw-timer { font-size: 1rem; margin-bottom: 4px; }
    .fw-controls { display: flex; gap: 8px; justify-content: center; }
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
    <div class="fw-header">
      <div class="fw-date" id="fwDate"></div>
      <div class="fw-time" id="fwTime">00:00:00</div>
      <div class="fw-next" id="fwNext"></div>
      <div class="fw-conn" id="fwConn" hidden>⚠ 연결 끊김</div>
    </div>
    <div class="fw-timetable" id="fwTimetable"></div>
    <div class="fw-footer">
      <div class="fw-timer" id="fwTimer"></div>
      <div class="fw-controls">
        <button id="fwStartBtn">▶ 시작</button>
        <button id="fwStopBtn">⏹ 중지</button>
      </div>
    </div>
  `;
  pipWindow.document.body.appendChild(root);

  const startBtn = pipWindow.document.getElementById('fwStartBtn');
  const stopBtn = pipWindow.document.getElementById('fwStopBtn');
  const timetableEl = pipWindow.document.getElementById('fwTimetable');

  const renderRows = (rows) => {
    timetableEl.innerHTML = '';
    for (const row of rows || []) {
      const rowEl = pipWindow.document.createElement('div');
      rowEl.className = 'fw-row' + (row.isCurrent ? ' current' : '');
      const time = pipWindow.document.createElement('span');
      time.className = 'fw-row-time';
      time.textContent = row.time;
      const subject = pipWindow.document.createElement('span');
      subject.className = 'fw-row-subject';
      subject.textContent = row.subject + (row.overridden ? ' (오늘만)' : '');
      rowEl.append(time, subject);
      timetableEl.appendChild(rowEl);
    }
  };

  const update = () => {
    const content = getContent();
    pipWindow.document.getElementById('fwDate').textContent = content.date;
    pipWindow.document.getElementById('fwTime').textContent = content.time;
    pipWindow.document.getElementById('fwNext').textContent = content.nextAlarm;
    pipWindow.document.getElementById('fwTimer').textContent = content.timer;
    pipWindow.document.getElementById('fwConn').hidden = !content.connLost;
    renderRows(content.rows);
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
