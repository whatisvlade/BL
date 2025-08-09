// ==UserScript==
// @name         account_email
// @namespace    http://tampermonkey.net/
// @version      2025-03-12
// @description  Автоматизация логина и взаимодействия с iframe. Если loading mask не исчезает — обновляем страницу. Кнопки управления вынесены в отдельный скрипт.
// @author       You
// @match        https://appointment.thespainvisa.com/Global/account/*
// @match        https://appointment.thespainvisa.com/Global/Account/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Впиши свой email
    const EMAIL = '{{ EMAIL }}';

    // Автоввод email и клик по Verify
    function insertEmailAndClickVerify() {
        var emailField = $('input.entry-disabled[type="text"]:visible').first();
        if (emailField.length) {
            emailField.removeAttr('readonly');
            emailField.val(EMAIL).trigger('input').trigger('change');
            let nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(emailField[0], EMAIL);
            let ev2 = new Event('input', { bubbles: true });
            emailField[0].dispatchEvent(ev2);

            console.log('Email вставлен в поле:', emailField.attr('id'));

            // Сначала клик по чекбоксу
            clickOnCheckbox();

            // Потом клик по кнопке Verify
            var verifyButton = $('#btnVerify:visible, button#btnVerify:visible').first();
            if (verifyButton.length) {
                setTimeout(() => {
                    verifyButton.click();
                    console.log('Клик по кнопке Verify');
                }, 3000);
            } else {
                console.log('Кнопка Verify не найдена!');
            }
        } else {
            console.log('Email-поле не найдено!');
            clickOnCheckbox();
        }
    }

    // Клик по чекбоксу
    function clickOnCheckbox() {
        const checkbox = $('#moscowCheckbox');
        if (checkbox.length && !checkbox.is(':checked')) {
            checkbox.click();
            console.log('Чекбокс отмечен.');
        } else {
            console.log('Чекбокс уже отмечен или не найден.');
        }
    }

    // Выполнить при загрузке и ещё раз через 1 сек
    $(document).ready(insertEmailAndClickVerify);
    setTimeout(insertEmailAndClickVerify, 1000);
})();
