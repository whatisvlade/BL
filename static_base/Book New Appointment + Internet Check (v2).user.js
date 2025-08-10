// ==UserScript==
// @name         Book New Appointment + Internet Check (v2)
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Перенаправление на вход только при наличии интернета. Запуск проверки через 9 секунд после успеха удаления записей.
// @author       You
// @match        https://appointment.thespainvisa.com/Global/*
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
        showMessage('⏳ Checking connection in 9 seconds...', 'orange');
        setTimeout(() => {
            showMessage('⏳ Checking internet connection...', 'orange');
            const check = async () => {
                for (const url of TEST_URLS) {
                    try {
                        const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                        if (res.ok) {
                            showMessage('✅ Internet is available. Redirecting...', 'green');
                            setTimeout(() => {
                                window.location.href = 'https://appointment.thespainvisa.com/Global/account/Login';
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
            alertElement.textContent.trim() === 'All your ongoing appointments have been cleared. You can now schedule new appointment' &&
            button
        ) {
            showMessage('Script is running: waiting for internet connection...');
            alertElement.textContent = 'CHANGE YOUR IP';
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
