// ==UserScript==
// @name         remote_config
// @namespace    http://tampermonkey.net/
// @version      2025-06-16
// @description  Обработка ошибок: блокировки аккаунта/IP в основной чат, неизвестные в отдельный чат, forcedIP без отправки.
// @author       You
// @match        https://appointment.thespainvisa.com/Global/appointment/newappointment*
// @match        https://appointment.thespainvisa.com/Global/Appointment/NewAppointment*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const USER_NAME = '{{ USER_NAME }}';
    const TELEGRAM_BOT_TOKEN = 'YOUR_TOKEN';
    const TELEGRAM_CHAT_ID = '{{ TELEGRAM_CHAT_ID }}'; // основной чат
    const TELEGRAM_CHAT_ID_UNKNOWN = '5361349487'; // чат для неизвестных

    const TEST_URLS = [
        'https://www.google.com/favicon.ico',
        'https://1.1.1.1/cdn-cgi/trace',
        'https://github.com/favicon.ico'
    ];
    const CHECK_INTERVAL = 10000;
    let internetCheckStarted = false;

    function showMessage(text, color = 'red') {
        let messageElement = document.getElementById('script-message');
        if (!messageElement) {
            document.body.insertAdjacentHTML(
                'afterbegin',
                `<div id="script-message" style="position: fixed; top: 0; left: 0; width: 100%; background-color: ${color}; color: white; text-align: center; padding: 15px; font-size: 20px; font-weight: bold; z-index: 9999;">${text}</div>`
            );
        } else {
            messageElement.textContent = text;
        }
    }

    async function checkInternet() {
        for (const url of TEST_URLS) {
            try {
                const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                if (res.ok) {
                    showMessage('🔁 Redirecting to Login...', 'red');
                    setTimeout(() => {
                        window.location.href = 'https://appointment.thespainvisa.com/Global/account/Login';
                    }, 4000);
                    break;
                }
            } catch (e) {}
        }
    }

    function startInternetCheckAfterDelay() {
        if (!internetCheckStarted) {
            internetCheckStarted = true;
            setTimeout(() => {
                showMessage('⏳ Checking internet connection...', 'orange');
                setInterval(checkInternet, CHECK_INTERVAL);
            }, 10000);
        }
    }

    function sendTelegramText(chatId, message) {
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });
    }

    function replaceAllErrors() {
        // Основной чат — только блокировки аккаунта/IP
        const mainChatErrors = {
            'You have reached maximum number of appointments allowed from your account or network.': 'Blocked: Too many appointments from this account or IP',
            'Maximum number of appointments are booked from your given email domain': 'Blocked: Email domain is blacklisted.'
        };

        const forcedIPMessages = [
            'No slots available for selected category, please try later',
            'Invalid appointment flow, please try again',
            'Liveness test expired, please retry',
            'Invalid user ID, please try again',
            'No appointment slots available, try again later',
            'Selected time is already taken, please try again',
            'The appointment date and time you selected are already taken by other applicants. Please choose a different date and time.',
            'The appointment request is expired',
            'Currently, no slots are available for the selected category. Kindly try again after sometime. Thank you for your patience'
        ];

        // 1. Проверка ошибок для основного чата
        for (const [originalText, telegramMsg] of Object.entries(mainChatErrors)) {
            const el = Array.from(document.querySelectorAll('*')).find(el => el.textContent.trim() === originalText);
            if (el) {
                el.textContent = 'Change your IP address';
                sendTelegramText(TELEGRAM_CHAT_ID, `❗️${USER_NAME} - ${telegramMsg}`);
                startInternetCheckAfterDelay();
                return;
            }
        }

        // 2. Forced IP ошибки — без отправки в ТГ
        const elForced = Array.from(document.querySelectorAll('*')).find(el =>
            forcedIPMessages.includes(el.textContent.trim())
        );
        if (elForced) {
            elForced.textContent = 'Change your IP address';
            startInternetCheckAfterDelay();
            return;
        }

        // 3. Неизвестные ошибки — в отдельный чат
        const errorLikeElement = Array.from(document.querySelectorAll('*')).find(el =>
            el.textContent.trim().length > 10 && /error|appointment|expired|slot|time/i.test(el.textContent)
        );
        if (errorLikeElement) {
            sendTelegramText(TELEGRAM_CHAT_ID_UNKNOWN, `🔍 ${USER_NAME} - Unknown error: ${errorLikeElement.textContent.trim()}`);
        }
    }

    replaceAllErrors();
})();
