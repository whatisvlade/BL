// ==UserScript==
// @name         visa_type_selector
// @namespace    http://tampermonkey.net/
// @version      2025-03-12
// @description  Automatically selects dropdown options and submits the form.
// @author       You
// @match        https://belarus.blsspainglobal.com/Global/Appointment/VisaType*
// @match        https://appointment.blsspainrussia.ru/Global/Appointment/VisaType*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=blsspainrussia.ru
// @grant        none
// ==/UserScript==

$(document).ready(function () {
    // Запускаем основной скрипт
    runScript();
});

// Функция для отображения сообщения
function showMessage(text) {
    let messageElement = document.getElementById('script-message');
    if (!messageElement) {
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

// Функция ожидания появления элемента по селектору (через polling)
function waitForElementPromise(selector, timeout) {
    return new Promise((resolve, reject) => {
        timeout = timeout || 50000;
        const intervalTime = 0;
        let elapsed = 0;
        const timer = setInterval(() => {
            const $elem = $(selector);
            if ($elem.length > 0 && $elem.is(':visible')) {
                clearInterval(timer);
                resolve($elem);
            }
            elapsed += intervalTime;
            if (elapsed >= timeout) {
                clearInterval(timer);
                reject(new Error('Timeout waiting for element: ' + selector));
            }
        }, intervalTime);
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Асинхронная функция для открытия dropdown, выбора пункта и его закрытия
async function openDropdownAndSelect(optionText) {
    try {
        // Выбираем первый закрытый видимый dropdown, который еще не обработан
        const $dropdownRaw = await waitForElementPromise('.k-widget.k-dropdown[aria-expanded="false"]:visible:not(.processed)', 0);
        const $dropdown = $dropdownRaw.first();
        if (!$dropdown.length) {
            throw new Error("Dropdown не найден");
        }

        // Находим стрелку (иконку) для открытия списка
        const $arrow = $dropdown.find('.k-select .k-icon.k-i-arrow-60-down').first();
        if ($arrow.length) {
            $arrow.click(); // Открываем dropdown

            // Используем атрибут aria-owns для определения id контейнера списка
            const ownsId = $dropdown.attr('aria-owns');
            if (!ownsId) {
                throw new Error("Атрибут aria-owns не найден");
            }
            const listSelector = '#' + ownsId;
            const $listContainerRaw = await waitForElementPromise(listSelector, 0);
            const $listContainer = $listContainerRaw.first();

            let found = false;
            $listContainer.find('li').each(function() {
                if ($(this).text().trim() === optionText) {
                    $(this).click(); // Выбираем нужную опцию
                    found = true;
                    return false; // Прерываем перебор
                }
            });
            if (!found) {
                throw new Error('Не найден пункт списка с текстом: ' + optionText);
            }

            // Помечаем данный dropdown как обработанный
            $dropdown.addClass('processed');
        } else {
            throw new Error("Не найдена стрелка для открытия dropdown");
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}

// Основная асинхронная функция, обеспечивающая строго последовательное выполнение
async function runScript() {
    try {
        // Показываем сообщение, что скрипт запущен
        showMessage('Скрипт работает: ожидаем...');

        // Сначала обрабатываем первый dropdown – выбираем опцию "St. Petersburg"
        await openDropdownAndSelect('{{CITY}}');

        // Затем второй dropdown – выбираем опцию "Schengen Visa"
        await openDropdownAndSelect('Schengen Visa');

        // Затем третий dropdown – снова "Tourism"
        await openDropdownAndSelect('Tourism');

        // Четвёртый dropdown – выбираем "Normal" или "Premium" в зависимости от текущей минуты
        const currentMinute = new Date().getMinutes();
        const visaOption = (currentMinute % 2 === 0) ? '{{VISA_TYPE_1}}' : '{{VISA_TYPE_2}}';
        await openDropdownAndSelect(visaOption);

        // Обновляем сообщение после выбора
        showMessage(`Категории выбраны успешно (${visaOption}).`);

        await delay(5000);
        const $btnSubmitRaw = await waitForElementPromise('#btnSubmit', 0);
        const $btnSubmit = $btnSubmitRaw.first();
        $btnSubmit.click();

        // Скрываем сообщение после завершения работы
        hideMessage();
    } catch (error) {
        console.error("Ошибка в runScript:", error);
        showMessage('Ошибка: ' + error.message);
    }
}


