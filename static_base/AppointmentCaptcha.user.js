// ==UserScript==
// @name         AppointmentCaptcha
// @namespace    http://tampermonkey.net/
// @version      2025-02-08
// @description  try to take over the world!
// @author       You
// @match        https://appointment.thespainvisa.com/Global/appointment/appointmentcaptcha*
// @match        https://appointment.thespainvisa.com/Global/Appointment/AppointmentCaptcha*
// @grant        none
// ==/UserScript==


(function() {
    'use strict';

    // Функция для прокрутки страницы
    function scrollToPosition(targetScrollY) {
        const currentScrollY = window.scrollY || document.documentElement.scrollTop;
        if (currentScrollY < targetScrollY) {
            window.scrollTo(0, targetScrollY);
        }
    }

    // Ждём полной загрузки страницы и выполняем прокрутку
    const waitForPageLoad = setInterval(() => {
        if (document.readyState === 'complete') {
            clearInterval(waitForPageLoad); // Останавливаем проверку
            scrollToPosition(255); // Прокручиваем страницу вниз на 295 пикселей
        }
    }, 10); // Проверяем каждые 100 мс
})();
