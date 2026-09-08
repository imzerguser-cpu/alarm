export function checkPin(input, correctPin) {
  return typeof input === 'string' && input.trim() === String(correctPin);
}

export function initPinLock({
  buttonEl, modalEl, inputEl, submitEl, correctPin, onUnlock, isUnlocked, onLock,
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
    if (checkPin(inputEl.value, correctPin)) {
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
  });
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) close();
  });
}
