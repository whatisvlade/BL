// ==UserScript==
// @name         belarus.blsspainglobal.com ЗАПРОСЫ
// @namespace    http://tampermonkey.net/
// @version      4.8
// @description  Логирование ошибок (XHR, Fetch, ресурсы) + успехи только для форм (зелёный) и ошибки (красный). Уведомления через Shadow DOM.
// @author       Вы
// @match        https://belarus.blsspainglobal.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Функция для отображения сообщений через Shadow DOM
  function showMessage(message, color) {
    try {
      let shadowHost = document.getElementById("status-message-shadow-host");
      if (!shadowHost) {
        shadowHost = document.createElement("div");
        shadowHost.id = "status-message-shadow-host";
        shadowHost.style.position = "fixed";
        shadowHost.style.bottom = "0";
        shadowHost.style.left = "0";
        shadowHost.style.width = "100%";
        shadowHost.style.zIndex = "9999";
        shadowHost.style.pointerEvents = "none";
        document.body.appendChild(shadowHost);

        const shadowRoot = shadowHost.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = `
          #message-container {
            text-align: center;
            width: 100%;
          }
          .message {
            background-color: var(--message-bg-color, green);
            color: white;
            padding: 9px;
            font-size: 9px;
            font-family: Arial, sans-serif;
            box-shadow: 0 -2px 5px rgba(0, 0, 0, 0.3);
            border-top: 2px solid rgba(255, 255, 255, 0.2);
          }
        `;
        shadowRoot.appendChild(style);

        const container = document.createElement("div");
        container.id = "message-container";
        shadowRoot.appendChild(container);
      }

      const container = shadowHost.shadowRoot.getElementById("message-container");
      const messageDiv = document.createElement("div");
      messageDiv.className = "message";
      messageDiv.style.setProperty("--message-bg-color", color || "green");
      messageDiv.textContent = message;

      container.appendChild(messageDiv);

      setTimeout(() => {
        messageDiv.remove();
        if (container.childElementCount === 0) {
          shadowHost.remove();
        }
      }, 2000);
    } catch (error) {
      console.error("Ошибка при отображении сообщения через Shadow DOM:", error);
    }
  }

  // Логирование запросов
  function logRequest(method, url, status, isForm = false, isResource = false) {
    try {
      const excludedUrls = [
        "https://belarus.blsspainglobal.com/assets/images",
        "https://belarus.blsspainglobal.com/assets/videos",
        "/Global/appointment/UploadApplicantPhoto",
        "/Global/appointment/GetAvailableSlotsByDate",
        "api.telegram.org",
        "apipro2.ocr.space/parse/image",
        "apipro1.ocr.space/parse/image",
        "api.apitruecaptcha.org/one/gettext",
        "api.capmonster.cloud/createTask",
        "api.capmonster.cloud/getTaskResult",
        "data:image/gif;base64",
        "data:application/octet-stream;base64",
        "api.github.com",
        "firstmail-imap-api.onrender.com/mail"
      ];
      if (excludedUrls.some((excludedUrl) => url && String(url).includes(excludedUrl))) {
        return;
      }

      // --- ФОРМЫ: показываем успех (зелёный) и ошибки (красный) ---
      if (isForm) {
        if (status === 200) {
          showMessage(`ФОРМА УСПЕШНО (${method}): ${url}`, "green");
        } else {
          showMessage(`ФОРМА ОШИБКА (${method}): ${url} (Статус: ${status})`, "red");
        }
        return;
      }

      // --- Остальные запросы ---
      if (status === 200) {
        return; // успехи не показываем
      }

      if (status === 429) {
        showMessage(`Ошибка, перенаправляем на страницу входа`, "red");
        setTimeout(() => {
          window.location.href = "https://belarus.blsspainglobal.com/Global/account/Login";
        }, 2000);
        return;
      }

      if ([502, 500, 403, 400].includes(status)) {
        showMessage(`Ошибка, обновляем страницу через 2 секунды`, "red");
        setTimeout(() => {
          location.reload();
        }, 2000);
        return;
      }

      // Прочие статусы ≠200
      showMessage(`ОШИБКА: ${method} ${url} (Статус: ${status})`, "red");

    } catch (error) {
      showMessage("Ошибка при обработке запроса", "red");
    }
  }

  // Перехват fetch
  const originalFetch = window.fetch;
  window.fetch = new Proxy(originalFetch, {
    apply(target, thisArg, args) {
      const [url, options] = args;
      const method = (options && options.method) || "GET";
      return Reflect.apply(target, thisArg, args).then((response) => {
        logRequest(method, url, response.status);
        return response;
      });
    },
  });

  // Перехват XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = new Proxy(originalOpen, {
    apply(target, thisArg, args) {
      thisArg._requestMethod = args[0];
      thisArg._requestUrl = args[1];
      return Reflect.apply(target, thisArg, args);
    },
  });

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = new Proxy(originalSend, {
    apply(target, thisArg, args) {
      thisArg.addEventListener("load", function () {
        logRequest(this._requestMethod, this._requestUrl, this.status);
      });
      return Reflect.apply(target, thisArg, args);
    },
  });

  // Перехват отправки форм
  document.addEventListener("submit", (event) => {
    const form = event.target;
    const method = (form.method || "GET").toUpperCase();
    const action = form.action || window.location.href;

    // Псевдо-статус: валидна → 200, иначе → 400
    const formStatus = form.checkValidity() ? 200 : 400;
    logRequest(method, action, formStatus, true);
  });

  // Перехват загрузки ресурсов
  const resourceTypes = ["img", "script", "link"];
  resourceTypes.forEach((type) => {
    document.addEventListener(
      "error",
      (event) => {
        if (event.target.tagName && event.target.tagName.toLowerCase() === type) {
          const url = event.target.src || event.target.href;
          showMessage(`ОШИБКА РЕСУРСА: ${url}`, "red");
          logRequest("LOAD", url, 404, false, true);
        }
      },
      true
    );

    document.addEventListener(
      "load",
      (event) => {
        if (event.target.tagName && event.target.tagName.toLowerCase() === type) {
          const url = event.target.src || event.target.href;
          // успешные ресурсы не показываем
          logRequest("LOAD", url, 200, false, true);
        }
      },
      true
    );
  });
})();
