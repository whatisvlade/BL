// ==UserScript==
// @name         Replace Max-Submissions Alert
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Заменяет англ. алерт о максимуме подпорок капчи на русск., перезагружает страницу
// @match        https://appointment.blsspainrussia.ru/Global/NewCaptcha/LoginCaptcha*
// @match        https://belarus.blsspainglobal.com/Global/NewCaptcha/LoginCaptcha*
// @match        https://belarus.blsspainglobal.com/Global/newcaptcha/logincaptcha*
// @match        https://appointment.blsspainrussia.ru/Global/newcaptcha/logincaptcha*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const RUSSIAN_TEXT = '<strong>Произошла ошибка в распознавании, обновляем страницу. ' +
                         'Если не обновилось — нажмите кнопку «Дом».</strong>';

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
