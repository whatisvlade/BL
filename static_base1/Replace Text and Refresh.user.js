// ==UserScript==
// @name         Replace Text and Refresh
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Заменяет текст и обновляет страницу
// @match        https://belarus.blsspainglobal.com/*
// @grant        none
// ==/UserScript==


(function() {
    'use strict';

    const targetText = "Backend service does not exist";
    const replacementText = "ОШИБКА ПОДКЛЮЧЕНИЯ К СЕРВЕРУ";

    if (document.body.innerText.includes(targetText)) {
        // Заменяем текст
        document.body.innerHTML = document.body.innerHTML.replace(targetText, `<div style="font-size: 24px; text-align: center; margin-top: 20%;">${replacementText}</div>`);

        // Обновляем страницу через 1 секунду
        setTimeout(() => {
            location.reload();
        }, 2000);
    }
})();