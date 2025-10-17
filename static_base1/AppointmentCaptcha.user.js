// ==UserScript==
// @name         AppointmentCaptcha
// @namespace    http://tampermonkey.net/
// @version      2025-02-08
// @description  try to take over the world!
// @author       You
// @match        https://appointment.blsspainrussia.ru/Global/Appointment/AppointmentCaptcha*
// @match        https://appointment.blsspainrussia.ru/Global/appointment/appointmentcaptcha*
// @match        https://appointment.blsspainrussia.ru/Global/newcaptcha/logincaptcha*
// @match        https://appointment.blsspainrussia.ru/Global/NewCaptcha/LoginCaptcha*
// @match        https://belarus.blsspainglobal.com/Global/Appointment/AppointmentCaptcha*
// @match        https://belarus.blsspainglobal.com/Global/appointment/appointmentcaptcha*
// @match        https://belarus.blsspainglobal.com/Global/newcaptcha/logincaptcha*
// @match        https://belarus.blsspainglobal.com/Global/NewCaptcha/LoginCaptcha*
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