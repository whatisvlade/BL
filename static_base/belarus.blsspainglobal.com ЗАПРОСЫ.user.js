// ==UserScript==
// @name         belarus.blsspainglobal.com ЗАПРОСЫ
// @namespace    http://tampermonkey.net/
// @version      4.5
// @description  Логирование запросов (XHR, Fetch, формы, ресурсы, WebSocket) и событий навигации с использованием Shadow DOM. Сообщения на всю ширину экрана.
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
        "/Global/appointment/UploadApplicantPhoto",
        "/Global/appointment/GetAvailableSlotsByDate",
        "api.telegram.org",
        "data:image/gif;base64",
        "apipro2.ocr.space/parse/image",
        "apipro1.ocr.space/parse/image",
        "data:application/octet-stream;base64",
        "api.github.com"
      ];

      if (excludedUrls.some((excludedUrl) => url.includes(excludedUrl))) {
        return;
      }

      const successColors = { GET: "blue", POST: "green", PUT: "purple", DELETE: "orange" };

      if (status === 200) {
        if (!isForm && !isResource) {
          const color = successColors[method] || "green";
          showMessage(`УСПЕШНО (${method}): ${url}`, color);
        }
      } else if (status === 429) {
        showMessage(`Ошибка, перенаправляем на страницу входа`, "red");
        setTimeout(() => {
          window.location.href = "https://belarus.blsspainglobal.com/Global/account/Login?returnUrl=%2FGlobal%2Fappointment%2Fnewappointment&err=K7LYPi%2FpJtiLxj0JgYMBPVTdQ5hDdq9IVd7ALDT6sMo%3D";
        }, 2000);
      } else if ([502, 500, 403, 400].includes(status)) {
        showMessage(`Ошибка, обновляем страницу через 2 секунды`, "red");
        setTimeout(() => {
          location.reload();
        }, 2000);
      } else {
        showMessage(`ОШИБКА: ${method} ${url} (Статус: ${status})`, "red");
      }
    } catch (error) {
      showMessage("Ошибка при обработке запроса", "red");
    }
  }

  // Перехват fetch через Proxy
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

  // Перехват XMLHttpRequest через Proxy
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
    const method = form.method.toUpperCase() || "GET";
    const action = form.action || window.location.href;
    showMessage(`ФОРМА (${method}): ${action}`, "teal");

    // Логирование статуса отправки формы
    const formStatus = form.checkValidity() ? 200 : 400; // Пример статуса
    logRequest(method, action, formStatus, true); // Указываем, что это форма
  });

  // Перехват загрузки ресурсов
  const resourceTypes = ["img", "script", "link"];
  resourceTypes.forEach((type) => {
    document.addEventListener(
      "error",
      (event) => {
        if (event.target.tagName.toLowerCase() === type) {
          const url = event.target.src || event.target.href;
          showMessage(`ОШИБКА РЕСУРСА: ${url}`, "red");
          logRequest("LOAD", url, 404, false, true); // Указываем, что это ресурс
        }
      },
      true
    );

    document.addEventListener(
      "load",
      (event) => {
        if (event.target.tagName.toLowerCase() === type) {
          const url = event.target.src || event.target.href;
          showMessage(`РЕСУРС ЗАГРУЖЕН: ${url}`, "green");
          logRequest("LOAD", url, 200, false, true); // Указываем, что это ресурс
        }
      },
      true
    );
  });
})();