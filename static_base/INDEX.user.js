// ==UserScript==
// @name         INDEX
// @namespace    http://tampermonkey.net/
// @version      2025-03-12
// @description  try to take over the world!
// @author       You
// @match        https://appointment.thespainvisa.com/Global/home/index*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var targetUrl = 'https://appointment.thespainvisa.com/Global/Appointment/NewAppointment';

    function redirect() {
        if (window.location.href !== targetUrl) {
            window.location.href = targetUrl;
        }
        // После перехода больше ничего не делаем — чтобы не было лишних ошибок
    }

    if (typeof jQuery !== 'undefined') {
        $(document).ready(function() {
            setTimeout(redirect, 1000); // 500 мс задержка
        });
    } else {
        window.addEventListener('load', function() {
            setTimeout(redirect, 1000);
        });
    }
})();
