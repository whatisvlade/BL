// ==UserScript==
// @name         AddMessageToBottomWithJQueryPaymentResponse*
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Добавляет сообщение внизу страницы с использованием jQuery, адаптированное для мобильных устройств
// @author       You
// @match        https://belarus.blsspainglobal.com/Global/payment/PaymentResponse*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // Проверяем, что jQuery доступен
  if (typeof $ === 'undefined') {
    console.error('jQuery не найден. Убедитесь, что он подключён на странице.');
    return;
  }

  $(document).ready(function() {
    // Добавляем сообщение в верхней части страницы
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
        z-index: 9900;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        will-change: transform;
      ">
        Запись подтверждена!
      </div>
    `);

    // Добавляем стили для адаптации на мобильных устройствах
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
  });
})();