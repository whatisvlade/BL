// ==UserScript==
// @name         INDEX
// @namespace    http://tampermonkey.net/
// @version      2025-03-12
// @description  try to take over the world!
// @author       You
// @match        https://belarus.blsspainglobal.com/Global/home/index*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Проверяем, загружен ли jQuery
    if (typeof jQuery !== 'undefined') {
        $(document).ready(function() {
            setTimeout(function() {
                window.location.href = 'https://belarus.blsspainglobal.com/Global/Appointment/NewAppointment'; // Переход по прямой ссылке
            }, 100); // Задержка 10 мс для выполнения перехода
        });
    } else {
        // Если jQuery не доступен, используем чистый JavaScript
        window.addEventListener('load', function() {
            setTimeout(function() {
                window.location.href = 'https://belarus.blsspainglobal.com/Global/Appointment/NewAppointment'; // Переход по прямой ссылке
            }, 100); // Задержка 10 мс для выполнения перехода
        });
    }
})();