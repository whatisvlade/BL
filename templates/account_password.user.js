// ==UserScript==
// @name         account_password
// @namespace    http://tampermonkey.net/
// @version      2025-06-22
// @description  Автоматизация: ввод пароля, выделение текущей капчи, кнопка для ручного поиска.
// @author       You
// @match        https://appointment.blsspainbelarus.by/Global/newcaptcha/logincaptcha*
// @match        https://appointment.blsspainbelarus.by/Global/NewCaptcha/LoginCaptcha*
// @exclude      https://appointment.blsspainbelarus.by/Global/NewCaptcha/LoginCaptchaSubmit*
// @exclude      https://appointment.blsspainbelarus.by/Global/NewCaptcha/logincaptchasubmit*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('🟢 bls-spain-2.0-capmonster-with-password loaded');

    // ==== Константы CapMonster ====
    const CAPMONSTER_API_KEY = 'c16654a22ee24ae016c6d371f625ff9c';
    const CREATE_TASK_URL   = 'https://api.capmonster.cloud/createTask';
    const GET_RESULT_URL    = 'https://api.capmonster.cloud/getTaskResult';
    const POLL_INTERVAL_MS  = 1000;
    const POLL_TIMEOUT_MS   = 60000;
    let submitClicked = false;
    let CURRENT_NUMBER = null;
    let capmonsterErrors = 0; // <-- Счетчик ошибок подряд

    // ==== Константы для пароля ====
    const PASSWORD = '{{ PASSWORD }}';

    start();

    // Стартовая функция для запуска обработки страницы
    function start() {
        console.log('🟢 Auto-start');
        if (document.querySelectorAll('.box-label').length) {
            runCaptcha();
            insertPasswordWithRetry(); // Вставка пароля
        } else {
            window.location.reload();
        }
    }

    // === Логика для работы с CapMonster ===

    function runCaptcha() {
        const label = findVisibleBoxLabel();
        if (!label) {
            console.warn('⚠️ box-label не найден');
            return;
        }
        highlightBoxLabel(label);
        setTimeout(analyzeAndSelectCaptchaImages, 600);
    }

    function findVisibleBoxLabel() {
        for (const div of document.querySelectorAll('.box-label')) {
            const r = div.getBoundingClientRect();
            const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
            if (el === div || div.contains(el)) return div;
        }
        return null;
    }

    function highlightBoxLabel(div) {
        let text = div.textContent.replace('Please select all boxes with number', 'Выберите картинки с числом');
        const m = text.match(/\d+/);
        if (m) {
            CURRENT_NUMBER = m[0];
            text = text.replace(CURRENT_NUMBER,
                `<span style="color:green;font-weight:bold;font-size:1.5em;">${CURRENT_NUMBER}</span>`);
        }
        div.innerHTML = text;
        div.style.transition = 'background 0.5s';
        div.style.background = '#ffe0b2';
        setTimeout(() => div.style.background = '', 50);
        console.log('🟢 TARGET NUMBER:', CURRENT_NUMBER);
    }

    async function analyzeAndSelectCaptchaImages() {
        if (submitClicked) return;

        const container = findCaptchaContainer(document);
        const allImgs = findAllPotentialCaptchaImages(container);
        const visibleElems = allImgs
            .filter(item => isElementVisible(item.element) && isTopMost(item.element))
            .map(item => item.element);

        if (visibleElems.length === 0) {
            console.warn('⚠️ Нет видимых картинок');
            return;
        }

        // 1) Сбор base64 всех видимых картинок
        const imagesBase64 = await Promise.all(visibleElems.map(el => imageToBase64(el)));

        // 2) Отправка в CapMonster и ожидание ответа
        let answers;
        try {
            answers = await solveWithCapmonster(imagesBase64, CURRENT_NUMBER);
            capmonsterErrors = 0; // сбрасываем при успехе
        } catch (err) {
            capmonsterErrors++;
            console.error('CapMonster error:', err, 'Попытка:', capmonsterErrors);

            if (capmonsterErrors >= 2) {
                console.warn('❌ Две ошибки подряд от CapMonster — обновляем страницу!');
                location.reload();
                return;
            } else {
                setTimeout(analyzeAndSelectCaptchaImages, 5000); // Повтор через 5 секунд
                return;
            }
        }

        // 3) Кликаем по тем, где true
        answers.forEach((shouldClick, idx) => {
            if (shouldClick && visibleElems[idx]) {
                visibleElems[idx].click();
                console.log(`✅ clicked image ${idx + 1}`);
            }
        });

        // 4) Финальный submit
        clickSubmitButton(document);
    }

    // Конвертирует <img> в base64 (без префикса data:image/..)
    function imageToBase64(imgEl) {
        return new Promise(resolve => {
            const canvas = document.createElement('canvas');
            canvas.width = imgEl.naturalWidth;
            canvas.height = imgEl.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgEl, 0, 0);
            const data = canvas.toDataURL().split(',')[1];
            resolve(data);
        });
    }

    // Создает задачу и ждёт результата
    async function solveWithCapmonster(imagesBase64, targetNumber) {
        // Создать задачу
        const createResp = await fetch(CREATE_TASK_URL, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                clientKey: CAPMONSTER_API_KEY,
                task: {
                    type: 'ComplexImageTask',
                    class: 'recognition',
                    imagesBase64,
                    metadata: {
                        Task: 'bls_3x3',
                        TaskArgument: targetNumber
                    }
                }
            })
        });
        const createJson = await createResp.json();
        if (createJson.errorId !== 0) {
            throw new Error(`createTask errorId=${createJson.errorId}`);
        }
        const taskId = createJson.taskId;

        // Пуллинг результата
        const start = Date.now();
        while (Date.now() - start < POLL_TIMEOUT_MS) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            const resultResp = await fetch(GET_RESULT_URL, {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ clientKey: CAPMONSTER_API_KEY, taskId })
            });
            const resultJson = await resultResp.json();
            if (resultJson.errorId !== 0) {
                throw new Error(`getTaskResult errorId=${resultJson.errorId}`);
            }
            if (resultJson.status === 'ready') {
                return resultJson.solution.answer;
            }
            // иначе статус "processing" — ждём дальше
        }
        throw new Error('CapMonster timeout');
    }

    function clickSubmitButton(doc) {
        if (submitClicked) return;
        const btn = doc.getElementById('btnVerify');
        if (btn) {
            console.log('🟢 clicking Submit');
            btn.click();
            submitClicked = true;
        }
    }

    function findCaptchaContainer(doc) {
        for (const sel of ['.main-div-container','#captcha-main-div','.captcha-grid']) {
            const el = doc.querySelector(sel);
            if (el) return el;
        }
        return doc.body;
    }

    function findAllPotentialCaptchaImages(container) {
        const out = [];
        container.querySelectorAll('img, [style*="background-image"]').forEach(el => {
            const bg = getComputedStyle(el).backgroundImage;
            const src = el.src || bg.replace(/^url\("?|"?\)$/g,'');
            if (src) out.push({ element: el, src });
        });
        return out;
    }

    function isElementVisible(el) {
        const s = getComputedStyle(el);
        if (s.display==='none' || s.visibility!=='visible') return false;
        const r = el.getBoundingClientRect();
        return r.width>10 && r.height>10 && r.top<innerHeight && r.left<innerWidth;
    }

    function isTopMost(el) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width/2, y = r.top + r.height/2;
        const top = document.elementFromPoint(x, y);
        return top===el || el.contains(top);
    }

    // === Логика для ввода пароля ===

    function tryInsertPassword() {
        // Найти первое видимое password-поле
        var $field = $('input[type="password"]:visible, input.entry-disabled[type="password"]:visible').first();
        if ($field.length) {
            $field.removeAttr('readonly');
            $field.val(PASSWORD).trigger('input').trigger('change');
            let setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            setter.call($field[0], PASSWORD);
            let ev2 = new Event('input', { bubbles: true });
            $field[0].dispatchEvent(ev2);
            console.log('Пароль вставлен:', $field.attr('id') || $field[0]);
            return true;
        }
        return false;
    }

    function insertPasswordWithRetry() {
        let elapsed = 0;
        let interval = setInterval(() => {
            if (tryInsertPassword() || elapsed > 10000) {
                clearInterval(interval);
            }
            elapsed += 300;
        }, 300);
    }

    // Запуск вставки пароля при загрузке и динамическом обновлении формы
    $(document).ready(insertPasswordWithRetry);
    setTimeout(insertPasswordWithRetry, 8000);

})();
