// ==UserScript==
// @name         Click Delete Button with Delay
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Automatically clicks the "Delete All My Pending Appointments" button with a 5-second delay, changes its text, and removes the "No, I will Continue with current appointment" button. Displays a message only when the script is working.
// @author       You
// @match        https://belarus.blsspainglobal.com/Global/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Функция для отображения сообщения
    function showMessage(text) {
        // Если сообщение уже существует, обновляем его текст
        let messageElement = document.getElementById('script-message');
        if (!messageElement) {
            // Создаем сообщение, если его нет
            $('body').prepend(`
                <div id="script-message" style="
                  position: fixed;
                  top: 0;
                  left: 0;
                  width: 100%;
                  background-color: green;
                  color: white;
                  text-align: center;
                  padding: 10px;
                  font-size: 16px;
                  z-index: 9999;
                  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                  will-change: transform;
                ">
                  ${text}
                </div>
            `);

            // Добавляем адаптацию для мобильных устройств
            const style = `
                <style>
                  @media (max-width: 768px) {
                    #script-message {
                      font-size: 14px;
                      padding: 8px;
                    }
                  }
                </style>
            `;
            $('head').append(style);
        } else {
            // Обновляем текст сообщения
            messageElement.textContent = text;
        }
    }

    // Функция для скрытия сообщения
    function hideMessage() {
        const messageElement = document.getElementById('script-message');
        if (messageElement) {
            messageElement.remove();
        }
    }

    // Основной интервал для выполнения действий
    const interval = setInterval(() => {
        const alertElement = document.querySelector('.alert.alert-warning');
        const deleteButton = document.querySelector('button.btn.btn-primary');
        const continueButton = document.querySelector('a.btn.btn-secondary');

        // Проверяем, найдены ли все необходимые элементы
        if (alertElement && deleteButton && continueButton) {
            // Показываем сообщение, что скрипт работает
            showMessage('Скрипт работает: отменяем текущую сессию...');

            // Изменяем текст сообщения
            alertElement.innerText = 'ОТМЕНЯЕМ ВАШУ ТЕКУЩУЮ СЕССИЮ ВИДЕО ВЕРИФИКАЦИИ, ТАК КАК К НЕЙ НЕТ ДОСТУПА';

            // Скрываем кнопки
            deleteButton.style.display = 'none';
            continueButton.style.display = 'none';

            // Выполняем клик по кнопке через 5 секунд
            setTimeout(() => {
                deleteButton.click();
                hideMessage(); // Скрываем сообщение после завершения работы
            }, 5000);

            // Останавливаем проверку
            clearInterval(interval);
        }
    }, 100); // Проверяем каждые 100 мс
})();