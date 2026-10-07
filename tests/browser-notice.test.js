import test from 'node:test';
import assert from 'node:assert/strict';
import { CHROME_NOTICE_KEY, claimChromeNotice, isGoogleChrome } from '../src/practice/browser.js';

const chrome = { userAgent: 'Mozilla/5.0 Chrome/134.0.0.0 Safari/537.36', vendor: 'Google Inc.' };
const safari = { userAgent: 'Mozilla/5.0 Version/18.0 Safari/605.1.15', vendor: 'Apple Computer, Inc.' };
const now = new Date('2026-10-07T04:00:00Z');
function createStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('Google Chrome is recognized by brand, fallback UA and iOS CriOS', () => {
  assert.equal(isGoogleChrome({ ...chrome, userAgentData: { brands: [{ brand: 'Not A Brand' }, { brand: 'Chromium' }, { brand: 'Google Chrome' }] } }), true);
  assert.equal(isGoogleChrome(chrome), true);
  assert.equal(isGoogleChrome({ userAgent: 'Mozilla/5.0 (iPhone) CriOS/134.0.0.0 Mobile/15E148 Safari/604.1', vendor: 'Apple Computer, Inc.' }), true);
});

test('Edge, Opera, Safari, Firefox, Chromium, Brave and Android WebView do not pass as Google Chrome', () => {
  const browsers = [safari, { userAgent: 'Mozilla/5.0 Firefox/134.0' }, { ...chrome, brave: {} }, { ...chrome, userAgent: chrome.userAgent + ' wv' }, { ...chrome, userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Not A Brand' }] } }];
  for (const token of ['Edg', 'EdgA', 'EdgiOS', 'Edge', 'OPR', 'Opera', 'Chromium', 'SamsungBrowser']) browsers.push({ ...chrome, userAgent: chrome.userAgent + ` ${token}/134.0` });
  for (const browser of browsers) assert.equal(isGoogleChrome(browser), false);
  assert.equal(isGoogleChrome(), false);
});

test('both module visits and reloads share one notice per day, and a later day allows another notice', () => {
  const storage = createStorage();
  assert.equal(claimChromeNotice({ browser: safari, storage, now }), true);
  assert.equal(storage.getItem(CHROME_NOTICE_KEY), '2026-10-07');
  assert.equal(claimChromeNotice({ browser: safari, storage, now }), false);
  const reloadedStorage = { getItem: storage.getItem, setItem: storage.setItem };
  assert.equal(claimChromeNotice({ browser: safari, storage: reloadedStorage, now }), false);
  assert.equal(claimChromeNotice({ browser: safari, storage, now: new Date('2026-10-08T04:00:00Z') }), true);
  assert.equal(claimChromeNotice({ browser: safari, storage, now: new Date('2026-10-08T15:59:59Z') }), false);
});

test('the notice resets at midnight in Asia/Shanghai instead of after a rolling 24 hours', () => {
  const storage = createStorage();
  assert.equal(claimChromeNotice({ browser: safari, storage, now: new Date('2026-10-07T15:59:59Z') }), true);
  assert.equal(claimChromeNotice({ browser: safari, storage, now: new Date('2026-10-07T16:00:00Z') }), true);
  assert.equal(storage.getItem(CHROME_NOTICE_KEY), '2026-10-08');
  assert.equal(claimChromeNotice({ browser: safari, storage, now: new Date('2026-10-07T16:00:01Z') }), false);
});

test('Chrome does not consume or access the daily notice record', () => {
  const storage = { getItem() { assert.fail('Chrome should not read the notice'); }, setItem() { assert.fail('Chrome should not write the notice'); } };
  assert.equal(claimChromeNotice({ browser: chrome, storage, now }), false);
});

test('unavailable or full storage suppresses the popup instead of repeatedly displaying it', () => {
  const unavailable = { getItem() { throw new Error('Storage blocked'); } };
  const full = { getItem: () => null, setItem() { throw new DOMException('Storage full', 'QuotaExceededError'); } };
  for (const storage of [unavailable, full]) {
    assert.equal(claimChromeNotice({ browser: safari, storage, now }), false);
    assert.equal(claimChromeNotice({ browser: safari, storage, now }), false);
  }
});
