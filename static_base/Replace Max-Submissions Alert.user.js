// ==UserScript==
// @name         Replace Max-Submissions Alert
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Заменяет англ. алерт о максимуме подпорок капчи на русск., перезагружает страницу
// @match        https://appointment.thespainvisa.com/Global/NewCaptcha/LoginCaptcha*
// @match        https://appointment.thespainvisa.com/Global/newcaptcha/logincaptcha*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const RUSSIAN_TEXT = '<strong>An error occurred during recognition. Reloading the page. ' +
                         'If it doesn\'t refresh — click the "Home" button.</strong>';

    function checkAndReplace() {
        document.querySelectorAll('div.alert.alert-danger[role="alert"]')
            .forEach(el => {
                if (el.textContent.includes(
                    'You have reached the maximum number of allowed captcha submissions. Please try again later.'
                )) {
                    // Заменяем текст
                    el.innerHTML = RUSSIAN_TEXT;
                    // Перезагружаем страницу
                    setTimeout(() => location.reload(), 1000);
                }
            });
    }

    // Первичная проверка
    checkAndReplace();

    // Наблюдаем за динамическими изменениями DOM
    new MutationObserver(checkAndReplace)
        .observe(document.body, { childList: true, subtree: true });

})();
