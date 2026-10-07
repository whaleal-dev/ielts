export const CHROME_NOTICE_KEY = 'ielts-practice-v1:chrome-notice-date';

export function isGoogleChrome(browser = globalThis.navigator) {
  const userAgent = browser?.userAgent || '';
  if (browser?.brave || /\b(?:Chromium|Edg(?:e|A|iOS)?|OPR|Opera|SamsungBrowser)\//.test(userAgent)) return false;
  if (/\bCriOS\//.test(userAgent)) return true;
  const brands = browser?.userAgentData?.brands;
  if (brands?.length) return brands.some(({ brand }) => brand === 'Google Chrome');
  return browser?.vendor === 'Google Inc.' && /\bChrome\//.test(userAgent) && !/\bwv\b/.test(userAgent);
}

export function claimChromeNotice({ browser = globalThis.navigator, storage, now = new Date() } = {}) {
  if (isGoogleChrome(browser)) return false;
  try {
    const local = storage ?? globalThis.localStorage;
    if (!local) return false;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    if (local.getItem(CHROME_NOTICE_KEY) === day) return false;
    local.setItem(CHROME_NOTICE_KEY, day);
    return true;
  } catch { return false; }
}
