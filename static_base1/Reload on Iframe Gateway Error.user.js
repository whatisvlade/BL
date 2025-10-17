// ==UserScript==
// @name         Reload on Iframe Gateway Error
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Обновляет всю страницу, если в iframe обнаружена ошибка 502 или 504
// @author       YourName
// @match        https://belarus.blsspainglobal.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    setInterval(() => {
        const iframe = document.querySelector('iframe');
        if (!iframe) return;

        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const title = iframeDoc.title;
            const bodyText = iframeDoc.body.innerText;

            if (
                title.includes("502 Bad Gateway") || title.includes("504 Gateway Time-out") ||
                bodyText.includes("502 Bad Gateway") || bodyText.includes("504 Gateway Time-out")
            ) {
                console.log("Обнаружен сбой в iframe — обновляем всю страницу");
                location.reload();
            }
        } catch (e) {
            // Если iframe с другого домена, доступ будет запрещён
            console.warn("Невозможно получить доступ к iframe:", e);
        }
    }, 3000); // Проверка каждые 3 секунды
})();
