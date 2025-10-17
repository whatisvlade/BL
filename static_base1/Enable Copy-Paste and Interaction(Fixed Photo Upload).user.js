// ==UserScript==
// @name         Enable Copy-Paste and Interaction(Fixed Photo Upload)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Remove restrictions on copy-paste and interaction without breaking photo upload
// @author       You
// @match        https://belarus.blsspainglobal.com/Global/Appointment/ApplicantSelection*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Функция для удаления ограничений
    const removeRestrictions = () => {
        // Удаляем только блокирующие обработчики событий
        const elements = document.querySelectorAll('*');
        elements.forEach((el) => {
            // Удаляем только блокирующие обработчики
            el.onpaste = null;
            el.oncopy = null;
            el.oncut = null;
            el.oncontextmenu = null;
            el.onselectstart = null;
            el.ondragstart = null;
            el.onmousedown = null;

            // Не трогаем onchange, чтобы не ломать загрузку фотографий
        });

        // Разрешаем выделение текста и взаимодействие
        const style = document.createElement('style');
        style.innerHTML = `
            * {
                user-select: text !important;
                -webkit-user-select: text !important;
                -ms-user-select: text !important;
                pointer-events: auto !important;
            }
            input, textarea {
                pointer-events: auto !important;
            }
        `;
        document.head.appendChild(style);

        console.log('Ограничения сняты!');
    };

    // Выполняем функцию после загрузки страницы
    window.onload = removeRestrictions;

    // Отслеживаем изменения в DOM
    const observer = new MutationObserver(() => {
        removeRestrictions();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();