// ==UserScript==
// @name         BLS Helper ios
// @namespace    http://tampermonkey.net/
// @version      2025-10-16.12
// @description  Автообработка TMR/Access Denied, фикс двойной ротации, счётчик появлений NewAppointment (1-2 клик Try Again, 3 — ротация) с ожиданием кнопки и без sessionStorage-флага на заходе страницы. При TMR на целевой — немедленная ротация.
// @author       You
// @match        https://appointment.blsspainbelarus.by/*
// @match        https://appointment.blsspainbelarus.by/Global/Appointment/NewAppointment*
// @match        https://appointment.blsspainbelarus.by/Global/Appointment/PendingAppointment*
// @match        https://appointment.blsspainbelarus.by/Global/appointment/newappointment*
// @match        https://appointment.blsspainrussia.ru/Global/Appointment/NewAppointment*
// @match        https://appointment.blsspainrussia.ru/Global/appointment/newappointment*
// @match        https://belarus.blsspainglobal.com/Global/Appointment/NewAppointment*
// @match        https://belarus.blsspainglobal.com/Global/appointment/newappointment*
// @match        https://blsspainbelarus.by/*
// @grant        GM_xmlhttpRequest
// @connect      nozomi.proxy.rlwy.net
// @connect      api.ipify.org
// @connect      api64.ipify.org
// @connect      ifconfig.me
// @connect      ident.me
// @connect      checkip.amazonaws.com
// @connect      ipinfo.io
// @connect      ipv4.icanhazip.com
// @connect      v4.ident.me
// @connect      v4.ifconfig.co
// @connect      api-ipv4.ip.sb
// @connect      ifconfig.co
// @connect      ipapi.co
// @connect      httpbin.org
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  // ===== Конфиг =====
  const RAILWAY_HOST = 'nozomi.proxy.rlwy.net';
  const RAILWAY_PORT = 58990;
  const API_HTTPS = `https://${RAILWAY_HOST}:${RAILWAY_PORT}`;
  const API_HTTP  = `http://${RAILWAY_HOST}:${RAILWAY_PORT}`;

  const POLL_RETRIES = 25;
  const POLL_DELAY_MS = 400;
  const ROTATE_TIMEOUT_MS = 45000;
  const MAX_ROTATE_ROUNDS = 8;
  const API_TIMEOUT_MS = 15000;

  const AUTO_ENABLED_DEFAULT = true;
  const AUTO_INTERVAL_SEC_DEFAULT = 400;
  const RELOAD_ON_CHANGE_DEFAULT = true;

  const IS_IOS_SAFARI = /iPhone|iPad|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent);
  const IPV4_ONLY_DEFAULT = IS_IOS_SAFARI;
  const IOS_POLL_RETRIES = 30;
  const IOS_POLL_DELAY_MS = 400;
  const IOS_IP_TIMEOUT_MS = 400;

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  // ===== Cookies / LS =====
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
  }
  function setCookie(name, value) {
    document.cookie = `${name}=${value}; domain=.blsspainbelarus.by; path=/; secure; samesite=lax; max-age=31536000`;
  }

  let currentUser = getCookie('proxyUser') || '';
  let currentPass = getCookie('proxyPass') || '';

  const ls = {
    getAutoEnabled: () => (localStorage.getItem('autoEnabled') ?? (AUTO_ENABLED_DEFAULT ? '1' : '0')) === '1',
    setAutoEnabled: v => localStorage.setItem('autoEnabled', v ? '1' : '0'),
    getAutoInterval: () => {
      const v = parseInt(localStorage.getItem('autoIntervalSec') || '', 10);
      return Number.isFinite(v) && v >= 10 ? v : AUTO_INTERVAL_SEC_DEFAULT;
    },
    setAutoInterval: sec => localStorage.setItem('autoIntervalSec', String(Math.max(10, sec|0))),
    getReload: () => (localStorage.getItem('reloadOnChange') ?? (RELOAD_ON_CHANGE_DEFAULT ? '1' : '0')) === '1',
    setReload: v => localStorage.setItem('reloadOnChange', v ? '1' : '0'),
    getIPv4Only: () => (localStorage.getItem('ipv4Only') ?? (IPV4_ONLY_DEFAULT ? '1' : '0')) === '1',
    setIPv4Only: v => localStorage.setItem('ipv4Only', v ? '1' : '0'),
    setCreds: () => { setCookie('proxyUser', currentUser); setCookie('proxyPass', currentPass); }
  };

  // ===== Состояние =====
  let isRunning = false;
  let lastSeenIP = null;
  let autoNextTimer = null;
  let rotateCallCounter = 0;
  let railwayAvailable = false;
  let ipCheckHistory = [];
  let lastWorkingBase = null;

  // Анти-дубликаты
  let rotateInProgress = false;
  let rotateCooldownUntil = 0;
  let lastProxyChanged = false;

  // NEW: анти-дубль для TMR на целевой странице
  let tmrTriggered = false; // NEW

  // ===== UI helpers =====
  function setStatus(msg, type='info') {
    const el = document.getElementById('statusDiv');
    if (!el) return;
    const colors = { success: '#C8E6C9', error: '#ffcdd2', info: '#E8F5E9' };
    el.style.color = colors[type] || '#E8F5E9';
    el.textContent = msg;
  }
  function setCurrentProxyText(text) {
    const el = document.getElementById('currentProxy');
    if (el) el.textContent = text || '—';
  }
  function updateRailwayStatus() {
    const badge = document.getElementById('railwayStatus');
    if (badge) {
      badge.textContent = railwayAvailable ? 'ONLINE' : 'OFFLINE';
      badge.style.background = railwayAvailable ? '#4CAF50' : '#f44336';
    }
  }
  function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    const el = document.getElementById('logDiv');
    if (!el) return;
    const maxLines = 250;
    const lines = (el.textContent || '').split('\n').filter(Boolean);
    lines.push(line);
    if (lines.length > maxLines) lines.splice(0, lines.length - maxLines);
    el.textContent = lines.join('\n');
    el.parentElement.scrollTop = el.parentElement.scrollHeight;
  }

  // ===== URL helpers / pages =====
  function hasErrParam() { try { return new URLSearchParams(location.search).has('err'); } catch { return false; } }
  function isAutoTargetPage() {
    const path = location.pathname.toLowerCase();
    const isNew = /\/global\/appointment\/newappointment\/?$/i.test(location.pathname);
    const isPending = path.endsWith('/global/appointment/pendingappointment') || path.endsWith('/global/appointment/pendingappointment/');
    return isNew || (isPending && !hasErrParam());
  }
  function isPendingAppointmentPage() {
    const path = location.pathname.toLowerCase();
    return path.endsWith('/global/appointment/pendingappointment') || path.endsWith('/global/appointment/pendingappointment/');
  }
  function isMainPage() { return location.href.toLowerCase() === 'https://blsspainbelarus.by/'; }

  // ===== Minimal UI (баннер) =====
  const UI = (() => {
    function ensureBanner() {
      let el = document.getElementById('script-message');
      if (!el) {
        document.body.insertAdjacentHTML('afterbegin',
          `<div id="script-message" style="position:fixed;top:0;left:0;width:100%;background:#2b2b2b;color:#fff;text-align:center;padding:14px;font-size:16px;font-weight:700;z-index:999999;box-shadow:0 2px 8px rgba(0,0,0,.2)"></div>`);
        el = document.getElementById('script-message');
      }
      return el;
    }
    function showMessage(text, color = '#2b2b2b') { const el = ensureBanner(); el.textContent = text; el.style.backgroundColor = color; }
    function removeMessage() { const el = document.getElementById('script-message'); if (el) el.remove(); }
    return { showMessage, removeMessage };
  })();

  // ===== NewAppointment counter (LS) + Try Again click =====
  const NEW_APPT_KEY = 'newApptSeenCount';
  function getNewApptCount() {
    const v = parseInt(localStorage.getItem(NEW_APPT_KEY) || '0', 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }
  function setNewApptCount(n) { localStorage.setItem(NEW_APPT_KEY, String(Math.max(0, n|0))); }
  function incNewApptCount() { const n = getNewApptCount() + 1; setNewApptCount(n); return n; }

  /** Строгая проверка для обеих версий пути, без учёта регистра */
  function isNewAppointmentPageStrict() {
    return /\/global\/appointment\/newappointment\/?$/i.test(location.pathname);
  }

  /** Ждём кнопку Try Again (обе версии href / текст) и кликаем; true, если кликнули */
  async function clickTryAgainWithWait(timeoutMs = 5000, stepMs = 150) {
    const deadline = Date.now() + timeoutMs;
    const findBtn = () =>
      document.querySelector('a.btn.btn-primary[href="/Global/appointment/newappointment"]') ||
      document.querySelector('a.btn.btn-primary[href="/global/appointment/newappointment"]') ||
      Array.from(document.querySelectorAll('a.btn.btn-primary')).find(a => /try\s*again/i.test(a.textContent || ''));

    let btn = findBtn();
    while (!btn && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, stepMs));
      btn = findBtn();
    }
    if (btn) {
      UI.showMessage('🔁 Try Again…', '#6c8cd5');
      log('Try Again button found — clicking');
      setTimeout(() => btn.click(), 30); // даём баннеру отрисоваться
      return true;
    }
    log('Try Again button not found (timeout)');
    return false;
  }

  // NEW: универсальная проверка TMR на странице
  function isTooManyRequestsPage() { // NEW
    const txt = (document.body.innerText || '').toLowerCase();
    const h1  = document.querySelector('h1, .card h1');
    const h1ok = h1 && /too\s+many\s+requests/i.test(h1.textContent || '');
    const p   = document.querySelector('h1 + p, .card p');
    const pok = p && /(excessive requests|rate limit|429)/i.test(p.textContent || '');
    const wide = txt.includes('too many requests') || txt.includes('429');
    return !!(h1ok || pok || wide);
  }

  /**
   * Появление NewAppointment:
   * 1–4 раз — кликаем Try Again (с ожиданием до 1с);
   * ≥5 — ротация.
   * НОВОЕ: если на целевой странице TMR — немедленная ротация, счётчик помечаем как исчерпанный.
   */
  function handleNewAppointmentAppearance() { // NEW (переписано)
    if (!isNewAppointmentPageStrict()) return false;

    // Приоритет: если на целевой странице TMR — сразу ротация
    if (!tmrTriggered && isTooManyRequestsPage()) {
      tmrTriggered = true;
      setNewApptCount(999); // «исчерпали лимит»
      UI.showMessage('🚨 Too Many Requests — запускаю ротацию…', '#d35454');
      log('NewAppointment: TMR detected → forcing rotation now');
      runCycle('tmr-on-newappointment').catch(e => log('Rotation error: ' + e.message));
      return false; // не блокируем остальной init
    }

    const count = incNewApptCount();
    log(`NewAppointment seen #${count}`);

    if (count === 1 || count === 2 || count === 3 || count === 4) {
      (async () => {
        const clicked = await clickTryAgainWithWait(100, 150);
        if (!clicked) {
          UI.showMessage(`🔁 Перезаход №${count}…`, '#6c8cd5');
          const url = location.pathname + location.search + (location.search ? '&' : '?') + 'r=' + Date.now();
          location.replace(url);
        }
      })();
      return true; // инициировали навигацию — дальше init не нужен
    }

    if (count >= 5) {
      
      log('NewAppointment threshold → starting rotation and resetting counter');
      setNewApptCount(0);
      runCycle('newappointment-threshold').catch(e => log('Rotation error: ' + e.message));
      return false;
    }

    return false;
  }

  // ===== Creds UI =====
  async function showCredentialsPrompt() {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,.3); z-index: 2147483648; font: 14px Arial, sans-serif; min-width: 320px; text-align: center;`;
      modal.innerHTML = `
        <h3 style="margin:0 0 10px;">Введите логин и пароль для прокси</h3>
        <div style="margin: 10px 0;"><input id="proxyUserInput" placeholder="Логин" type="text" style="width: 100%; padding: 6px;"></div>
        <div style="margin: 10px 0;"><input id="proxyPassInput" placeholder="Пароль" type="password" style="width: 100%; padding: 6px;"></div>
        <button id="saveCredsBtn" style="padding: 8px 16px; background: #4CAF50; color: #fff; border: none; border-radius: 6px; cursor: pointer;">Сохранить</button>
        <div id="credError" style="color: red; margin-top: 10px;"></div>`;
      document.body.appendChild(modal);
      document.getElementById('saveCredsBtn').addEventListener('click', () => {
        const user = document.getElementById('proxyUserInput').value.trim();
        const pass = document.getElementById('proxyPassInput').value.trim();
        if (!user || !pass) { document.getElementById('credError').textContent = 'Логин и пароль не могут быть пустыми!'; return; }
        currentUser = user; currentPass = pass; ls.setCreds(); log(`Credentials saved: user=${currentUser}`); modal.remove(); resolve();
      });
    });
  }
  async function ensureCredentials() {
    if (!currentUser || !currentPass) {
      currentUser = getCookie('proxyUser') || '';
      currentPass = getCookie('proxyPass') || '';
      if (!currentUser || !currentPass) { log('Credentials missing — prompting user'); await showCredentialsPrompt(); }
      else { log(`Credentials loaded from cookie: user=${currentUser}`); }
    }
  }

  // ===== Blocklist =====
  const IPBlocklist = (() => {
    const KEY = 'proxyIpBlocklist';
    function load() { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } }
    function save(set) { try { localStorage.setItem(KEY, JSON.stringify(Array.from(set))); } catch {} }
    return {
      add(ip){ if (!ip) return; const s = load(); s.add(ip); save(s); },
      has(ip){ if (!ip) return false; return load().has(ip); },
      remove(ip){ const s = load(); s.delete(ip); save(s); },
      clear(){ save(new Set()); },
      all(){ return Array.from(load()); }
    };
  })();

  // ===== gmXhr =====
  function gmXhr({ method='GET', url, headers={}, timeout=API_TIMEOUT_MS, data, responseType='text' }) {
    const h = Object.assign({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Pragma': 'no-cache' }, headers || {});
    if (method === 'GET' && !/[?&]t=\d/.test(url)) url += (url.includes('?') ? '&' : '?') + 't=' + Date.now() + '&r=' + Math.random().toString(36).substr(2, 9);
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method, url, headers: h, data, timeout, responseType, anonymous: true,
        onload: r => { const ok = r.status >= 200 && r.status < 300; if (!ok) return reject(new Error(`HTTP ${r.status}: ${r.statusText || 'Unknown error'}`)); resolve(r); },
        onerror: e => reject(new Error(`Network error: ${e.error || 'Connection failed'}`)),
        ontimeout: () => reject(new Error(`Timeout after ${timeout}ms`)),
      });
    });
  }

  // ===== Railway connectivity =====
  async function testRailwayConnection() {
    log('🔍 Testing Railway API connectivity...');
    try {
      await ensureCredentials();
      const auth = 'Basic ' + btoa(`${currentUser}:${currentPass}`);
      const bases = [API_HTTPS, API_HTTP];
      for (const base of bases) {
        try {
          const url = `${base}/current`;
          await gmXhr({ method: 'GET', url, headers: { 'Authorization': auth }, timeout: 10000, responseType: 'text' });
          railwayAvailable = true; lastWorkingBase = base;
          log(`✅ Railway API доступен: ${base}`); updateRailwayStatus(); return true;
        } catch (e) {
          log(`❌ ${base} failed: ${e.message}`);
        }
      }
    } catch (e) { log(`❌ Test failed: ${e.message}`); }
    railwayAvailable = false; log('❌ Railway API недоступен'); updateRailwayStatus(); return false;
  }

  async function callAPI(path, { method='GET', timeout=API_TIMEOUT_MS, body=null, singleBaseForPost=false } = {}) {
    await ensureCredentials();
    const auth = 'Basic ' + btoa(`${currentUser}:${currentPass}`);

    const doFetch = async (base) => {
      const url = `${base}${path}`;
      const headers = { 'Authorization': auth };
      if (method !== 'GET') headers['Content-Type'] = 'text/plain;charset=UTF-8';
      const r = await gmXhr({ method, url, headers, timeout, responseType: 'text', data: body });
      let parsed; try { parsed = JSON.parse(r.responseText); } catch { parsed = { raw: r.responseText, status: r.status }; }
      return parsed;
    };

    if (method !== 'GET' && singleBaseForPost) {
      const base = lastWorkingBase || API_HTTP;
      return await doFetch(base);
    }

    const bases = lastWorkingBase ? [lastWorkingBase, API_HTTPS, API_HTTP] : [API_HTTPS, API_HTTP];
    let lastErr = null;
    for (const base of bases) {
      try {
        const res = await doFetch(base);
        lastWorkingBase = base;
        return res;
      } catch (e) {
        lastErr = e;
        log(`API ${method} ${path} via ${base} → ${e.message}`);
      }
    }
    log(`⚠️ All API attempts failed for ${path}`);
    throw lastErr || new Error('API unreachable');
  }

  // ===== IP helpers =====
  function extractIP(text) {
    if (!text) return null;
    try { const j = JSON.parse(text); if (j && typeof j.ip === 'string') return j.ip.trim(); } catch(_){}
    const ipv4 = text.match(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/);
    if (ipv4 && ipv4[0]) return ipv4[0];
    if (!ls.getIPv4Only()) {
      const ipv6 = text.match(/(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,6})|:(?::[0-9a-fA-F]{1,7})|::(?:ffff(?::0{1,4})?:)?(?:(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])/);
      if (ipv6 && ipv6[0]) return ipv6[0];
    }
    return null;
  }

  async function getIPViaRailway() {
    if (!railwayAvailable) return null;
    try {
      log('🔍 Getting IP via Railway /myip...');
      const data = await callAPI('/myip', { method: 'GET', timeout: 10000 });
      if (data && data.ip) { const ip = String(data.ip).trim(); log(`✅ Railway /myip: ${ip}`); return ip; }
    } catch (e) {
      log(`⚠️ Railway /myip failed: ${e.message}`);
      if (e.message.includes('Network error') || e.message.includes('Timeout')) { log('⚠️ Railway /myip недоступен, проверяем статус...'); await testRailwayConnection(); }
    }
    return null;
  }

  async function getPublicIP() {
    const timeout = IS_IOS_SAFARI ? IOS_IP_TIMEOUT_MS : 100;
    log(`🔍 Getting IP (iOS: ${IS_IOS_SAFARI}, IPv4-only: ${ls.getIPv4Only()}, timeout: ${timeout}ms)...`);
    const railwayIP = await getIPViaRailway();
    if (railwayIP) return railwayIP;

    const cacheBust = `?t=${Date.now()}&r=${Math.random().toString(36).substr(2, 9)}`;
    const v4sources = [
      `https://ipv4.icanhazip.com/${cacheBust}`,
      `https://v4.ident.me/${cacheBust}`,
      `https://v4.ifconfig.co/ip${cacheBust}`,
      `https://api-ipv4.ip.sb/ip${cacheBust}`,
      `https://api.ipify.org?format=json${cacheBust}`
    ];
    const mixedSources = [
      `https://api.ipify.org?format=json${cacheBust}`,
      `https://api64.ipify.org?format=json${cacheBust}`,
      `https://ifconfig.me/ip${cacheBust}`,
      `https://ident.me/${cacheBust}`,
      `https://checkip.amazonaws.com/${cacheBust}`,
      `https://ipinfo.io/ip${cacheBust}`
    ];

    const preferV4 = ls.getIPv4Only();
    const sources = preferV4 ? v4sources : [...v4sources, ...mixedSources];

    for (let i = 0; i < Math.min(3, sources.length); i++) {
      const url = sources[i];
      try {
        const txt = (await gmXhr({ method: 'GET', url, timeout: 10000, responseType: 'text' })).responseText.trim();
        const ip = extractIP(txt);
        if (ip && (!preferV4 || !ip.includes(':'))) { log(`✅ IP from ${url}: ${ip}`); return ip; }
      } catch (e) {
        if (!e.message.includes('407')) log(`⚠️ Failed ${url}: ${e.message}`);
      }
    }
    log('⚠️ Could not get public IP from any source');
    return null;
  }

  // ===== Ротация (фикс двойной ротации) =====
  async function rotateOnce() {
    const STABILIZE_AFTER_ROTATE_MS = 2000;
    const ROTATE_COOLDOWN_MS = 5000;
    lastProxyChanged = false;

    if (rotateInProgress) { log('⛔ rotateOnce already running'); return lastSeenIP || null; }

    const now = Date.now();
    if (now < rotateCooldownUntil) {
      const wait = rotateCooldownUntil - now;
      log(`⏳ rotate cooldown ${wait}ms`);
      await sleep(wait);
    }

    rotateInProgress = true;
    try {
      let beforeProxy = null;
      if (railwayAvailable) {
        try {
          const d = await callAPI('/current', { method: 'GET', timeout: 8000 });
          beforeProxy = d && d.currentProxy ? String(d.currentProxy) : null;
        } catch (e) { log(`warn: /current before rotate failed: ${e.message}`); }
      }

      let rotateSuccess = false;
      let rotateErrored = false;

      if (railwayAvailable) {
        try {
          await callAPI('/rotate', { method: 'POST', timeout: ROTATE_TIMEOUT_MS, body: null, singleBaseForPost: true });
          log('✔ /rotate успешно вызван (single-base)');
          rotateSuccess = true;
        } catch (e) {
          rotateErrored = true;
          log(`⚠️ /rotate failed (single-base): ${e.message}`);
        }
      } else {
        log('⚠️ Railway недоступен, пропускаем /rotate');
      }

      if (rotateSuccess) {
        rotateCooldownUntil = Date.now() + ROTATE_COOLDOWN_MS;
      }

      await sleep(STABILIZE_AFTER_ROTATE_MS);

      let afterProxy = beforeProxy;
      if (railwayAvailable) {
        try {
          const d2 = await callAPI('/current', { method: 'GET', timeout: 8000 });
          afterProxy = d2 && d2.currentProxy ? String(d2.currentProxy) : afterProxy;
        } catch (e) { log(`warn: /current after rotate failed: ${e.message}`); }
      }

      lastProxyChanged = !!(beforeProxy && afterProxy && beforeProxy !== afterProxy);
      if (lastProxyChanged) {
        log(`✅ Proxy changed (server): ${beforeProxy} → ${afterProxy}`);
        if (rotateErrored) rotateCooldownUntil = Date.now() + ROTATE_COOLDOWN_MS;
      } else {
        log(`ℹ️ Proxy unchanged (server or unavailable): before=${beforeProxy} after=${afterProxy}`);
      }

      const pollRetries = IS_IOS_SAFARI ? IOS_POLL_RETRIES : POLL_RETRIES;
      const pollDelay = IS_IOS_SAFARI ? IOS_POLL_DELAY_MS : POLL_DELAY_MS;

      let afterIP = null;
      for (let i = 0; i < pollRetries; i++) {
        await sleep(pollDelay);
        const ip = await getPublicIP();
        log(`   poll ${i+1}/${pollRetries}: IP=${ip || 'null'} (last: ${lastSeenIP || 'null'})`);
        if (!ip) continue;

        if (IS_IOS_SAFARI) {
          ipCheckHistory.push({ ip, timestamp: Date.now() });
          if (ipCheckHistory.length > 10) ipCheckHistory.shift();
          if (ip !== lastSeenIP) {
            if (i < pollRetries - 1) {
              await sleep(800);
              const confirmIP = await getPublicIP();
              if (confirmIP === ip) { afterIP = ip; break; }
              continue;
            }
            afterIP = ip; break;
          }
        } else {
          if (ip !== lastSeenIP) { afterIP = ip; break; }
        }
      }

      if (afterIP) lastSeenIP = afterIP;
      return afterIP || lastSeenIP || null;

    } finally {
      rotateInProgress = false;
    }
  }

  async function runCycle(trigger = 'auto') {
    if (isRunning) { log(`⛔ ${trigger}: cycle already running`); setStatus('⏳ Цикл уже выполняется...', 'info'); return; }
    isRunning = true;
    const btn = document.getElementById('rotateBtn');
    if (btn) { btn.disabled = true; btn.style.opacity = '.6'; }

    try {
      setStatus('🌐 Проверяю текущий IP...', 'info');
      const ipBefore = lastSeenIP || await getPublicIP();
      if (!ipBefore) { setStatus('❌ Не удалось получить IP', 'error'); log(`${trigger}: no IP obtained`); return; }
      lastSeenIP = ipBefore;

      rotateCallCounter += 1;
      const callId = rotateCallCounter;
      log(`>>> ${trigger}: ВЫЗОВ rotate #${callId} (before=${ipBefore})`);
      setStatus(`🔄 Ротация #${callId} (IP: ${ipBefore}, Railway: ${railwayAvailable ? 'OK' : 'OFFLINE'})...`, 'info');

      if (railwayAvailable) { refreshCurrent().catch(()=>{}); }

      let rounds = 0;
      let newIP = ipBefore;

      newIP = await rotateOnce();
      rounds++;

      while (
        rounds < MAX_ROTATE_ROUNDS &&
        (
          !newIP ||
          IPBlocklist.has(newIP) ||
          (newIP === ipBefore && !lastProxyChanged)
        )
      ) {
        const reason =
          !newIP ? 'no IP' :
          IPBlocklist.has(newIP) ? `IP ${newIP} blocked` :
          (lastProxyChanged ? 'proxy changed, waiting IP' : 'IP unchanged & proxy unchanged');

        if (lastProxyChanged) {
          UI.showMessage(`⏳ Proxy changed. Waiting for IP...`, '#6c8cd5');
          log(`${trigger}: Proxy changed on server; waiting for external IP...`);
          await sleep(3000);
          newIP = await getPublicIP();
        } else {
          UI.showMessage(`♻️ Retry ${rounds}/${MAX_ROTATE_ROUNDS}: ${reason}`, '#c77d2c');
          log(`${trigger}: Retry ${rounds}/${MAX_ROTATE_ROUNDS}: ${reason}`);
          newIP = await rotateOnce();
          rounds++;
        }
      }

      if (!newIP || newIP === ipBefore) {
        const msg = railwayAvailable ? 'IP не сменился' : 'Railway недоступен, IP может не измениться';
        setStatus(`⚠️ ${msg}`, 'error');
        log(`${trigger}: IP unchanged (before=${ipBefore}, after=${newIP})`);
        return;
      }

      lastSeenIP = newIP;
      const reload = (document.getElementById('reloadOnChange')?.checked ?? ls.getReload()) && isAutoTargetPage();
      setStatus(`✅ IP changed: ${ipBefore} → ${newIP}${reload ? '. Reloading...' : ''}`, 'success');
      log(`${trigger}: IP CHANGED ${ipBefore} → ${newIP}${reload ? ' [reload]' : ''}`);

      if (isPendingAppointmentPage()) {
        const bookButton =
          document.querySelector('a.btn.btn-primary[href="/Global/appointment/newappointment"]') ||
          document.querySelector('a.btn.btn-primary[href="/global/appointment/newappointment"]');
        if (bookButton) { log(`Clicking "Book New Appointment"`); setStatus(`✅ IP changed. Clicking "Book New Appointment"...`, 'success'); bookButton.click(); }
        else if (reload) setTimeout(() => location.reload(), 500);
      } else if (reload) {
        setTimeout(() => location.reload(), 500);


      }
    } catch (e) {
      setStatus(`❌ Error: ${e.message}`, 'error');
      log(`! ${trigger}: error — ${e.message}`);
    } finally {
      isRunning = false;
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }
  }

  // ===== Status & Auto =====
  async function refreshCurrent() {
    if (!railwayAvailable) { setCurrentProxyText('Railway недоступен'); return; }
    try {
      setStatus('🔍 Получаю текущий прокси...', 'info');
      const data = await callAPI('/current', { method: 'GET', timeout: 5000 });
      if (data && data.currentProxy) { setCurrentProxyText(`${data.currentProxy} (всего: ${data.totalProxies})`); setStatus('✅ Готово', 'success'); }
      else { setCurrentProxyText('N/A'); setStatus('⚠️ Нет данных о прокси', 'error'); }
    } catch (e) {
      setCurrentProxyText('—'); setStatus(`⚠️ Ошибка: ${e.message}`, 'error');
      if (e.message.includes('Network error') || e.message.includes('Timeout')) { await testRailwayConnection(); }
    }
  }

  function scheduleNextCycle() {
    if (!isAutoTargetPage()) return;
    if (autoNextTimer) { clearTimeout(autoNextTimer); autoNextTimer = null; }
    const enabled = document.getElementById('autoSwitch')?.checked ?? ls.getAutoEnabled();
    const sec = parseInt(document.getElementById('autoInterval')?.value || ls.getAutoInterval(), 10) || AUTO_INTERVAL_SEC_DEFAULT;
    if (!enabled) return;
    autoNextTimer = setTimeout(async () => { if (!document.hidden) await runCycle('auto'); scheduleNextCycle(); }, Math.max(10, sec) * 500);
  }

  function applyAutoSettings(fromUI=false) {
    if (!isAutoTargetPage()) return;
    const enabled = document.getElementById('autoSwitch')?.checked ?? ls.getAutoEnabled();
    const sec = Math.max(10, parseInt(document.getElementById('autoInterval')?.value || ls.getAutoInterval(), 10) || AUTO_INTERVAL_SEC_DEFAULT);
    const reload = document.getElementById('reloadOnChange')?.checked ?? ls.getReload();
    const ipv4Only = document.getElementById('ipv4Only')?.checked ?? ls.getIPv4Only();

    ls.setAutoEnabled(enabled); ls.setAutoInterval(sec); ls.setReload(reload); ls.setIPv4Only(ipv4Only);

    if (autoNextTimer) { clearTimeout(autoNextTimer); autoNextTimer = null; }

    if (enabled) { setStatus(`🤖 Auto enabled. Interval: ${sec}s`, 'info'); log(`AUTO: enabled (interval=${sec}s, ipv4Only=${ipv4Only})`); scheduleNextCycle(); if (fromUI) runCycle('auto-initial'); }
    else { setStatus('⏸️ Auto disabled', 'info'); log('AUTO: disabled'); }
  }

  // ===== UI panel =====
  function createPanel() {
    const p = document.createElement('div');
    p.id = 'proxy-panel';
    p.style.cssText = `position: fixed; top:10px; right:10px; background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); color:#fff; padding:12px; border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,.3); z-index:10000; font:12px/1.4 Arial,sans-serif; min-width:380px; border:2px solid rgba(255,255,255,.2);`;
    const autoBadge = hasErrParam() ? `<span style="margin-left:8px;padding:2px 6px;border-radius:6px;background:#ff7043;">AUTO OFF</span>` : '';
    const iosBadge = IS_IOS_SAFARI ? `<span style="margin-left:8px;padding:2px 6px;border-radius:6px;background:#4CAF50;">iOS</span>` : '';
    const railwayBadge = `<span id="railwayStatus" style="margin-left:8px;padding:2px 6px;border-radius:6px;background:${railwayAvailable ? '#4CAF50' : '#f44336'};">${railwayAvailable ? 'ONLINE' : 'OFFLINE'}</span>`;
    p.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <div style="font-weight:bold;">🚂 Railway Proxy ${iosBadge}${railwayBadge}${autoBadge}</div>
        <div style="opacity:.9;font-size:11px;">${RAILWAY_HOST}:${RAILWAY_PORT}</div>
      </div>
      <div style="margin-bottom:6px;">
  <strong>Пользователь:</strong> <span id="userLabel">${currentUser || 'Не задан'}</span>
</div>

<div style="margin-bottom:6px;">
  <strong>Пароль:</strong> <span id="passLabel">${currentPass || 'Не задан'}</span>
</div>
      <div style="margin-bottom:8px;"><strong>Текущий прокси:</strong><div id="currentProxy" style="font-size:11px;color:#ffeb3b;margin-top:3px;">—</div></div>
      <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
        <button id="rotateBtn" style="flex:1;padding:8px;background:#4CAF50;color:#fff;border:none;border-radius:6px;cursor:pointer;">🔄 Rotate</button>
        <button id="refreshBtn" style="flex:1;padding:8px;background:#2196F3;color:#fff;border:none;border-radius:6px;cursor:pointer;">🔍 Status</button>
        <button id="checkIpBtn" style="flex:1;padding:8px;background:#FF9800;color:#fff;border:none;border-radius:6px;cursor:pointer;">🌐 My IP</button>
        <button id="testApiBtn" style="flex:1;padding:8px;background:#9C27B0;color:#fff;border:none;border-radius:6px;cursor:pointer;">🔧 Test API</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
        <button id="blocklistBtn" style="flex:1;padding:8px;background:#607D8B;color:#fff;border:none;border-radius:6px;cursor:pointer;">🧱 Blocklist</button>
        <button id="clearBlocklistBtn" style="padding:8px;background:#b00020;color:#fff;border:none;border-radius:6px;cursor:pointer;">🗑 Clear</button>
        <button id="toggleBtn" style="margin-left:auto;padding:8px;background:#9C27B0;color:#fff;border:none;border-radius:6px;cursor:pointer;">➖ Hide</button>
      </div>
      <label style="display:flex;align-items:center;gap:6px;margin-top:4px;">
        <input id="reloadOnChange" type="checkbox" ${ls.getReload() ? 'checked' : ''}/>
        <span>♻️ Reload on IP change</span>
      </label>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <label style="display:flex;align-items:center;gap:6px;">
          <input id="autoSwitch" type="checkbox" ${hasErrParam() ? '' : (ls.getAutoEnabled() ? 'checked' : '')} ${hasErrParam() || !isAutoTargetPage() ? 'disabled' : ''}/>
          <span>🤖 Auto</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;">
          <span>Interval (sec):</span>
          <input id="autoInterval" type="number" min="10" step="5" style="width:80px;padding:2px;" value="${ls.getAutoInterval()}" ${hasErrParam() || !isAutoTargetPage() ? 'disabled' : ''}>
        </label>
        <button id="applyAuto" style="padding:6px 10px;background:#00bcd4;color:#fff;border:none;border-radius:6px;cursor:pointer;" ${hasErrParam() || !isAutoTargetPage() ? 'disabled' : ''}>Apply</button>
      </div>
      <label style="display:flex;align-items:center;gap:6px;margin-top:8px;">
        <input id="ipv4Only" type="checkbox" ${ls.getIPv4Only() ? 'checked' : ''}/>
        <span>⚙️ IPv4 only (iOS fix)</span>
      </label>
      <div id="statusDiv" style="margin-top:10px;font-size:11px;color:#E8F5E9;"></div>
      <div style="margin-top:8px; max-height:160px; overflow:auto; background:rgba(0,0,0,.15); padding:6px; border-radius:8px;">
        <div style="font-weight:bold;opacity:.9;margin-bottom:4px;">📜 Log</div>
        <div id="logDiv" style="font-family:monospace; font-size:11px; white-space:pre-wrap;"></div>
      </div>
      <div style="margin-top:6px;font-size:10px;opacity:.8;">IP Detection: Railway API → Public Services (HTTPS→HTTP fallback)</div>
    `;
    document.body.appendChild(p);

    if (hasErrParam() && isPendingAppointmentPage()) setStatus('⛔ Auto disabled: PendingAppointment with err param', 'error');
  }

  function showBlocklistModal() {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2147483647; display:flex; align-items:center; justify-content:center;`;
    const box = document.createElement('div');
    box.style.cssText = `background:#fff; color:#222; width: 520px; max-width: 92vw; max-height: 80vh; overflow:auto; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.35); padding:14px; font: 13px/1.4 Arial, sans-serif;`;
    const ips = IPBlocklist.all();
    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-weight:700;">🧱 IP Blocklist (${ips.length})</div>
        <button id="blClose" style="padding:6px 10px;border:none;border-radius:6px;background:#607D8B;color:#fff;cursor:pointer;">Close</button>
      </div>
      <div id="blBody">${ips.length ? '' : '<div style="opacity:.7;">Empty</div>'}</div>
    `;
    wrapper.appendChild(box);
    document.body.appendChild(wrapper);

    const body = box.querySelector('#blBody');
    if (ips.length) {
      const list = document.createElement('div'); list.style.marginTop = '6px';
      ips.forEach(ip => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px;border:1px solid #eee;border-radius:6px;margin-bottom:6px;';
        row.innerHTML = `<code style="font-family:monospace">${ip}</code><button data-ip="${ip}" style="padding:4px 8px;border:none;border-radius:6px;background:#b00020;color:#fff;cursor:pointer;">Remove</button>`;
        list.appendChild(row);
      });
      body.appendChild(list);
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-ip]'); if (!btn) return;
        const ip = btn.getAttribute('data-ip'); IPBlocklist.remove(ip);
        const row = btn.parentElement; row.style.transition = 'opacity .2s ease'; row.style.opacity = '0'; setTimeout(() => row.remove(), 220);
      });
    }
    box.querySelector('#blClose').addEventListener('click', () => wrapper.remove());
    wrapper.addEventListener('click', (e) => { if (e.target === wrapper) wrapper.remove(); });
  }

  // ===== Button wiring =====
  function wireUI() {
    document.getElementById('rotateBtn')?.addEventListener('click', () => runCycle('manual'));
    document.getElementById('refreshBtn')?.addEventListener('click', refreshCurrent);
    document.getElementById('checkIpBtn')?.addEventListener('click', async () => {
      setStatus('🔍 Checking IP...', 'info');
      const ip = await getPublicIP();
      setStatus(ip ? `🌐 Your IP: ${ip}` : '❌ Could not get IP', ip ? 'info' : 'error');
    });
    document.getElementById('testApiBtn')?.addEventListener('click', async () => {
      setStatus('🔧 Testing Railway API...', 'info');
      const wasAvailable = railwayAvailable;
      const result = await testRailwayConnection();
      setStatus(result ? '✅ Railway API доступен' : '❌ Railway API недоступен', result ? 'success' : 'error');
      if (result !== wasAvailable) log(`Railway status changed: ${wasAvailable} → ${result}`);
    });
    document.getElementById('toggleBtn')?.addEventListener('click', () => {
      const panel = document.getElementById('proxy-panel'); const btn = document.getElementById('toggleBtn');
      if (panel.style.height === '40px') { panel.style.height = 'auto'; panel.style.overflow = 'visible'; btn.textContent = '➖ Hide'; }
      else { panel.style.height = '40px'; panel.style.overflow = 'hidden'; btn.textContent = '➕ Show'; }
    });
    document.getElementById('blocklistBtn')?.addEventListener('click', showBlocklistModal);
    document.getElementById('clearBlocklistBtn')?.addEventListener('click', () => { IPBlocklist.clear(); setStatus('🗑 Blocklist cleared', 'info'); log('Blocklist cleared by user'); });

    if (isAutoTargetPage() && !hasErrParam()) {
      document.getElementById('applyAuto')?.addEventListener('click', () => applyAutoSettings(true));
      document.getElementById('autoSwitch')?.addEventListener('change', () => applyAutoSettings());
      document.getElementById('autoInterval')?.addEventListener('change', () => applyAutoSettings());
      document.getElementById('reloadOnChange')?.addEventListener('change', () => applyAutoSettings());
    } else {
      document.getElementById('reloadOnChange')?.addEventListener('change', () => { ls.setReload(document.getElementById('reloadOnChange').checked); });
    }
    document.getElementById('ipv4Only')?.addEventListener('change', () => {
      ls.setIPv4Only(document.getElementById('ipv4Only').checked);
      setStatus(`⚙️ IPv4 only: ${document.getElementById('ipv4Only').checked ? 'ON' : 'OFF'}`, 'info');
    });
  }

  // ===== Init =====
  async function boot() {
    log(`Boot: user=${currentUser}, iOS=${IS_IOS_SAFARI}, Railway=${RAILWAY_HOST}:${RAILWAY_PORT}`);
    await testRailwayConnection();

    // РАННИЙ ХУК: 1–4 → Try Again; ≥5 → ротация; NEW: TMR на целевой — немедленная ротация
    if (isNewAppointmentPageStrict()) {
      const handled = handleNewAppointmentAppearance();
      if (handled) return; // инициировали навигацию — остальное не запускаем
    }

    // TMR detector (вне целевой страницы)
    (function LoginTMR(){
      let triggered = false;
      async function checkAndHandle() {
        if (triggered) return;
        // NEW: не вмешиваемся в целевую страницу — там рулит handleNewAppointmentAppearance()
        if (isNewAppointmentPageStrict()) return;

        const h1 = document.querySelector('h1');
        const p  = document.querySelector('h1 + p');
        if (h1 && /Too\s+Many\s+Requests/i.test(h1.textContent || '') &&
            p  && /We have detected excessive requests/i.test(p.textContent || '')) {

          triggered = true; UI.showMessage('🔄 Too Many Requests — rotating proxy…', '#d35454'); log('TMR (non-target page) detected — rotating...');
          runCycle('tmr').finally(() => { setTimeout(() => { location.href = 'https://appointment.blsspainbelarus.by/Global/account/Login'; }, 500); });
        }
      }
      if (window.top === window.self) { checkAndHandle(); setInterval(checkAndHandle, 500); }
    })();

    // AccessDenied handler
    (function AccessDeniedHandler(){
      let triggered = false;
      function isAccessDeniedPage() {
        const bodyText = document.body.innerText.toLowerCase();
        const h1 = document.querySelector('.card h1, h1');
        const p  = document.querySelector('.card p, h1 + p');
        const ul = document.querySelector('.card ul');
        const h1ok = h1 && /access denied/i.test(h1.textContent || '');
        const pok  = p  && /not accessible from your current location|restricted|vpn|proxy/i.test(p.textContent || '');
        const ulok = ul && /vpn|proxy|permitted country/i.test(ul.textContent || '');
        const forbiddenOk = bodyText.includes('403 forbidden') || bodyText.includes('access denied');
        return !!(h1ok && (pok || ulok)) || forbiddenOk;
      }
      async function handle() {
        if (triggered) return; if (!isAccessDeniedPage()) return; triggered = true;
        try {
          UI.showMessage('⛔ Access Denied — blocking IP and rotating…', '#d32f2f'); log('Access Denied detected — blocking and rotating...');
          let currentProxy = null;
          if (railwayAvailable) {
            try { const data = await callAPI('/current'); currentProxy = data.fullProxy; if (currentProxy) log(`Current proxy: ${currentProxy}`); } catch (e) { log(`Error getting current proxy: ${e.message}`); }
            if (currentProxy) { try { await callAPI('/block', { method: 'POST', body: JSON.stringify({ proxyUrl: currentProxy }) }); log(`Proxy blocked on server: ${currentProxy}`); } catch (e) { log(`Error blocking proxy on server: ${e.message}`); } }
          }
          try { const ip = await getPublicIP(); if (ip) { IPBlocklist.add(ip); log(`IP blocked locally: ${ip}`); } else { log('Could not get IP for local blocklist'); } } catch (e) { log(`Error getting IP: ${e.message}`); }
          await runCycle('access-denied');
        } catch (e) { console.error(e); UI.showMessage(`❌ Error handling Access Denied: ${e.message || e}`, '#b02a37'); log(`Error handling Access Denied: ${e.message}`); }
      }
      if (window.top === window.self) { handle(); const iv = setInterval(() => { if (triggered) { clearInterval(iv); return; } handle(); }, 700); }
    })();

    // NEW: поллер TMR именно на целевой странице (поздняя подгрузка)
    if (isNewAppointmentPageStrict()) { // NEW
      const iv = setInterval(() => {
        if (tmrTriggered) { clearInterval(iv); return; }
        if (isTooManyRequestsPage()) {
          tmrTriggered = true;
          setNewApptCount(999);
          UI.showMessage('🚨 Too Many Requests — запускаю ротацию…', '#d35454');
          log('TMR late-detected on NewAppointment → rotating');
          runCycle('tmr-on-newappointment-late').catch(e => log('Rotation error: ' + e.message));
          clearInterval(iv);
        }
      }, 100);
    }

    if (isPendingAppointmentPage() || isAutoTargetPage()) {
      createPanel(); wireUI();
      setStatus(isAutoTargetPage() ? '🟢 Panel ready. Auto mode available.' : '🟡 Panel ready. Auto mode disabled (err param).', 'info');
      if (railwayAvailable) refreshCurrent().catch(()=>{});
      if (isAutoTargetPage()) { applyAutoSettings(); if (!hasErrParam()) setTimeout(() => runCycle('auto-initial'), 100); }
    } else if (isMainPage()) {
      if (!currentUser || !currentPass) {
        showCredentialsPrompt().then(() => { if (currentUser && currentPass) location.href = 'https://appointment.blsspainbelarus.by/Global/account/login'; });
      }
    } else {
      log('INIT: triggers active, panel not shown on this page');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
