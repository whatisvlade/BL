// ==UserScript==
// @name         Redirect on 403 Forbidden
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Заменяет текст 403 Forbidden и перенаправляет на главную страницу
// @match        https://belarus.blsspainglobal.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Проверяем, содержит ли страница текст "403 Forbidden"
    if (document.body.innerHTML.includes("403 Forbidden")) {
        document.body.innerHTML = document.body.innerHTML.replace("403 Forbidden", "НЕТ ДОСТУПА К СТРАНИЦЕ");

        // Перенаправляем на главную страницу через 1 секунду
        setTimeout(() => {
            window.location.href = 'https://belarus.blsspainglobal.com/Global/account/Login?returnUrl=%2FGlobal%2Fappointment%2Fnewappointment&err=HU7zqU0yCxX3GNnx4emgb8d%2FwA73yBclF%2B5Wi%2B0CSYM%3D'; // Перенаправление на главную
        }, 2000); // 1000 мс = 1 секунда
    }
})();
