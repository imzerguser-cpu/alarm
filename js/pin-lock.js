export function checkPin(input, correctPin) {
  return typeof input === 'string' && input.trim() === String(correctPin);
}

export function initPinLock({ buttonEl, modalEl, inputEl, submitEl, correctPin, onUnlock }) {
  const open = () => {
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
