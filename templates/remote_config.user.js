// ==UserScript==
// @name         remote_config
// @namespace    http://tampermonkey.net/
// @version      2025-06-16
// @description  Получение конфигурации ip_blocked с GitHub API без кэша, с редиректом или проверкой интернета. Обработка ошибки 403 (блок).
// @author       You
// @match        https://appointment.blsspainbelarus.by/Global/appointment/newappointment*
// @match        https://appointment.blsspainbelarus.by/Global/Appointment/NewAppointment*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const USER_NAME = '{{ USER_NAME }}';
    const TELEGRAM_BOT_TOKEN = '7901901530:AAE29WGTOS3s7TBVUmShUEYBkXXPq7Ew1UA';
    const TELEGRAM_CHAT_ID = '{{ TELEGRAM_CHAT_ID }}';

    function sendTelegramText(message) {
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        }).catch(() => {});
    }

    // отправляем в ТГ ТОЛЬКО для этих двух текстов
    const notifyOnly = new Set([
        'You have reached maximum number of appointments allowed from your account or network.',
        'Maximum number of appointments are booked from your given email domain'
    ]);

    const errorMappings = [
        { text: 'You have reached maximum number of appointments allowed from your account or network.', message: 'ПРОИЗОШЛА ОШИБКА В ЗАПИСИ (БЛОК НА АКК ИЛИ АЙПИ).' },
        { text: 'Maximum number of appointments are booked from your given email domain', message: 'ПРОИЗОШЛА ОШИБКА В ЗАПИСИ (БЛОК НА МЫЛО).' }

    ];

    function replaceErrorTextsOnce(root = document) {
        errorMappings.forEach(e => {
            const element = Array.from(root.querySelectorAll('*')).find(el => el.textContent.trim() === e.text);
            if (!element) return;

            element.textContent = e.message;

            if (notifyOnly.has(e.text)) {
                sendTelegramText(`❗️${USER_NAME} - ${e.message}`);
            }
        });
    }

    // единоразовый прогон
    replaceErrorTextsOnce();

    // если страница динамическая — отслеживаем изменения и подменяем по мере появления текста
    const mo = new MutationObserver(muts => {
        for (const m of muts) {
            if (m.type === 'childList' || m.type === 'subtree') {
                replaceErrorTextsOnce(document);
                break;
            } else if (m.type === 'characterData') {
                replaceErrorTextsOnce(document);
                break;
            }
        }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
