// ==UserScript==
// @name         success_notify
// @namespace    http://tampermonkey.net/
// @version      2025-02-08
// @description  Уведомления о записях с мобильной адаптацией
// @author       You
// @match        https://appointment.blsspainrussia.ru/Global/payment/PaymentResponse*
// @match        https://belarus.blsspainglobal.com/Global/payment/PaymentResponse*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Конфигурация
    const CONFIG = {
        MANAGER_BOT_TOKEN: '7901901530:AAE29WGTOS3s7TBVUmShUEYBkXXPq7Ew1UA',
        MANAGER_CHAT_ID: '{{ TELEGRAM_CHAT_ID }}',
        ADMIN_BOT_TOKEN: '8300788206:AAGeH9B-3Mnq4aZcbsojyPHZqLZBJymPeYE',
        ADMIN_CHAT_ID: '5361349487',
        CLIENT_NAME: '{{ USER_NAME }}',
        MANAGERS: {
            '5361349487': 'ВЛАД',
            '558959058': 'АННА',
            '530616519': 'АРТЕМ',
            '766510504': 'ВИКТОР',
            '450087970': 'ДМИТРИЙ',
            '160312116': 'САША',
            '211902859': 'ИЛЬЯ'

        },
        NOTIFICATION_TIMEOUT: 10000 // 10 секунд
    };

    // Получение базового URL сайта
    function getBaseUrl() {
        return window.location.origin;
    }

    // Проверка мобильного устройства
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // Показать уведомление клиенту (адаптивное для мобильных)
    function showClientNotification() {
        const isMobile = isMobileDevice();

        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translate(-50%, -40%); }
                to { opacity: 1; transform: translate(-50%, -50%); }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            .success-notification {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: ${isMobile ? '20px' : '40px'};
                border-radius: 15px;
                box-shadow: 0 0 30px rgba(0,0,0,0.4);
                z-index: 9999;
                width: ${isMobile ? '90%' : '80%'};
                max-width: ${isMobile ? '100%' : '600px'};
                text-align: center;
                font-size: ${isMobile ? '18px' : '24px'};
                animation: fadeIn 0.5s ease-out;
            }
            .success-notification h3 {
                color: #4CAF50;
                margin-top: 0;
                font-size: ${isMobile ? '24px' : '32px'};
                margin-bottom: ${isMobile ? '10px' : '20px'};
            }
            .success-notification p {
                font-size: ${isMobile ? '20px' : '28px'};
                line-height: 1.4;
                margin-bottom: ${isMobile ? '15px' : '0'};
            }
        `;
        document.head.appendChild(style);

        const notification = document.createElement('div');
        notification.className = 'success-notification';
        notification.innerHTML = `
            <h3>✅ Запись прошла успешно!</h3>
            <p>Можете закрывать браузер<br>Все подробности у вашего менеджера</p>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'fadeOut 1s ease-out';
            setTimeout(() => notification.remove(), 1000);
        }, CONFIG.NOTIFICATION_TIMEOUT);
    }

    // Проверка на ошибку записи
    function checkForError() {
        const errorAlert = document.querySelector('.alert.alert-danger');
        return errorAlert && errorAlert.textContent.includes('Your Appointment is Already Completed');
    }

    // Ожидание элемента (оптимизировано для мобильных)
    function waitForElement(selector, timeout = isMobileDevice() ? 10000 : 5000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) return resolve(element);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Элемент ${selector} не найден`));
            }, timeout);
        });
    }

    // Отправка сообщения (с обработкой ошибок)
    async function sendTelegramMessage(botToken, chatId, message) {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
            return await response.json();
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            return null;
        }
    }

    // Извлечение данных (оптимизировано для мобильных)
    async function extractAppointmentData() {
        try {
            const cardDiv = await waitForElement('.card.card-body.bg-light.p-4');

            const extract = (label) => {
                const items = cardDiv.querySelectorAll('.list-group-item');
                for (const item of items) {
                    const spans = item.querySelectorAll('span');
                    if (spans.length >= 2 && spans[0].textContent.includes(label)) {
                        return spans[1].textContent.trim();
                    }
                }
                return '';
            };

            return {
                number: extract('Appointment No'),
                date: extract('Appointment Date'),
                time: extract('Appointment Time'),
                applicants: extract('No Of Applicants'),
                amount: extract('Total Amount'),
                email: extract('Email'),
                mobile: extract('Mobile'),
                bookedBy: extract('Booked by')
            };
        } catch (error) {
            console.error('Ошибка извлечения данных:', error);
            return null;
        }
    }

    // Получение имени менеджера по chat_id
    function getManagerName(chatId) {
        return CONFIG.MANAGERS[chatId] || 'Неизвестный менеджер';
    }

    // Основная функция
    async function processAppointment() {
        try {
            if (checkForError()) {
                await sendTelegramMessage(
                    CONFIG.MANAGER_BOT_TOKEN,
                    CONFIG.MANAGER_CHAT_ID,
                    `❌ Ошибка записи\nУ клиента ${CONFIG.CLIENT_NAME}\nНо запись вероятно прошла успешно\nПроверьте почту`
                );
                return;
            }

            const data = await extractAppointmentData();
            if (!data) {
                await sendTelegramMessage(
                    CONFIG.ADMIN_BOT_TOKEN,
                    CONFIG.ADMIN_CHAT_ID,
                    '⚠ Не удалось извлечь данные записи'
                );
                return;
            }

            showClientNotification();

            const managerMsg = `Запись ${CONFIG.CLIENT_NAME}\n\n` +
                `Номер: ${data.number}\n` +
                `Дата: ${data.date} ${data.time}\n` +
                `Клиентов: ${data.applicants}\n` +
                `Сумма: ${data.amount}\n` +
                `Email: ${data.email}\n` +
                `Телефон: ${data.mobile}\n` +
                `Забронировано: ${data.bookedBy}`;

            const managerName = getManagerName(CONFIG.MANAGER_CHAT_ID);
            const adminMsg = `📋 Новая запись\n` +
                `👤 Менеджер: ${managerName}\n` +
                `🔢 Номер: ${data.number}\n` +
                `👥 Клиентов: ${data.applicants}\n` +
                `👤 Имя: ${data.bookedBy}\n` +
                `📧 Email: ${data.email}\n` +
                `📅 Дата: ${data.date} ${data.time}`;

            await sendTelegramMessage(CONFIG.MANAGER_BOT_TOKEN, CONFIG.MANAGER_CHAT_ID, managerMsg);
            await sendTelegramMessage(CONFIG.ADMIN_BOT_TOKEN, CONFIG.ADMIN_CHAT_ID, adminMsg);

        } catch (error) {
            console.error('Ошибка:', error);
            await sendTelegramMessage(
                CONFIG.ADMIN_BOT_TOKEN,
                CONFIG.ADMIN_CHAT_ID,
                `⚠ Ошибка в скрипте:\n${error.message}\n\nНо запись вероятно прошла успешно`
            );
        }
    }

    // Запуск
    if (document.readyState === 'complete') {
        processAppointment();
    } else {
        window.addEventListener('load', processAppointment);
    }
})();
