// ==UserScript==
// @name         Captcha2
// @namespace    http://tampermonkey.net/
// @version      2025-09-05
// @description  try to take over the world!
// @author       You
// @match        https://appointment.thespainvisa.com/Global/Appointment/AppointmentCaptcha*
// @match        https://appointment.thespainvisa.com/Global/appointment/appointmentcaptcha*
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ==== Константы CapMonster ====
    const CAPMONSTER_API_KEY = 'c16654a22ee24ae016c6d371f625ff9c';
    const CREATE_TASK_URL   = 'https://api.capmonster.cloud/createTask';
    const GET_RESULT_URL    = 'https://api.capmonster.cloud/getTaskResult';
    const POLL_INTERVAL_MS  = 3000;
    const POLL_TIMEOUT_MS   = 60000;

    let submitClicked = false;
    let CURRENT_NUMBER;
    let capmonsterErrors = 0; // <--- счётчик подряд ошибок

    // Ждём исчезновения loading-mask, затем запускаем
    $(document).ready(() => {
        waitForLoadingMaskToDisappear(() => {
            console.log('🟢 Loading завершен.');
            findVisibleDivLikeDevAbilities();
            analyzeAndSelectCaptchaImages();
        });
    });

    // === Оригинальные функции для поиска и фильтрации элементов (оставлены как есть) ===
    function waitForLoadingMaskToDisappear(cb) {
        const iv = setInterval(() => {
            const mask = document.querySelector('.k-loading-mask');
            const cont = document.querySelector('.main-div-container');
            const pre = document.querySelector('.preloader')?.getAttribute('style');
            if (!mask && cont && pre) {
                clearInterval(iv);
                cb();
            }
        }, 500);
    }

    function findVisibleDivLikeDevAbilities() {
        document.querySelectorAll('div[class^="col-12 box-label"]').forEach(div => {
            const r = div.getBoundingClientRect();
            const mid = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (mid === div) {
                let txt = div.textContent.replace('Please select all boxes with number', 'Please wait for recognition.');
                const m = txt.match(/\d+/);
                if (m) {
                    CURRENT_NUMBER = m[0];
                    txt = txt.replace(m[0], `<span style="color:green;font-weight:bold;font-size:1.5em;">${m[0]}</span>`);
                }
                div.innerHTML = txt;
                console.log('🟢 TARGET NUMBER:', CURRENT_NUMBER);
            }
        });
    }

    function isElementVisible(el, doc = document) {
        if (!el) return false;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility !== 'visible' || +s.opacity < 0.1 || el.offsetWidth < 10 || el.offsetHeight < 10) return false;
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
        const pts = [
            { x: r.left + r.width / 2, y: r.top + r.height / 2 },
            { x: r.left + r.width / 4, y: r.top + r.height / 4 },
            { x: r.right - r.width / 4, y: r.top + r.height / 4 },
            { x: r.left + r.width / 4, y: r.bottom - r.height / 4 },
            { x: r.right - r.width / 4, y: r.bottom - r.height / 4 }
        ];
        return pts.filter(p => {
            const elp = doc.elementFromPoint(p.x, p.y);
            return elp === el || el.contains(elp) || elp.contains(el);
        }).length >= 3;
    }

    function findAllPotentialCaptchaImages(doc = document) {
        const out = [];
        doc.querySelectorAll('*').forEach(el => {
            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
            const s = getComputedStyle(el);
            let src = '';
            if (el.tagName === 'IMG' && el.src) src = el.src;
            else if (s.backgroundImage && s.backgroundImage !== 'none' && !s.backgroundImage.includes('gradient'))
                src = s.backgroundImage.slice(5, -2);
            if (src || el.className.match(/captcha-img|img-/) || s.cursor === 'pointer') {
                out.push({
                    element: el,
                    rect: el.getBoundingClientRect()
                });
            }
        });
        return out;
    }

    function findCaptchaContainer(doc = document) {
        const sels = ['.main-div-container', '#captcha-main-div', '[class*="captcha"]', '[class*="main-div"]', '.col-4', '[class*="grid"]', '[class*="puzzle"]'];
        for (let sel of sels) {
            const els = doc.querySelectorAll(sel);
            if (els.length) return els[0];
        }
        return doc.body;
    }

    function areElementsSimilar(a, b) {
        if (a.element === b.element) return true;
        const r1 = a.rect, r2 = b.rect;
        const overlap = !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
        if (overlap) {
            const w = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left);
            const h = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
            if (w * h > 0.5 * Math.min(r1.width * r1.height, r2.width * r2.height)) return true;
        }
        if (a.element.contains(b.element) || b.element.contains(a.element)) return true;
        return false;
    }

    function removeDuplicateElements(arr) {
        const uniq = [];
        arr.forEach(e => {
            if (!uniq.some(u => areElementsSimilar(u, e))) uniq.push(e);
        });
        return uniq;
    }

    function groupCaptchaImages(images) {
        const groups = {
            withAzure: images.filter(i => getComputedStyle(i.element).backgroundColor.match(/azure|rgb\(240,\s*255,\s*255\)/)),
            withClass: images.filter(i => i.element.className.match(/captcha-img|img-/)),
            withPointer: images.filter(i => getComputedStyle(i.element).cursor === 'pointer'),
            withBorder: images.filter(i => { const b = getComputedStyle(i.element).border; return b && b !== 'none' && !b.includes('0px'); }),
            large: images.filter(i => i.rect.width >= 100 && i.rect.height >= 100)
        };
        const pot = [];
        Object.values(groups).forEach(g => {
            if (g.length >= 7 && g.length <= 12) pot.push(g);
        });
        return { all: groups, potential: pot };
    }

    function filterAndRemoveUnnecessaryElements(visible, groups) {
        if (groups.potential.length) {
            let best = groups.potential[0];
            best = removeDuplicateElements(best);
            if (best.length > 9) best = best.slice(0, 9);
            const set = new Set(best.map(i => i.element));
            visible.forEach(item => {
                if (!set.has(item.element) && !groups.all.withClass.includes(item)) {
                    item.element.style.display = 'none';
                }
            });
            return best.map(i => i.element);
        }
        return visible.map(i => i.element);
    }

    function clickSubmitButton() {
        if (submitClicked) return;
        const btn = document.getElementById('btnVerify');
        if (btn) { btn.click(); submitClicked = true; }
    }

    // ==== CORS-safe загрузка изображений вместо canvas ====

    function extractImageUrlFromElement(el) {
        if (el.tagName === 'IMG' && el.src) return el.src;
        const bg = getComputedStyle(el).backgroundImage; // url("...") или none
        if (bg && bg !== 'none') {
            const m = bg.match(/url\((['"]?)(.+?)\1\)/i);
            if (m) return m[2];
        }
        throw new Error('No image URL for element');
    }

    function gmFetchArrayBuffer(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'arraybuffer',
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300 && res.response) {
                        resolve(res.response);
                    } else {
                        reject(new Error(`GM xhr failed ${res.status}`));
                    }
                },
                onerror: () => reject(new Error('GM xhr network error')),
            });
        });
    }

    function arrayBufferToBase64(buf) {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    async function elementToBase64CORS(el) {
        const url = extractImageUrlFromElement(el);
        const buf = await gmFetchArrayBuffer(url);
        return arrayBufferToBase64(buf);
    }

    // ==== CapMonster-интеграция (с расширенными логами) ====

    async function solveWithCapmonster(imagesBase64, targetNumber) {
        const create = await fetch(CREATE_TASK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientKey: CAPMONSTER_API_KEY,
                task: {
                    type: 'ComplexImageTask',
                    class: 'recognition',
                    imagesBase64,
                    metadata: { Task: 'bls_3x3', TaskArgument: String(targetNumber) }
                }
            })
        });
        const cr = await create.json();
        if (cr.errorId !== 0) {
            console.error('createTask failed:', cr);
            throw new Error('createTask error ' + cr.errorId + ' ' + (cr.errorCode||'') + ' ' + (cr.errorDescription||''));
        }
        const taskId = cr.taskId;
        const start = Date.now();
        while (Date.now() - start < POLL_TIMEOUT_MS) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            const res = await fetch(GET_RESULT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientKey: CAPMONSTER_API_KEY, taskId })
            });
            const jr = await res.json();
            if (jr.errorId !== 0) {
                console.error('getTaskResult failed:', jr);
                throw new Error('getTaskResult error ' + jr.errorId + ' ' + (jr.errorCode||'') + ' ' + (jr.errorDescription||''));
            }
            if (jr.status === 'ready') return jr.solution?.answer;
        }
        throw new Error('CapMonster timeout');
    }

    // === Основная функция (минимальные изменения) ===
    async function analyzeAndSelectCaptchaImages() {
        if (submitClicked) return;

        const container = findCaptchaContainer();
        const allImgs = findAllPotentialCaptchaImages(container);
        const visible = allImgs.filter(item => isElementVisible(item.element)).map(i => i.element);
        const uniq = removeDuplicateElements(visible.map(el => ({ element: el, rect: el.getBoundingClientRect() })));
        const grp = groupCaptchaImages(uniq);
        const elems = filterAndRemoveUnnecessaryElements(uniq, grp);

        if (!elems.length) {
            console.warn('⚠️ Нет элементов для OCR');
            return;
        }

        const slice = elems.slice(0, 9);

        // Требуем ровно 9 тайлов
        if (slice.length !== 9) {
            console.warn('⚠️ Ожидалось 9 тайлов, найдено:', slice.length, slice);
            return;
        }

        // CORS-safe base64
        let base64s;
        try {
            base64s = await Promise.all(slice.map(elementToBase64CORS));
        } catch (e) {
            console.error('tile fetch/base64 failed:', e);
            return;
        }

        let answers;
        try {
            answers = await solveWithCapmonster(base64s, CURRENT_NUMBER);
            capmonsterErrors = 0; // <--- Сбросить счётчик при успехе
        } catch (err) {
            capmonsterErrors++;
            console.error('CapMonster error:', err, 'Попытка:', capmonsterErrors);

            if (capmonsterErrors >= 3) {
                console.warn('❌ Две ошибки подряд от CapMonster — обновляем страницу!');
                location.reload();
            } else {
                setTimeout(analyzeAndSelectCaptchaImages, 2000);
            }
            return;
        }

        answers?.forEach((ok, i) => { if (ok && slice[i]) slice[i].click(); });
        clickSubmitButton();
    }

})();
