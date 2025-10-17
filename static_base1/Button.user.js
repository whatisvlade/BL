// ==UserScript==
// @name         Button
// @namespace    http://tampermonkey.net/
// @version      2025-02-08
// @description  Кнопки: перезагрузка и переход домой на BLS (не работает в iframe)
// @author       You
// @match        https://belarus.blsspainglobal.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Не выполнять скрипт внутри iframe
    if (window.top !== window.self) return;

    function createShadowButton(icon, position, onClick, tooltip) {
        const host = document.createElement('div');
        host.style.position = 'fixed';
        host.style.zIndex = '9999999';
        host.style.pointerEvents = 'none';

        if (position === 'left') {
            host.style.left = '35px';
            host.style.bottom = '35px';
        } else if (position === 'right') {
            host.style.right = '35px';
            host.style.bottom = '35px';
        }

        const shadow = host.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = `
            button {
                all: unset;
                width: 60px;
                height: 60px;
                border-radius: 40%;
                background-color: #007BFF;
                color: white;
                border: none;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                cursor: pointer;
                font-size: 40px;
                font-weight: bold;
                text-align: center;
                line-height: 60px;
                pointer-events: auto;
                transition: background-color 0.3s;
            }

            button:hover {
                background-color: #0056b3;
            }
        `;

        const button = document.createElement('button');
        button.textContent = icon;
        button.title = tooltip || '';
        button.addEventListener('click', onClick);

        shadow.appendChild(style);
        shadow.appendChild(button);
        document.body.appendChild(host);
    }

    createShadowButton('⟳', 'left', () => {
        location.reload();
    }, 'Перезагрузить страницу');

    createShadowButton('🏠', 'right', () => {
        window.location.href = 'https://belarus.blsspainglobal.com/Global/account/Login?returnUrl=%2FGlobal%2Fappointment%2Fnewappointment&err=HU7zqU0yCxX3GNnx4emgb8d%2FwA73yBclF%2B5Wi%2B0CSYM%3D';
    }, 'На главную страницу');
})();
