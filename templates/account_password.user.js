// ==UserScript==
// @name         account_password
// @namespace    http://tampermonkey.net/
// @version      2025-06-22
// @description  Автоматизация: ввод пароля, выделение текущей капчи, кнопка для ручного поиска.
// @author       You
// @match        https://belarus.blsspainglobal.com/Global/newcaptcha/logincaptcha*
// @match        https://appointment.thespainvisa.com/Global/newcaptcha/logincaptcha*
// @match        https://belarus.blsspainglobal.com/Global/NewCaptcha/LoginCaptcha*
// @match        https://appointment.thespainvisa.com/Global/NewCaptcha/LoginCaptcha*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=blsspainglobal.com
// @grant        none
// ==/UserScript==


(function() {
  'use strict';

  // Впиши сюда свой пароль
  const PASSWORD = '{{ PASSWORD }}';

  function tryInsertPassword() {
    // Найти первое видимое password-поле (с любым классом, не только entry-disabled)
    var $field = $('input[type="password"]:visible, input.entry-disabled[type="password"]:visible').first();
    if ($field.length) {
      $field.removeAttr('readonly');
      // jQuery
      $field.val(PASSWORD).trigger('input').trigger('change');
      // Натуральное событие для упрямых форм
      let setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call($field[0], PASSWORD);
      let ev2 = new Event('input', { bubbles: true });
      $field[0].dispatchEvent(ev2);

      console.log('Пароль вставлен:', $field.attr('id') || $field[0]);
      return true;
    }
    return false;
  }

  // Пытаемся вставлять до успеха (10 сек с шагом 300мс)
  function insertPasswordWithRetry() {
    let elapsed = 0;
    let interval = setInterval(() => {
      if (tryInsertPassword() || elapsed > 10000) {
        clearInterval(interval);
      }
      elapsed += 300;
    }, 300);
  }

  // Запустить при загрузке и при динамическом появлении
  $(document).ready(insertPasswordWithRetry);

  // Для гарантии: если вдруг страница динамически обновляет форму
  setTimeout(insertPasswordWithRetry, 2000);
})();
