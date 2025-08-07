// ==UserScript==
// @name         livenessrequest (Stealth + User Message)
// @namespace    http://tampermonkey.net/
// @version      2025-06-03
// @description  Логирование + сообщения для пользователей без создания новых элементов
// @author       You
// @match        https://belarus.blsspainglobal.com/Global/appointment/livenessrequest*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=blsspainrussia.ru
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const startDelay = 5000 + Math.random() * 3000; // Задержка перед началом работы

    setTimeout(() => {
        console.log("Stealth Liveness Script (с сообщениями) запущен");

        let processingStarted = false;

        // Функция для отображения сообщения пользователю (только через существующие элементы)
        function showUserMessage(text) {
            const target = document.querySelector('.alert.alert-warning.text-center') || document.querySelector('.validation-summary-errors') || document.querySelector('body');
            if (target) {
                const existing = target.querySelector('.user-message');
                if (existing) existing.remove();

                const msg = document.createElement('div');
                msg.className = 'user-message';
                msg.style.color = 'red';
                msg.style.fontWeight = 'bold';
                msg.style.margin = '10px 0';
                msg.textContent = text;
                target.appendChild(msg);

                setTimeout(() => {
                    msg.remove();
                }, 7000);
            }
        }

        // Функция для проверки текста на странице
        const checkText = () => {
            const elements = document.body.getElementsByTagName('*');
            for (let element of elements) {
                for (let node of element.childNodes) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (node.textContent.includes('Analysis in progress')) {
                            console.log("🟡 Анализ в процессе обнаружен");
                            processingStarted = true;
                        }
                        if (node.textContent.includes('Please wait a few seconds')) {
                            console.log("🟡 Ожидание подтверждения...");
                        }
                        if (node.textContent.includes('Processing data')) {
                            console.log("🟡 Данные обрабатываются");
                            processingStarted = true;
                        }
                        if (node.textContent.includes('Uploading data')) {
                            console.log("🟡 Загрузка данных...");
                        }
                    }
                }
            }
        };

        // Проверка состояния загрузки и сообщения пользователю при долгой загрузке
        const checkLoadingState = () => {
            if (processingStarted) {
                setTimeout(() => {
                    showUserMessage("⚠️ Длительная загрузка... Если процесс не завершится, попробуйте обновить страницу или нажмите кнопку ДОМОЙ.");
                }, 90000); // Сообщение через 90 секунд
            }
        };

        // Логирование запросов XHR
        (function() {
            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                this._requestMethod = method;
                this._requestUrl = url;
                originalOpen.apply(this, [method, url, ...rest]);
            };

            const originalSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function(...args) {
                this.addEventListener("load", function() {
                    if (this._requestUrl && this._requestUrl.includes("plugin_liveness.php")) {
                        console.log(`✅ Ответ от liveness.php получен: статус ${this.status}`);
                    }
                });
                originalSend.apply(this, args);
            };
        })();

        // Запускаем проверку текста раз в 2 секунды
        const interval = setInterval(() => {
            checkText();
            checkLoadingState();
        }, 2000);

        // Остановить через 3 минуты (fail-safe)
        setTimeout(() => {
            clearInterval(interval);
            console.log("Stealth Liveness Script завершил работу.");
        }, 180000);

    }, startDelay);
})();
