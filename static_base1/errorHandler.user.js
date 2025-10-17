// ==UserScript==
// @name         errorHandler
// @namespace    http://tampermonkey.net/
// @version      2025-07-23
// @description  try to take over the world!
// @author       You
// @match        https://belarus.blsspainglobal.com/Home/*
// @match        https://appointment.blsspainrussia.ru/Home/*
// @grant        none
// ==/UserScript==

(function() {
  const alert = document.querySelector('.alert.alert-warning.text-center');
  if (!alert) return;
  const btn = alert.querySelector('button.btn.btn-default');
  if (btn) {
    console.log('🔁 [ERROR PAGE] Жду 1 секунду перед кликом по Go Back');
    setTimeout(() => {
      btn.click();
      console.log('🔁 [ERROR PAGE] Клик выполнен!');
    }, 1000);
  }
})();


