// ==UserScript==
// @name         Redirect on 403 Forbidden
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Заменяет текст 403 Forbidden и перенаправляет на главную страницу
// @match        https://appointment.thespainvisa.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Проверяем, содержит ли страница текст "403 Forbidden"
    if (document.body.innerHTML.includes("403 Forbidden")) {
        document.body.innerHTML = document.body.innerHTML.replace("403 Forbidden", "NO ACCESS TO THE PAGE. THE IP ADDRESS MAY NOT MATCH THE REQUIRED LOCATION");

        // Перенаправляем на главную страницу через 1 секунду
        setTimeout(() => {
            window.location.href = 'https://appointment.thespainvisa.com/Global/account/Login'; // Перенаправление на главную
        }, 5000); // 1000 мс = 1 секунда
    }
})();
