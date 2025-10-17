// ==UserScript==
// @name         verify_fail_notify
// @namespace    http://tampermonkey.net/
// @version      2025-06-03
// @description  Автоматизация повторной верификации и отправка уведомлений в Telegram
// @author       You
// @match        https://appointment.blsspainrussia.ru/Global/Appointment/Liveness*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=blsspainrussia.ru
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Имя пользователя для уведомлений
    const USER_NAME = "{{ USER_NAME }}";

    // Конфигурация Telegram
    const TELEGRAM_BOT_TOKEN = '7901901530:AAE29WGTOS3s7TBVUmShUEYBkXXPq7Ew1UA'; // Замените на ваш токен
    const TELEGRAM_CHAT_ID = "{{ TELEGRAM_CHAT_ID }}"; // Замените на ваш Chat ID

    let messageWasSent = false;

    // UI-оповещение
    function showUIMessage(text, color = '#28a745') {
        const existing = document.getElementById('telegram-status-message');
        if (existing) existing.remove();

        const msg = document.createElement('div');
        msg.id = 'telegram-status-message';
        msg.textContent = text;
        msg.style.position = 'fixed';
        msg.style.bottom = '20px';
        msg.style.left = '50%';
        msg.style.transform = 'translateX(-50%)';
        msg.style.backgroundColor = color;
        msg.style.color = 'white';
        msg.style.padding = '10px 20px';
        msg.style.borderRadius = '8px';
        msg.style.fontSize = '16px';
        msg.style.zIndex = '999999';
        msg.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        document.body.appendChild(msg);

        setTimeout(() => msg.remove(), 5000);
    }

    // Отправка уведомления в Telegram
    async function sendTelegramMessage() {
        if (messageWasSent) return;

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: `❌${USER_NAME} не прошел верификацию и пробует еще раз`,
                    parse_mode: 'HTML'
                })
            });
            const data = await response.json();
            if (!data.ok) {
                console.error('Ошибка Telegram API:', data);
                showUIMessage('Ошибка отправки в Telegram', '#dc3545');
            } else {
                console.log('Сообщение отправлено в Telegram:', data);
                showUIMessage('Сообщение отправлено в Telegram!');
                messageWasSent = true;
            }
        } catch (error) {
            console.error('Ошибка отправки в Telegram:', error);
            showUIMessage('Ошибка отправки в Telegram', '#dc3545');
        }
    }

    // Ожидание элемента
    function waitForElement(selector, callback, interval = 100, timeout = 5000) {
        const startTime = Date.now();
        const timer = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(timer);
                callback(element);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(timer);
                console.log(`Элемент ${selector} не найден за ${timeout} мс.`);
            }
        }, interval);
    }

    // Обработка первого сообщения
    waitForElement('.alert.alert-warning.text-center', (alertElement) => {
        alertElement.innerHTML = `
            <h5 class="text-warning-emphasis">Внимание</h5>
            Сейчас начнется видео верификация, просьба найти хорошо освещенное место для ее прохождения. Верификация начнется через 10 секунд.<br><br>
            <button class="btn btn-success" id="autoAcceptButton" type="submit" onclick="return OnLivenessSubmit();" style="display: none;">Принять</button>
        `;

        setTimeout(() => {
            const acceptButton = document.getElementById('autoAcceptButton');
            if (acceptButton) {
                acceptButton.click();
                console.log("Кнопка 'Принять' нажата.");
                showUIMessage('Начало верификации');
            } else {
                console.log("Кнопка 'Принять' не найдена.");
            }
        }, 10000);
    });

    // Обработка ошибки верификации
    waitForElement('.validation-summary.validation-summary-errors', () => {
        sendTelegramMessage();

        const alertElement = document.querySelector('.alert.alert-warning.text-center');
        if (alertElement) {
            alertElement.innerHTML = `
                <h5 class="text-warning-emphasis">ВЕРИФИКАЦИЯ ПРОЙДЕНА НЕ УСПЕШНО</h5>
                ВОЗМОЖНО ПЛОХОЕ ОСВЕЩЕНИЕ, РЕЗКИЕ ДВИЖЕНИЯ НА КАМЕРУ, ГОЛОВНОЙ УБОР МЕШАЕТ, ШЕЯ ЗАКРЫТА, ПРОБУЕМ ЕЩЕ РАЗ, ВЕРИФИКАЦИЯ НАЧНЕТСЯ ЧЕРЕЗ 15 СЕКУНД.<br><br>
                <button class="btn btn-success" id="autoAcceptButton" type="submit" onclick="return OnLivenessSubmit();" style="display: none;">Принять</button>
            `;

            setTimeout(() => {
                const acceptButton = document.getElementById('autoAcceptButton');
                if (acceptButton) {
                    acceptButton.click();
                    console.log("Кнопка 'Принять' нажата.");
                    showUIMessage('Повторная верификация начата');
                } else {
                    console.log("Кнопка 'Принять' не найдена.");
                }
            }, 15000);
        } else {
            console.log("Элемент с классом 'alert alert-warning text-center' не найден для сообщения об ошибке.");
        }
    });
})();