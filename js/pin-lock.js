export function checkPin(input, correctPin) {
  return typeof input === 'string' && input.trim() === String(correctPin);
}

export function initPinLock({
  buttonEl, modalEl, inputEl, submitEl, cancelEl, getCorrectPin, onUnlock, isUnlocked, onLock,
}) {
  const open = () => {
    // 이미 편집모드면 버튼은 "잠그기"로 동작한다 — 잠글 때는 PIN을 묻지 않는다.
    // (isUnlocked/onLock은 선택 사항이라 넘기지 않으면 기존 동작 그대로다.)
    if (isUnlocked && isUnlocked()) {
      if (onLock) onLock();
      return;
    }
    modalEl.hidden = false;
    inputEl.value = '';
    inputEl.focus();
  };
  const close = () => { modalEl.hidden = true; };
  const submit = () => {
    // 정답 PIN을 고정값이 아니라 함수로 받는다 — PIN을 나중에 바꿀 수 있게
    // 되면서, 호출 시점에 캡처된 값이 아니라 매번 최신 값을 물어봐야 한다.
    if (checkPin(inputEl.value, getCorrectPin())) {
      close();
      onUnlock();
    } else {
      alert('PIN이 올바르지 않습니다.');
      inputEl.value = '';
      inputEl.focus();
    }
  };
  buttonEl.addEventListener('click', open);
  submitEl.addEventListener('click', submit);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') close();
  });
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) close();
  });
  // PIN을 몰라도 실수로 연 창은 닫을 수 있어야 한다 — 배경 탭이나 Esc는
  // 발견하기 어려우므로 눈에 보이는 닫기 버튼을 따로 둔다.
  if (cancelEl) cancelEl.addEventListener('click', close);
}
