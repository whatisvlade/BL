// ==UserScript==
// @name         remote_config
// @namespace    http://tampermonkey.net/
// @version      2025-06-16
// @description  Получение конфигурации ip_blocked с GitHub API без кэша, с редиректом или проверкой интернета. Обработка ошибки 403 (блок).
// @author       You
// @match        https://appointment.thespainvisa.com/Global/appointment/newappointment*
// @match        https://appointment.thespainvisa.com/Global/Appointment/NewAppointment*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const GITHUB_API_URL = 'https://api.github.com/repos/whatisvlade/control-config/contents/ip-status.json';
    const USER_NAME = '{{ USER_NAME }}';
    const TELEGRAM_BOT_TOKEN = '7901901530:AAE29WGTOS3s7TBVUmShUEYBkXXPq7Ew1UA';
    const TELEGRAM_CHAT_ID = '{{ TELEGRAM_CHAT_ID }}';
    const TEST_URLS = [
        'https://www.google.com/favicon.ico',
        'https://1.1.1.1/cdn-cgi/trace',
        'https://github.com/favicon.ico'
    ];
    const CHECK_INTERVAL = 10000;
    let internetCheckStarted = false;

    function redirectToAppointmentPage() {
        setTimeout(() => {
            window.location.href = 'https://appointment.thespainvisa.com/Global/Appointment/NewAppointment';
        }, 100);
    }

    function showMessage(text, color = 'green') {
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

    function hideMessage() {
        const messageElement = document.getElementById('script-message');
        if (messageElement) messageElement.remove();
    }

    async function checkInternet() {
        for (const url of TEST_URLS) {
            try {
                const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                if (res.ok) {
                    showMessage('🔁 Перенаправление...', 'red');
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
                showMessage('⏳ Проверка интернета...', 'orange');
                setInterval(checkInternet, CHECK_INTERVAL);
            }, 10000);
        }
    }

    function sendTelegramText(message) {
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
    }

    function replaceErrorTexts(isIpBlocked) {
        const errorMappings = [
            { text: 'Your network connection has changed during the appointment process. Please log out and try again.', message: 'ПРОИЗОШЛА ОШИБКА, СМЕНИТЕ АЙПИ', notify: true },
            { text: 'You have reached maximum number of appointments allowed from your account or network.', message: 'ПРОИЗОШЛА ОШИБКА В ЗАПИСИ (БЛОК НА АКК ИЛИ АЙПИ).', notify: true },
            { text: 'Maximum number of appointments are booked from your given email domain', message: 'ПРОИЗОШЛА ОШИБКА В ЗАПИСИ (БЛОК НА МЫЛО).', notify: true },
            { text: 'The appointment date and time you selected are already taken by other applicants. Please choose a different date and time.', message: 'ВРЕМЯ УЖЕ ЗАНЯТО ДРУГИМ ЗАЯВИТЕЛЕМ, СМЕНИТЕ АЙПИ', notify: false },
            { text: 'The appointment request is expired', message: 'СЕССИЯ ПРОСРОЧЕНА, СМЕНИТЕ АЙПИ', notify: false },
            { text: 'Appointment slots are not available', message: 'МЕСТ НЕТ, СМЕНИТЕ АЙПИ', notify: false },
            { text: 'Liveness test is expired', message: 'СЕССИЯ ИСТЕКЛА, СМЕНИТЕ АЙПИ.', notify: false },
            { text: 'The user id is invalid', message: 'СМЕНИТЕ АЙПИ', notify: false },
            { text: 'Invalid appointment request flow', message: 'СМЕНИТЕ АЙПИ', notify: false },
            { text: 'Currently, no slots are available for the selected category. Kindly try again after sometime. Thank you for your patience', message: 'СМЕНИТЕ АЙПИ', notify: false }
            

        ];

        errorMappings.forEach(e => {
            const element = Array.from(document.querySelectorAll('*')).find(el => el.textContent.trim() === e.text);
            if (element) {
                let finalMessage = e.message;
                if (!isIpBlocked && finalMessage.includes("СМЕНИТЕ АЙПИ")) {
                    finalMessage = finalMessage.replace("СМЕНИТЕ АЙПИ", "ПРОБУЙТЕ ЕЩЕ");
                }
                element.textContent = finalMessage;
                if (e.notify) {
                    sendTelegramText(`❗️${USER_NAME} - ${finalMessage}`);
                }
                if (isIpBlocked && !e.notify) {
                    startInternetCheckAfterDelay();
                } else if (!isIpBlocked && !e.notify) {
                    redirectToAppointmentPage();
                }
            }
        });
    }

    fetch(GITHUB_API_URL, {
        headers: { 'Accept': 'application/vnd.github.v3.raw' },
        cache: 'no-store'
    })
    .then(res => {
        if (res.status === 403) {
            showMessage('⚠️ СМЕНИТЕ АЙПИ', 'red');
            startInternetCheckAfterDelay();
            throw new Error('403 GitHub Access Denied');
        }
        return res.json();
    })
    .then(config => {
        const isIpBlocked = config.ip_blocked === true;
        replaceErrorTexts(isIpBlocked);
        if (!isIpBlocked) redirectToAppointmentPage();
    })
    .catch(err => {
        if (err.message !== '403 GitHub Access Denied') {
            showMessage('⚠️ СМЕНИТЕ АЙПИ', 'red');
            startInternetCheckAfterDelay();
        }
    });

})();

