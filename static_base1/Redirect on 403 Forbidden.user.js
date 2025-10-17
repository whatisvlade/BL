// ==UserScript==
// @name         Redirect on 403 Forbidden
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Заменяет текст 403 Forbidden и перенаправляет на главную страницу
// @match        https://belarus.blsspainglobal.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TEST_URLS = [
        'https://www.google.com/favicon.ico',
        'https://1.1.1.1/cdn-cgi/trace',
        'https://github.com/favicon.ico'
    ];
    const CHECK_INTERVAL = 5000;
    const START_DELAY = 10000;
    const REDIRECT_DELAY = 3000;

    const LOGIN_URL = 'https://belarus.blsspainglobal.com/Global/account/Login?returnUrl=%2FGlobal%2Fappointment%2Fnewappointment&err=HU7zqU0yCxX3GNnx4emgb8d%2FwA73yBclF%2B5Wi%2B0CSYM%3D';

    function showMessage(text, color = 'green') {
        let el = document.getElementById('script-message');
        if (!el) {
            document.body.insertAdjacentHTML(
                'afterbegin',
                `<div id="script-message" style="position: fixed; top: 0; left: 0; width: 100%; background-color: ${color}; color: white; text-align: center; padding: 10px; font-size: 16px; z-index: 9999;">${text}</div>`
            );
        } else {
            el.textContent = text;
            el.style.backgroundColor = color;
        }
    }

    function hideMessage() {
        const el = document.getElementById('script-message');
        if (el) el.remove();
    }

    async function checkOnce() {
        for (const url of TEST_URLS) {
            try {
                const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                if (res.ok) return true;
            } catch (e) {}
        }
        return false;
    }

    function checkInternetAndRedirect() {
        showMessage('⏳ Проверка соединения', 'orange');

        setTimeout(() => {
            showMessage('⏳ Идет проверка интернета', 'orange');

            const intervalId = setInterval(async () => {
                const ok = await checkOnce();
                if (ok) {
                    showMessage('✅ Интернет есть. Перенаправляем...', 'green');
                    setTimeout(() => {
                        window.location.href = LOGIN_URL;
                        hideMessage();
                    }, REDIRECT_DELAY);
                    clearInterval(intervalId);
                }
            }, CHECK_INTERVAL);
        }, START_DELAY);
    }

    const is403 =
        document.body &&
        typeof document.body.innerHTML === 'string' &&
        document.body.innerHTML.includes('403 Forbidden');

    if (is403) {
        // Меняем текст на странице
        document.body.innerHTML = document.body.innerHTML.replace(
            '403 Forbidden',
            '❌ НЕТ ДОСТУПА – СМЕНИТЕ IP'
        );

        showMessage('403: Нет доступа. Смените IP. Ожидаем интернет...', 'orange');

        checkInternetAndRedirect();
    }
})();
