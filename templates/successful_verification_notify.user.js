// ==UserScript==
// @name         successful_verification_notify
// @namespace    http://tampermonkey.net/
// @version      2025-02-08
// @description  try to take over the world!
// @author       You
// @match        https://appointment.thespainvisa.com/Global/Appointment/Payment*
// @grant        none
// ==/UserScript==

// === НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ ===
const USER_NAME = '{{ USER_NAME }}'; // Имя и фамилия (или любое обозначение)
const TELEGRAM_BOT_TOKEN = '7901901530:AAE29WGTOS3s7TBVUmShUEYBkXXPq7Ew1UA'; // Токен бота
const TELEGRAM_CHAT_ID = '{{ TELEGRAM_CHAT_ID }}'; // ID чата

// === Флаг, чтобы не отправлять повторно ===
let messageWasSent = false;

// === Отправка сообщения в Telegram ===
async function sendTelegramMessage() {
    if (messageWasSent) return;

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: `✅${USER_NAME} прошел верификацию, ожидаем подтверждения записи`,
                parse_mode: 'HTML'
            })
        });
        const data = await response.json();
        console.log('Сообщение отправлено в Telegram:', data);
        messageWasSent = true;
    } catch (error) {
        console.error('Ошибка отправки в Telegram:', error);
    }
}

// === Автоклик кнопок ===
function clickSkipButton() {
    document.querySelectorAll('button[onclick^="OnVasSkip"]').forEach(button => button.click());
}

function clickBookAppointmentButton() {
    const button = document.getElementById('btnPayAmount');
    if (button) {
        setTimeout(() => button.click(), 7000);
    }
}

function clickPayConfirmButton() {
    const modal = document.getElementById('payConfirmModal');
    if (modal && modal.classList.contains('show')) {
        const payConfirmButton = document.getElementById('payConfirm');
        if (payConfirmButton) payConfirmButton.click();
    }
}

// === Наблюдение за модальным окном ===
function observeModal() {
    const observer = new MutationObserver((mutationsList) => {
        mutationsList.forEach(mutation => {
            if (mutation.type === 'attributes' || mutation.type === 'childList') {
                clickPayConfirmButton();
            }
        });
    });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
}

// === Запуск ===
sendTelegramMessage();
clickSkipButton();
clickBookAppointmentButton();
observeModal();
