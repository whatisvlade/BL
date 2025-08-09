// ==UserScript==
// @name         Too Many Requests + Network Check (Login Only)
// @namespace    http://tampermonkey.net/
// @version      2025-06-04
// @description  Обработка Too Many Requests и проверка соединения на странице входа с автообновлением при восстановлении связи. Работает независимо от регистра в URL (Global/account/Login и т.д.).
// @author       You
// @match        https://appointment.thespainvisa.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let isActive = false;
    let observer = null;

    const TEST_URLS = [
        'https://www.google.com/favicon.ico',
        'https://1.1.1.1/cdn-cgi/trace',
        'https://github.com/favicon.ico'
    ];
    const CHECK_INTERVAL = 10000;

    function isLoginPage() {
        return window.location.href.toLowerCase().includes("/global/account/login");
    }

    function handleTooManyRequests(heading) {
        isActive = true;
        startObserver();

        heading.innerHTML = `Your IP is blocked. Change it by tapping the airplane mode ✈️ button a couple of times.<br><small style="font-weight: normal;">Через 10 секунд будет перенаправление на страницу входа...</small>`;

        // Удаляем системный текст
        const paragraph = document.querySelectorAll("p");
        paragraph.forEach(p => {
            if (p.textContent.includes("We have detected excessive requests")) {
                p.remove();
            }
        });

        // Старт проверки соединения
        setTimeout(() => startInternetCheck(), 10000);
    }

    function waitForTooManyRequests() {
        const intervalId = setInterval(() => {
            const h1 = document.querySelector("h1");
            if (h1 && h1.textContent.trim() === "Too Many Requests") {
                clearInterval(intervalId);
                handleTooManyRequests(h1);
            }
        }, 500);

        // Фэйл-сейф: прекратить ожидание через 30 секунд
        setTimeout(() => clearInterval(intervalId), 30000);
    }

    function startInternetCheck() {
        showMessage('⏳ Checking connection...', 'orange');
        const intervalId = setInterval(async () => {
            for (const url of TEST_URLS) {
                try {
                    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                    if (res.ok) {
                        clearInterval(intervalId);
                        showMessage('✅ Internet connection restored. Redirecting to login...', 'green');
                        setTimeout(() => {
                            window.location.href = "https://appointment.thespainvisa.com/Global/account/Login";
                            stopObserver();
                            isActive = false;
                        }, 3000);
                        return;
                    }
                } catch (e) {}
            }
        }, CHECK_INTERVAL);
    }

    function removeUnwantedMessages() {
        if (isActive) {
            const messageElement = document.getElementById('script-message');
            if (messageElement) messageElement.remove();
        }
    }

    function startObserver() {
        if (!observer) {
            observer = new MutationObserver(() => {
                if (isActive) removeUnwantedMessages();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    function stopObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    function showMessage(text, color = 'green') {
        let el = document.getElementById('script-message');
        if (!el) {
            document.body.insertAdjacentHTML(
                'afterbegin',
                `<div id="script-message" style="position: fixed; top: 0; left: 0; width: 100%; background-color: ${color}; color: white; text-align: center; padding: 15px; font-size: 20px; font-weight: bold; z-index: 9999;">${text}</div>`
            );
        } else {
            el.textContent = text;
            el.style.backgroundColor = color;
        }
    }

    if (window.top === window.self) {
        waitForTooManyRequests();
    }
})();
