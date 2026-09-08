export function getInstallInstructions(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroidChrome = /android/.test(ua) && /chrome/.test(ua);
  if (isIOS) {
    return { auto: false, message: 'Safari 하단 공유 버튼을 누르고 "홈 화면에 추가"를 선택하세요.' };
  }
  if (isAndroidChrome) {
    return { auto: true, message: '설치 팝업이 뜨면 "설치"를 눌러주세요.' };
  }
  return { auto: false, message: '브라우저 메뉴에서 "홈 화면에 추가" 또는 "앱 설치"를 찾아 선택하세요.' };
}

export function wireInstallButton({ buttonEl, messageEl, userAgent = navigator.userAgent }) {
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
  buttonEl.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    } else {
      const info = getInstallInstructions(userAgent);
      messageEl.textContent = info.message;
      messageEl.classList.add('show');
    }
  });
}
