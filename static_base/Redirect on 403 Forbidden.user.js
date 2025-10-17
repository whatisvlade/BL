// ==UserScript==
// @name         Redirect on 403 Forbidden
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Заменяет текст 403 Forbidden и перенаправляет на главную страницу
// @match        https://appointment.blsspainbelarus.by/*
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

    const LOGIN_URL = 'https://appointment.blsspainbelarus.by/Global/account/Login?returnUrl=%2FGlobal%2Fappointment%2Fnewappointment&err=HU7zqU0yCxX3GNnx4emgb8d%2FwA73yBclF%2B5Wi%2B0CSYM%3D';

    function showMessage(id, text, color = 'green', offset = 0) {
        let el = document.getElementById(id);
        if (!el) {
            document.body.insertAdjacentHTML(
                'afterbegin',
                `<div id="${id}" style="
                    position: fixed;
                    top: ${offset}px;
                    left: 0;
                    width: 100%;
                    background-color: ${color};
                    color: white;
                    text-align: center;
                    padding: 10px;
                    font-size: 16px;
                    z-index: 9999;
                ">${text}</div>`
            );
        } else {
            el.textContent = text;
            el.style.backgroundColor = color;
            el.style.top = offset + 'px';
        }
    }

    function hideMessage(id) {
        const el = document.getElementById(id);
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
        showMessage('script-message-check', '⏳ Проверка соединения', 'orange', 50);

        setTimeout(() => {
            showMessage('script-message-check', '⏳ Идет проверка интернета', 'orange', 50);

            const intervalId = setInterval(async () => {
                const ok = await checkOnce();
                if (ok) {
                    showMessage('script-message-check', '✅ Интернет есть. Перенаправляем...', 'green', 50);
                    setTimeout(() => {
                        window.location.href = LOGIN_URL;
                        hideMessage('script-message-check');
                        hideMessage('script-message-main');
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

        // Основное сообщение сверху
        showMessage('script-message-main', '403: Нет доступа. Смените IP. Ожидаем интернет...', 'orange', 0);

        // Проверка интернета (чуть ниже)
        checkInternetAndRedirect();
    }
})();
