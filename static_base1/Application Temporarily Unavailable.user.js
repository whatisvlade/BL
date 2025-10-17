// ==UserScript==
// @name         Application Temporarily Unavailable
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Проверяет наличие текста "Application Temporarily Unavailable", включая iframe, и перезагружает страницу, если текст найден.
// @author       Ваше имя
// @match        https://belarus.blsspainglobal.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let isActive = false; // Флаг, указывающий, работает ли скрипт
    let observer = null; // Переменная для хранения наблюдателя

    // Функция для проверки текста в документе
    function containsUnavailableText(doc) {
        const h1 = doc.querySelector('h1');
        return h1 && h1.textContent.trim() === 'Application Temporarily Unavailable';
    }

    // Основная функция проверки
    function checkForTextAndReplace() {
        // Проверяем основной документ
        if (containsUnavailableText(document)) {
            handleUnavailable(document);
            return;
        }

        // Проверяем все iframe
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (containsUnavailableText(iframeDoc)) {
                    console.log('Текст найден в iframe. Обновляем всю страницу...');
                    window.location.reload();
                    return;
                }
            } catch (e) {
                console.warn('Нет доступа к iframe (возможно кросс-домен):', e);
            }
        }

        console.log('Текст не найден ни на основной странице, ни в iframe.');
    }

    // Обработка при обнаружении текста
    function handleUnavailable(doc) {
        console.log('Текст найден. Заменяем текст и удаляем остальной контент...');
        isActive = true;
        startObserver();

        const h1 = doc.querySelector('h1');
        h1.textContent = 'ПРОИЗОШЕЛ СБОЙ СТРАНИЦА ОБНОВИТСЯ ЧЕРЕЗ ПАРУ СЕКУНД';

        // Удаляем весь остальной контент, кроме заголовка
        const bodyChildren = Array.from(doc.body.children);
        bodyChildren.forEach(child => {
            if (child !== h1) {
                child.remove();
            }
        });

        setTimeout(() => {
            console.log('Перезагружаем страницу...');
            window.location.reload();
            stopObserver();
            isActive = false;
        }, 2000);
    }

    // Удаление лишних сообщений
    function removeUnwantedMessages() {
        if (isActive) {
            const messageElement = document.getElementById('script-message');
            if (messageElement) {
                console.log('Удаляем сообщение, созданное другим скриптом...');
                messageElement.remove();
            }
        }
    }

    // Запуск наблюдателя
    function startObserver() {
        if (!observer) {
            observer = new MutationObserver(() => {
                if (isActive) {
                    removeUnwantedMessages();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            console.log('Наблюдатель запущен.');
        }
    }

    // Остановка наблюдателя
    function stopObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
            console.log('Наблюдатель остановлен.');
        }
    }

    // Задержка перед запуском проверки
    setTimeout(() => {
        console.log('Проверяем наличие текста...');
        checkForTextAndReplace();
    }, 10);
})();
