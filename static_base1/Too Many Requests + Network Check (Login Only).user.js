// ==UserScript==
// @name         Too Many Requests + Network Check (Login Only)
// @namespace    http://tampermonkey.net/
// @version      2025-06-04
// @description  Обработка Too Many Requests и проверка соединения на странице входа с автообновлением при восстановлении связи. Работает независимо от регистра в URL (Global/account/Login и т.д.).
// @author       You
// @match        https://belarus.blsspainglobal.com/*
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
        const currentUrl = window.location.href.toLowerCase();
        return currentUrl.includes("/global/account/login");
    }

    function replaceText() {
        const heading = document.querySelector("h1");

        if (heading && heading.textContent === "Too Many Requests") {
            isActive = true;
            startObserver();

            if (isLoginPage()) {
                heading.textContent = "Ваш айпи адрес в блоке, смените его через пару кликов по кнопке авиа режим и обновите страницу, надо пробовать заново";
                setTimeout(() => startInternetCheck(), 5000);
            } else {
                heading.textContent = "Вы будете перенаправлены на страницу входа через 5 секунд (ИЗ-ЗА БЛОКА АЙПИ)";
                setTimeout(() => {
                    window.location.href = "https://belarus.blsspainglobal.com/Global/account/Login?returnUrl=%2FGlobal%2Fappointment%2Fnewappointment&err=K7LYPi%2FpJtiLxj0JgYMBPVTdQ5hDdq9IVd7ALDT6sMo%3D";
                    stopObserver();
                    isActive = false;
                }, 10000);
            }
        }
    }

    function removeExcessiveRequestsText() {
        const paragraph = document.querySelector("p");
        if (paragraph && paragraph.textContent.includes("We have detected excessive requests from your IP address")) {
            paragraph.remove();
        }
    }

    function removeUnwantedMessages() {
        if (isActive) {
            const messageElement = document.getElementById('script-message');
            if (messageElement) {
                console.log("Удаляем сообщение, созданное другим скриптом...");
                messageElement.remove();
            }
        }
    }

    function startObserver() {
        if (!observer) {
            observer = new MutationObserver(() => {
                if (isActive) {
                    removeUnwantedMessages();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            console.log("Наблюдатель запущен.");
        }
    }

    function stopObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
            console.log("Наблюдатель остановлен.");
        }
    }

    function showMessage(text, color = 'green') {
        let messageElement = document.getElementById('script-message');
        if (!messageElement) {
            document.body.insertAdjacentHTML(
                'afterbegin',
                `<div id="script-message" style="position: fixed; top: 0; left: 0; width: 100%; background-color: ${color}; color: white; text-align: center; padding: 15px; font-size: 20px; font-weight: bold; z-index: 9999;">${text}</div>`
            );
        } else {
            messageElement.textContent = text;
        }
    }

    function startInternetCheck() {
        showMessage('⏳ Проверка соединения...', 'orange');
        const intervalId = setInterval(async () => {
            for (const url of TEST_URLS) {
                try {
                    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                    if (res.ok) {
                        showMessage('✅ Интернет восстановлен. Обновляем страницу...', 'green');
                        clearInterval(intervalId);
                        setTimeout(() => location.reload(), 3000);
                        return;
                    }
                } catch (e) {}
            }
        }, CHECK_INTERVAL);
    }

    replaceText();
    removeExcessiveRequestsText();
})();
