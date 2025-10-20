// ==UserScript==
// @name         visa_type_selector
// @namespace    http://tampermonkey.net/
// @version      2025-09-13
// @description  Молниеносный выбор опций без лишних задержек и сабмит формы.
// @author       You
// @match        https://appointment.blsspainbelarus.by/Global/Appointment/VisaType*
// @match        https://appointment.blsspainrussia.ru/Global/Appointment/VisaType*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=blsspainrussia.ru
// @grant        none
// ==/UserScript==



(function () {
    'use strict';

    // --- стоппер: не работать, если на странице "Too Many Requests" ---
    function pageHasTooManyRequests() {
        // Проверяем title
        if (/Too\s*Many\s*Requests/i.test(document.title || '')) return true;

        // Проверяем типичные контейнеры текста
        const sels = ['h1','h2','p','div','section','main','article'];
        for (const s of sels) {
            const nodes = document.querySelectorAll(s);
            for (const n of nodes) {
                const t = (n.textContent || '').trim();
                if (t && /Too\s*Many\s*Requests/i.test(t)) return true;
            }
        }
        return false;
    }

    // --- настройки ---
    const OPTION_TIMEOUT_MS = 7000; // жёсткий таймаут ожидания элемента/пункта (только для аварийного выхода)

    const CATEGORY_EVEN = '{{VISA_TYPE_1}}';
    const CATEGORY_ODD  = '{{VISA_TYPE_2}}';

    // --- ui helpers ---
    function showMessage(text) {
        let el = document.getElementById('script-message');
        if (!el) {
            const div = document.createElement('div');
            div.id = 'script-message';
            div.style.cssText = `
                position:fixed;top:0;left:0;width:100%;
                background:#198754;color:#fff;text-align:center;
                padding:10px;font-size:16px;z-index:9999;box-shadow:0 2px 5px rgba(0,0,0,.2)
            `;
            div.textContent = text;
            document.body.prepend(div);
        } else {
            el.textContent = text;
        }
    }
    function hideMessage(){ const el = document.getElementById('script-message'); if (el) el.remove(); }
    function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

    // --- утилиты ожидания без «пуллинга» ---
    /** Ожидаем появление видимого элемента по селектору с помощью MutationObserver (и мгновенной проверки). */
    function waitForVisible(selector, timeoutMs = OPTION_TIMEOUT_MS) {
        return new Promise((resolve, reject) => {
            const isVisible = (el) => !!(el && el.offsetParent !== null);
            // мгновенная проверка
            let $el = window.jQuery ? window.jQuery(selector) : null;
            if ($el && $el.length) {
                const visible = $el.filter((_, e) => isVisible(e)).first();
                if (visible.length) return resolve(visible);
            } else {
                const el = document.querySelector(selector);
                if (isVisible(el)) return resolve(window.jQuery ? window.jQuery(el) : el);
            }

            const obs = new MutationObserver(() => {
                const cand = document.querySelectorAll(selector);
                for (const node of cand) {
                    if (isVisible(node)) {
                        obs.disconnect();
                        return resolve(window.jQuery ? window.jQuery(node) : node);
                    }
                }
            });
            obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'aria-expanded'] });

            const to = setTimeout(() => {
                obs.disconnect();
                const msg = 'Timeout waiting for element: ' + selector;
                console.error(msg);
                showMessage('Элемент не найден (' + selector + '), обновляем страницу...');
                setTimeout(() => location.reload(), 1000);
                reject(new Error(msg));
            }, timeoutMs);
            // защитное отключение по resolve/reject
            const stop = (fn) => (...args) => { clearTimeout(to); obs.disconnect(); fn(...args); };
            resolve = stop(resolve); reject = stop(reject);
        });
    }

    /** Ждём появления КОНКРЕТНОГО optionText в контейнере списка (через MutationObserver) и кликаем его. */
    function waitAndClickOptionInList($dropdown, $arrow, $listContainer, optionText, timeoutMs = OPTION_TIMEOUT_MS) {
        const wanted = String(optionText).trim();

        const findTarget = () => {
            const items = $listContainer.find ? $listContainer.find('li').toArray() : Array.from($listContainer.querySelectorAll('li'));
            for (const li of items) {
                const txt = (li.innerText || li.textContent || '').trim();
                if (txt === wanted) return li;
            }
            return null;
        };

        return new Promise((resolve, reject) => {
            // убедиться, что дропдаун раскрыт
            const ensureOpen = () => {
                const expanded = ($dropdown.attr ? $dropdown.attr('aria-expanded') : $dropdown.getAttribute('aria-expanded')) === 'true';
                if (!expanded) ($arrow.click ? $arrow.click() : $arrow.dispatchEvent(new MouseEvent('click', {bubbles:true})));
            };

            ensureOpen();

            // мгновенная попытка
            let target = findTarget();
            if (target) {
                (target.click ? target.click() : target.dispatchEvent(new MouseEvent('click', {bubbles:true})));
                return resolve(true);
            }

            const rawList = $listContainer[0] || $listContainer;
            const obs = new MutationObserver(() => {
                ensureOpen();
                target = findTarget();
                if (target) {
                    obs.disconnect();
                    (target.click ? target.click() : target.dispatchEvent(new MouseEvent('click', {bubbles:true})));
                    return resolve(true);
                }
            });
            obs.observe(rawList, { childList: true, subtree: true, characterData: true });

            const to = setTimeout(() => {
                obs.disconnect();
                const msg = `За ${Math.round(timeoutMs/1000)} секунд пункт "${wanted}" не появился. Перезагрузка.`;
                console.warn(msg);
                showMessage(msg);
                setTimeout(() => location.reload(), 1000);
                reject(new Error(msg));
            }, timeoutMs);

            const stop = (fn) => (...args) => { clearTimeout(to); obs.disconnect(); fn(...args); };
            resolve = stop(resolve); reject = stop(reject);
        });
    }

    // открыть dropdown и выбрать КОНКРЕТНЫЙ пункт
    async function openDropdownAndSelect(optionText) {
        const $dropdownRaw = await waitForVisible('.k-widget.k-dropdown:not(.processed)');
        const $dropdown = ($dropdownRaw.jquery ? $dropdownRaw : window.jQuery($dropdownRaw)).first();
        if (!$dropdown.length) throw new Error("Dropdown не найден");

        const $arrow = $dropdown.find('.k-select .k-icon.k-i-arrow-60-down').first();
        if (!$arrow.length) throw new Error("Не найдена стрелка для открытия dropdown");

        // открыть
        $arrow[0].click();

        const ownsId = $dropdown.attr('aria-owns');
        if (!ownsId) throw new Error("Атрибут aria-owns не найден");

        const listSelector = '#' + ownsId;
        const $listContainerRaw = await waitForVisible(listSelector);
        const $listContainer = $listContainerRaw.jquery ? $listContainerRaw.first() : window.jQuery($listContainerRaw);

        await waitAndClickOptionInList($dropdown, $arrow[0], $listContainer, optionText);

        $dropdown.addClass('processed');
    }

    async function runScript() {
        try {
            showMessage('Скрипт работает: без задержек, ожидаем элементы...');

            await openDropdownAndSelect('Minsk');
            await openDropdownAndSelect('Schengen Visa');
            await openDropdownAndSelect('Schengen Visa');

            // выбор по чётности минуты
            const minute = new Date().getMinutes();
            const chosenCategory = (minute % 2 === 0) ? CATEGORY_EVEN : CATEGORY_ODD;
            showMessage(`Минуты: ${minute}. Выбираем категорию: ${chosenCategory}`);
            await openDropdownAndSelect(chosenCategory);

            showMessage(`Категория выбрана: ${chosenCategory}. Отправляем форму...`);

            await delay(1300);
            const $btnSubmitRaw = await waitForVisible('#btnSubmit');
            ($btnSubmitRaw[0] || $btnSubmitRaw).click();

            hideMessage();
        } catch (error) {
            console.error("Ошибка в runScript:", error);
            showMessage('Ошибка: ' + error.message);
            setTimeout(() => location.reload(), 3000);
        }
    }

    // --- безопасный запуск: не работать, если "Too Many Requests" ---
    function safeStart() {
        if (pageHasTooManyRequests()) {
            console.warn('visa_type_selector: стоп — обнаружен экран "Too Many Requests". Скрипт не запускается.');
            return;
        }
        runScript();
    }

    // запуск без jQuery-ready, но с проверкой стоппера
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', safeStart, { once: true });
    } else {
        safeStart();
    }
})();
