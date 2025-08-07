// ==UserScript==
// @name         Gateway Error Handler
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Обрабатывает страницы с 502 Bad Gateway и 504 Gateway Time-out, обновляет их через 1 секунду, но не работает в iframe
// @author       YourName
// @match        https://appointment.thespainvisa.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isActive = false;
    let observer = null;
    let reloadTimer = null;

    // Список ошибок для обработки
    const errorPatterns = {
        titles: [
            '502 Bad Gateway',
            '503 Service Temporarily Unavailable',
            '503 Service Unavailable',
            '504 Gateway Time-out',
            '504 Gateway Timeout',
            '500 Internal Server Error',
            '502 Proxy Error',
            '503 Over Quota',
            '504 Error',
            'Bad Gateway',
            'Gateway Timeout',
            'Error 502',
            'Error 503',
            'Error 504',
            'Application Temporarily Unavailable',
            'Service Temporarily Unavailable',
            'Service Unavailable',
            'Server Error',
            'Server temporarily unavailable',
            'Temporary Error',
            'Temporary failure',
            'Backend fetch failed',
            'An error occurred',
            'Temporarily Unavailable',
            'Temporarily Unreachable',
            'Site temporarily unavailable',
            'Site under maintenance',
            'Application Error'
        ],
        bodyTexts: [
            '<h1>502 Bad Gateway</h1>',
            '<h1>504 Gateway Time-out</h1>',
            '<h1>503 Service Temporarily Unavailable</h1>',
            '<h1>500 Internal Server Error</h1>',
            'Application Temporarily Unavailable',
            'Server is temporarily unable to service your request',
            'The server is temporarily unable to service your request',
            'Temporary failure',
            'Backend fetch failed',
            'Application is temporarily unavailable'
        ]
    };

    // Функция для проверки текста в документе
    function containsErrorText(doc) {
        // Проверка по заголовку
        const titleMatch = errorPatterns.titles.some(text => doc.title.includes(text));
        
        // Проверка по содержимому
        const bodyMatch = errorPatterns.bodyTexts.some(text => doc.body.innerHTML.includes(text));
        
        // Проверка для минимального содержимого с признаками ошибки
        const minimalContent = doc.body.textContent.trim().length < 100 && 
                             (doc.body.innerHTML.includes('error') || 
                              doc.body.innerHTML.includes('unavailable'));
        
        return titleMatch || bodyMatch || minimalContent;
    }

    // Основная функция проверки
    function checkForErrors() {
        // Проверяем основной документ
        if (containsErrorText(document)) {
            handleError(document);
            return;
        }

        // Проверяем все iframe
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (containsErrorText(iframeDoc)) {
                    console.log('Ошибка найдена в iframe. Обновляем всю страницу...');
                    reloadPage();
                    return;
                }
            } catch (e) {
                console.warn('Нет доступа к iframe (возможно кросс-домен):', e);
            }
        }
    }

    // Обработка при обнаружении ошибки
    function handleError(doc) {
        if (isActive) return;
        
        console.log('Ошибка обнаружена. Заменяем содержимое...');
        isActive = true;
        startObserver();

        // Сохраняем оригинальный h1 если есть
        let h1 = doc.querySelector('h1');
        if (!h1) {
            h1 = document.createElement('h1');
            doc.body.innerHTML = '';
            doc.body.appendChild(h1);
        }
        
        h1.style.textAlign = 'center';
        h1.textContent = 'ПРОИЗОШЕЛ СБОЙ. СТРАНИЦА ОБНОВИТСЯ ЧЕРЕЗ 2 СЕКУНДЫ';

        // Удаляем весь остальной контент
        const bodyChildren = Array.from(doc.body.children);
        bodyChildren.forEach(child => {
            if (child !== h1) {
                child.remove();
            }
        });

        // Отменяем предыдущий таймер, если был
        if (reloadTimer) {
            clearTimeout(reloadTimer);
        }
        
        reloadTimer = setTimeout(() => {
            console.log('Перезагружаем страницу...');
            reloadPage();
        }, 2000);
    }

    // Перезагрузка страницы
    function reloadPage() {
        stopObserver();
        isActive = false;
        window.location.reload();
    }

    // Удаление лишних сообщений
    function removeUnwantedMessages() {
        if (isActive) {
            const messageElements = document.querySelectorAll('#script-message, .error-message');
            messageElements.forEach(element => {
                console.log('Удаляем сообщение:', element);
                element.remove();
            });
        }
    }

    // Запуск наблюдателя
    function startObserver() {
        if (!observer) {
            observer = new MutationObserver(() => {
                if (isActive) {
                    removeUnwantedMessages();
                    // Повторная проверка на случай динамического изменения страницы
                    if (containsErrorText(document)) {
                        handleError(document);
                    }
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
        console.log('Начинаем проверку на ошибки...');
        checkForErrors();
        
        // Периодическая проверка каждые 5 секунд
        setInterval(checkForErrors, 5000);
    }, 10);
})();
