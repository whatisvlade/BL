// ==UserScript==
// @name         Book New Appointment + Internet Check (v2)
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Перенаправление на вход только при наличии интернета. Запуск проверки через 9 секунд после успеха удаления записей.
// @author       You
// @match        https://belarus.blsspainglobal.com/Global/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TEST_URLS = [
        'https://www.google.com/favicon.ico',
        'https://1.1.1.1/cdn-cgi/trace',
        'https://github.com/favicon.ico'
    ];
    const CHECK_INTERVAL = 10000;

    function showMessage(text, color = 'green') {
        let messageElement = document.getElementById('script-message');
        if (!messageElement) {
            document.body.insertAdjacentHTML(
                'afterbegin',
                `<div id="script-message" style="position: fixed; top: 0; left: 0; width: 100%; background-color: ${color}; color: white; text-align: center; padding: 10px; font-size: 16px; z-index: 9999;">${text}</div>`
            );
        } else {
            messageElement.textContent = text;
            messageElement.style.backgroundColor = color;
        }
    }

    function hideMessage() {
        const messageElement = document.getElementById('script-message');
        if (messageElement) messageElement.remove();
    }

    async function checkInternetAndRedirect() {
        showMessage('⏳ Проверка соединения через 9 секунд...', 'orange');
        setTimeout(() => {
            showMessage('⏳ Идет проверка интернета...', 'orange');
            const check = async () => {
                for (const url of TEST_URLS) {
                    try {
                        const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                        if (res.ok) {
                            showMessage('✅ Интернет есть. Перенаправляем...', 'green');
                            setTimeout(() => {
                                window.location.href = 'https://belarus.blsspainglobal.com/Global/account/Login?returnUrl=%2FGlobal%2Fappointment%2Fnewappointment&err=K7LYPi%2FpJtiLxj0JgYMBPVTdQ5hDdq9IVd7ALDT6sMo%3D';
                                hideMessage();
                            }, 3000);
                            return true;
                        }
                    } catch (e) {}
                }
                return false;
            };

            const intervalId = setInterval(async () => {
                const success = await check();
                if (success) clearInterval(intervalId);
            }, CHECK_INTERVAL);
        }, 10000);
    }

    function handleAppointments() {
        const alertElement = document.querySelector('.alert.alert-success');
        const button = document.querySelector('a.btn.btn-primary[href="/Global/appointment/newappointment"]');

        if (
            alertElement &&
            alertElement.textContent.trim() === 'All your pending appointments are removed' &&
            button
        ) {
            showMessage('Скрипт работает: ожидаем интернет-соединение...');
            alertElement.textContent = 'ПЕРЕНАПРАВЛЯЕМ НА СТРАНИЦУ ВХОДА, СМЕНИТЕ АЙПИ';
            button.style.display = 'none';
            checkInternetAndRedirect();
            observer.disconnect();
        }
    }

    const observer = new MutationObserver(() => {
        handleAppointments();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
