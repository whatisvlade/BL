// ==UserScript==
// @name         Replace alert in iframe with console.log
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Заменяет alert на console.log внутри iframe (если тот же домен)
// @match        https://belarus.blsspainglobal.com/Global/Account/*
// @match        https://belarus.blsspainglobal.com/Global/account/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function replaceAlertInIframe(iframe) {
        try {
            const iframeWindow = iframe.contentWindow;
            if (!iframeWindow) {
                console.log('[Tampermonkey] Нет доступа к contentWindow');
                return;
            }
            // Пробуем заменить alert
            const origAlert = iframeWindow.alert;
            iframeWindow.alert = function (msg) {
                if (msg === "Invalid selection") {
                    console.log("[Tampermonkey] Invalid selection");
                } else {
                    origAlert.call(this, msg);
                }
            };
            console.log('[Tampermonkey] alert заменён в iframe');
        } catch (e) {
            console.log('[Tampermonkey] Ошибка доступа к iframe:', e);
        }
    }

    function waitForIframeAndReplace() {
        const iframe = document.querySelector('iframe.k-content-frame[title="Verify Registration"]');
        if (iframe) {
            iframe.addEventListener('load', function () {
                console.log('[Tampermonkey] iframe загрузился');
                replaceAlertInIframe(iframe);
            });
            // На случай, если уже загружено
            if (iframe.contentWindow && iframe.contentDocument.readyState === "complete") {
                console.log('[Tampermonkey] iframe уже загружен');
                replaceAlertInIframe(iframe);
            }
        } else {
            console.log('[Tampermonkey] Нет iframe, повтор через 500мс');
            setTimeout(waitForIframeAndReplace, 10);
        }
    }

    waitForIframeAndReplace();
})();

