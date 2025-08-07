// ==UserScript==
// @name         Gateway Error Handler
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Обрабатывает страницы с 502 Bad Gateway и 504 Gateway Time-out, обновляет их через 1 секунду, но не работает в iframe
// @author       YourName
// @match        https://belarus.blsspainglobal.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Не выполнять скрипт внутри iframe
    if (window.top !== window.self) {
        return;
    }

    if (
        (document.title.includes("502 Bad Gateway") && document.body.innerHTML.includes("<h1>502 Bad Gateway</h1>")) ||
        (document.title.includes("504 Gateway Time-out") && document.body.innerHTML.includes("<h1>504 Gateway Time-out</h1>"))
    ) {
        document.body.innerHTML = '<center><h1>ПРОИЗОШЕЛ СБОЙ. СТРАНИЦА ОБНОВИТСЯ ЧЕРЕЗ СЕКУНДУ</h1></center>';
        setTimeout(() => {
            location.reload();
        }, 1000);
    }
})();
