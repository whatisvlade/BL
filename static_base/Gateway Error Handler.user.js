// ==UserScript==
// @name         Gateway Error Handler
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Автообновление страниц при ошибках 5xx (502, 503, 504 и др.), кроме iframe
// @author       YourName
// @match        https://appointment.blsspainbelarus.by/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Не выполнять скрипт внутри iframe
    if (window.top !== window.self) {
        return;
    }

    // Список ошибок, которые хотим отлавливать
    const errors = [
        { code: "500 Internal Server Error", pattern: "<h1>500 Internal Server Error</h1>" },
        { code: "502 Bad Gateway", pattern: "<h1>502 Bad Gateway</h1>" },
        { code: "503 Service Unavailable", pattern: "<h1>503 Service Unavailable</h1>" },
        { code: "504 Gateway Time-out", pattern: "<h1>504 Gateway Time-out</h1>" }
    ];

    // Проверяем наличие любой из ошибок
    const isError = errors.some(err =>
        document.title.includes(err.code) && document.body.innerHTML.includes(err.pattern)
    );

    if (isError) {
        document.body.innerHTML = '<center><h1>ПРОИЗОШЕЛ СБОЙ. СТРАНИЦА ОБНОВИТСЯ ЧЕРЕЗ СЕКУНДУ</h1></center>';
        setTimeout(() => location.reload(), 1000);
    }
})();
