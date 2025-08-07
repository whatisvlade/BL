// ==UserScript==
// @name         strategy_random_date_random_time
// @namespace    http://tampermonkey.net/
// @version      2025-02-08
// @description  Скрипт для работы в Mozilla Firefox с Tampermonkey. Автоматизация выбора даты и перехода по календарю с отслеживанием статуса запросов.
// @author       You
// @match        https://appointment.thespainvisa.com/Global/Appointment/SlotSelection*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // URL, который нужно отслеживать
  const targetUrl = "/Global/appointment/GetAvailableSlotsByDate";

  let submitButtonClicked = false;
  let overlayCheckTimer = null;
  let dateSelected = false; // Флаг, указывающий, была ли выбрана дата

  function showMessage(message, color) {
    // Удаляем старое сообщение, если оно есть
    const existingMessage = document.getElementById("status-message");
    if (existingMessage) {
      existingMessage.remove();
    }

    const messageDiv = document.createElement("div");
    messageDiv.id = "status-message";
    messageDiv.style.position = "fixed";
    messageDiv.style.top = "0";
    messageDiv.style.left = "0";
    messageDiv.style.width = "100%";
    messageDiv.style.zIndex = "9999";
    messageDiv.style.backgroundColor = color || "red";
    messageDiv.style.color = "white";
    messageDiv.style.textAlign = "center";
    messageDiv.style.padding = "10px";
    messageDiv.style.fontSize = "18px";
    messageDiv.style.fontWeight = "bold";
    messageDiv.style.fontFamily = "Arial, sans-serif";
    messageDiv.textContent = message;

    document.body.appendChild(messageDiv);

    // Выводим сообщение также в консоль для отладки
    console.log("[MESSAGE] " + message);

    // Убираем сообщение через 10 секунд, если это не сообщение об ошибке
    if (color !== "red" && color !== "orange") {
      setTimeout(() => {
        if (messageDiv && messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 2000);
    }
  }

  // Функция для проверки, скрыт ли оверлей
  function checkIfOverlayHidden() {
    const overlay = document.getElementById('global-overlay');
    if (!overlay) {
      console.log("Оверлей не найден на странице");
      return true;
    }

    const style = window.getComputedStyle(overlay);
    const isHidden = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';

    console.log("Проверка оверлея: display=" + style.display + ", visibility=" + style.visibility + ", opacity=" + style.opacity);
    console.log("Оверлей скрыт: " + isHidden);

    return isHidden;
  }

  // Функция для проверки наличия слотов времени
  function checkIfTimeSlotsAvailable() {
    const $slots = $(".slot-item.bg-success").filter(":visible");
    const slotsAvailable = $slots.length > 0;
    console.log("Доступные слоты времени: " + slotsAvailable + " (количество: " + $slots.length + ")");
    return slotsAvailable;
  }

  // Функция для запуска таймера проверки оверлея
  function startOverlayCheckTimer() {
    // Очищаем предыдущий таймер, если он был
    if (overlayCheckTimer) {
      clearTimeout(overlayCheckTimer);
      overlayCheckTimer = null;
    }

    console.log("Запущен таймер проверки оверлея (5 секунд)");
    showMessage("Waiting for time slots to load...", "blue");

    // Устанавливаем новый таймер на 5 секунд
    overlayCheckTimer = setTimeout(() => {
      console.log("Сработал таймер проверки оверлея");

      // Проверяем, не был ли таймер остановлен
      if (!overlayCheckTimer) {
        console.log("Таймер был остановлен, прерываем выполнение");
        return;
      }

      // Проверяем, скрыт ли оверлей
      const isOverlayHidden = checkIfOverlayHidden();

      // Проверяем, появились ли слоты времени
      const areSlotsAvailable = checkIfTimeSlotsAvailable();

      if (!isOverlayHidden || !areSlotsAvailable) {
        showMessage("Problem loading data. Redirecting to login page...", "orange");
        console.log("Оверлей не скрылся или слоты времени не появились в течение 5 секунд");
        redirectToLoginPage();
      } else {
        console.log("Оверлей скрыт и слоты времени доступны, продолжаем выполнение");
        showMessage("Data loaded successfully!", "green");
      }
    }, 5000);
  }

  // Функция для остановки таймера проверки оверлея
  function stopOverlayCheckTimer() {
    if (overlayCheckTimer) {
      clearTimeout(overlayCheckTimer);
      overlayCheckTimer = null;
      console.log("Таймер проверки оверлея остановлен");
    }
  }

  function runWhenOverlayHidden(callback) {
    const overlay = document.getElementById('global-overlay');
    if (!overlay) {
      console.log("runWhenOverlayHidden: оверлей не найден, выполняем callback");
      callback();
      return;
    }

    const currentDisplay = window.getComputedStyle(overlay).display;
    console.log("runWhenOverlayHidden: текущий display оверлея = " + currentDisplay);

    if (currentDisplay === 'none') {
      console.log("runWhenOverlayHidden: оверлей скрыт, выполняем callback");
      callback();
    } else {
      console.log("runWhenOverlayHidden: оверлей виден, устанавливаем наблюдатель");
      const observer = new MutationObserver(() => {
        const newDisplay = window.getComputedStyle(overlay).display;
        console.log("runWhenOverlayHidden: изменение display оверлея = " + newDisplay);
        if (newDisplay === 'none') {
          console.log("runWhenOverlayHidden: оверлей скрылся, отключаем наблюдатель и выполняем callback");
          observer.disconnect();
          callback();
        }
      });
      observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });
    }
  }

  function waitForElementPromise(selector, timeout) {
    return new Promise((resolve, reject) => {
      timeout = timeout || 0;
      const intervalTime = 0;
      let elapsed = 0;
      const timer = setInterval(() => {
        const $elems = $(selector).filter(':visible');
        if ($elems.length > 0) {
          clearInterval(timer);
          resolve($elems);
        }
        elapsed += intervalTime;
        if (elapsed >= timeout) {
          clearInterval(timer);
          reject(new Error('Timeout waiting for element: ' + selector));
        }
      }, intervalTime);
    });
  }

  function waitForDropdownToOpen($dropdown, timeout = 0) {
    return new Promise((resolve) => {
      const intervalTime = 0;
      let elapsed = 0;
      const timer = setInterval(() => {
        if ($dropdown.attr("aria-expanded") === "true") {
          clearInterval(timer);
          resolve();
        }
        elapsed += intervalTime;
        if (elapsed >= timeout) {
          clearInterval(timer);
          resolve();
        }
      }, intervalTime);
    });
  }

  function waitForDropdownToClose($dropdown, timeout = 0) {
    return new Promise((resolve) => {
      const intervalTime = 0;
      let elapsed = 0;
      const timer = setInterval(() => {
        if ($dropdown.attr("aria-expanded") === "false") {
          clearInterval(timer);
          resolve();
        }
        elapsed += intervalTime;
        if (elapsed >= timeout) {
          clearInterval(timer);
          resolve();
        }
      }, intervalTime);
    });
  }

  function clickElement(element) {
    if (element) {
      element.click();
    }
  }

  function findAndOpenCalendar(callback) {
    runWhenOverlayHidden(() => {
      waitForElementPromise(".k-widget.k-datepicker", 0)
        .then($calendarWidgets => {
          const $targetWidget = $calendarWidgets.first();
          runWhenOverlayHidden(() => {
            const $calendarButton = $targetWidget.find(".k-select");
            if ($calendarButton.length) {
              clickElement($calendarButton.get(0));
            } else {
              throw new Error("Не найден элемент открытия календаря");
            }
            runWhenOverlayHidden(() => {
              callback($targetWidget);
            });
          });
        })
        .catch(error => {
          callback(null);
        });
    });
  }

  function waitForCalendarToLoad(callback, timeout = 0) {
    runWhenOverlayHidden(() => {
      waitForElementPromise(".k-calendar-view table", timeout)
        .then($table => {
          callback($table);
        })
        .catch(error => {
          callback(null);
        });
    });
  }

  function goToNextMonth(callback) {
    runWhenOverlayHidden(() => {
      waitForElementPromise(".k-calendar .k-nav-next", 0)
        .then($nextButtons => {
          const $nextButton = $nextButtons.first();
          if (!$nextButton.hasClass("k-state-disabled")) {
            clickElement($nextButton.get(0));
            runWhenOverlayHidden(callback);
          } else {
            callback();
          }
        })
        .catch(error => {
          callback();
        });
    });
  }

  function findAvailableDatesInRange(startDate, endDate) {
    const availableDates = [];
    const $calendarTable = $(".k-calendar-view table").filter(":visible");
    if ($calendarTable.length) {
      $calendarTable.find('td[role="gridcell"]').each(function () {
        const $cell = $(this);
        const $link = $cell.find("a");
        const dateText = $link.text().trim();
        const day = parseInt(dateText, 10);
        if (
          $link.length &&
          !$cell.hasClass("k-state-disabled") &&
          !$cell.hasClass("k-other-month") &&
          day >= startDate &&
          day <= endDate
        ) {
          availableDates.push(dateText);
        }
      });
    }
    return availableDates;
  }

  // Получаем индекс на основе времени с небольшим сдвигом и перемешиваем массив
  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function getTimeBasedIndex(arrayLength) {
    const now = new Date();
    // Добавим смещение по миллисекундам и дню месяца, чтобы индекс менялся сильнее
    const seed = now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() + now.getDate();
    return arrayLength > 0 ? seed % arrayLength : 0;
  }

  function selectAvailableDateInRange(startDate, endDate) {
    let availableDates = findAvailableDatesInRange(startDate, endDate);
    if (availableDates.length > 0) {
      availableDates = shuffleArray(availableDates);
      const indexToSelect = getTimeBasedIndex(availableDates.length);
      const dateToSelect = availableDates[indexToSelect];
      selectDate(dateToSelect);
      console.log("Дата выбрана (адаптированный time-based):", dateToSelect);
      dateSelected = true;

      startOverlayCheckTimer();
    } else {
      console.log("Нет доступных дат в указанном диапазоне");
    }
  }


  function selectDate(date) {
    const $calendarTable = $(".k-calendar-view table").filter(":visible");
    if ($calendarTable.length) {
      const $targetCell = $calendarTable.find('td[role="gridcell"]').filter(function () {
        const $link = $(this).find("a");
        return (
          $link.length &&
          $link.text().trim() === date &&
          !$(this).hasClass("k-state-disabled") &&
          !$(this).hasClass("k-other-month")
        );
      }).first();
      if ($targetCell.length) {
        const link = $targetCell.find("a").get(0);
        clickElement(link);
        console.log("Дата выбрана:", date);
      } else {
        console.log("Дата не найдена или недоступна:", date);
      }
    } else {
      console.log("Не удалось найти календарь");
    }
  }

  function findAndOpenDropdown(callback) {
    // Останавливаем таймер проверки оверлея, так как если мы дошли до этого шага,
    // значит оверлей успешно скрылся после выбора даты
    stopOverlayCheckTimer();

    runWhenOverlayHidden(() => {
      waitForElementPromise(".k-widget.k-dropdown", 0)
        .then($dropdowns => {
          const $dropdown = $dropdowns.first();
          runWhenOverlayHidden(() => {
            const $arrowIcon = $dropdown.find(".k-select .k-icon.k-i-arrow-60-down");
            if ($arrowIcon.length) {
              clickElement($arrowIcon.get(0));
              waitForDropdownToOpen($dropdown).then(() => {
                runWhenOverlayHidden(() => {
                  callback($dropdown);
                });
              });
            } else {
              throw new Error("Не найден элемент для открытия dropdown");
            }
          });
        })
        .catch(error => {
          callback(null);
        });
    });
  }

  function selectAvailableTimeSlot() {
    const $slots = $(".slot-item.bg-success").filter(":visible");
    if ($slots.length) {
      const $lastSlot = $slots.last();
      clickElement($lastSlot.get(0));
      console.log("Слот времени выбран:", $($lastSlot).text().trim());
    } else {
      console.log("Не найдено доступных слотов времени");
      redirectToLoginPage();
    }
  }

  function redirectToLoginPage() {
    console.log("Переход на страницу входа...");
    window.location.href = "https://appointment.thespainvisa.com/Global/account/Login";
  }

  function submitSlotSelection() {
    const $submitButton = $("#btnSubmit").filter(":visible");
    if ($submitButton.length) {
      // Останавливаем таймер проверки оверлея перед нажатием кнопки Submit
      stopOverlayCheckTimer();
      console.log("Таймер проверки оверлея остановлен перед нажатием Submit");

      clickElement($submitButton.get(0));
      submitButtonClicked = true;
      console.log("Кнопка Submit нажата");
    } else {
      console.log("Кнопка Submit не найдена");
    }
  }

  function openAndSelectDateAndSlot() {
    const startDate = {{ START_DATE }};
    const endDate = {{ END_DATE }};

    runWhenOverlayHidden(() => {
      findAndOpenCalendar(function($calendarWidget) {
        if (!$calendarWidget) {
          redirectToLoginPage();
          return;
        }
        waitForCalendarToLoad(function($table) {
          if (!$table) {
            redirectToLoginPage();
            return;
          }
          goToNextMonth(function() {
            runWhenOverlayHidden(function() {
              selectAvailableDateInRange(startDate, endDate);
              console.log("После выбора даты: ожидаем скрытия оверлея");

              if (findAvailableDatesInRange(startDate, endDate).length === 0) {
                console.log("Нет доступных дат в следующем месяце");
                redirectToLoginPage();
                return;
              }

              findAndOpenDropdown(function($dropdown) {
                if (!$dropdown) {
                  redirectToLoginPage();
                  return;
                }
                runWhenOverlayHidden(() => {
                  const $availableSlots = $(".slot-item.bg-success").filter(":visible");
                  if ($availableSlots.length > 0) {
                    selectAvailableTimeSlot();
                    submitSlotSelection();
                  } else {
                    console.log("Не найдено доступных слотов времени");
                    window.location.reload();
                  }
                });
              });
            });
          });
        });
      });
    });

    // Дополнительная проверка через 10 секунд после запуска скрипта
    setTimeout(() => {
      if (dateSelected && !checkIfTimeSlotsAvailable()) {
        showMessage("Time slots did not appear. Redirecting to login page...", "red");
        console.log("Дополнительная проверка: слоты времени не появились в течение 10 секунд");
        redirectToLoginPage();
      }
    }, 150000);
  }

  // Перехват fetch-запросов для отслеживания статуса
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [resource, config] = args;

    // Проверяем, содержит ли URL целевой путь
    if (resource.includes(targetUrl)) {
      console.log("Отправлен запрос к:", resource);
    }

    // Выполняем оригинальный fetch
    const response = await originalFetch(...args);

    // Проверяем, относится ли ответ к целевому URL
    if (resource.includes(targetUrl)) {
      console.log("Ответ на запрос к:", resource);
      console.log("Код статуса:", response.status);

      if (response.status === 200) {
        // Если статус 200, показываем сообщение об успехе
        showMessage("Date selected successfully!", "green");
      } else if (response.status === 429) {
        // Если статус 429, показываем сообщение о блокировке и переходим на страницу входа
        showMessage("IP BLOCKED. Redirecting to login page...", "orange");
        console.error(`Ошибка: код статуса ${response.status} для URL:`, resource);
        setTimeout(() => {
          redirectToLoginPage();
        }, 2000);
      } else if (response.status === 500 || response.status === 502) {
        // Если статус 500 или 502, показываем сообщение об ошибке и переходим на страницу входа
        showMessage("Server error, redirecting to login page", "red");
        console.error(`Ошибка: код статуса ${response.status} для URL:`, resource);
        setTimeout(() => {
          redirectToLoginPage();
        }, 2000);
      } else {
        // Для всех остальных статусов, кроме 200, 429, 500 и 502, показываем сообщение об ошибке
        showMessage("An error occurred, redirecting to login page", "red");
        console.error(`Ошибка: код статуса ${response.status} для URL:`, resource);
        setTimeout(() => {
          redirectToLoginPage();
        }, 2000);
      }
    }

    return response;
  };

  // Перехват XMLHttpRequest для отслеживания статуса
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    // Проверяем, содержит ли URL целевой путь
    if (url.includes(targetUrl)) {
      console.log("Отправлен запрос через XMLHttpRequest к:", url);
    }

    this.addEventListener("readystatechange", function() {
      // Проверяем, относится ли ответ к целевому URL
      if (url.includes(targetUrl) && this.readyState === 4) { // readyState 4 означает, что запрос завершен
        console.log("Ответ на запрос через XMLHttpRequest к:", url);
        console.log("Код статуса:", this.status);

        if (this.status === 200) {
          // Если статус 200, показываем сообщение об успехе
          showMessage("Date selected successfully!", "green");
        } else if (this.status === 429) {
          // Если статус 429, показываем сообщение о блокировке и переходим на страницу входа
          showMessage("IP BLOCKED. Redirecting to login page...", "orange");
          console.error(`Ошибка: код статуса ${this.status} для URL:`, url);
          setTimeout(() => {
            redirectToLoginPage();
          }, 2000);
        } else if (this.status === 500 || this.status === 502) {
          // Если статус 500 или 502, показываем сообщение об ошибке и переходим на страницу входа
          showMessage(" Server error, redirecting to login page", "red");
          console.error(`Ошибка: код статуса ${this.status} для URL:`, url);
          setTimeout(() => {
            redirectToLoginPage();
          }, 2000);
        } else {
          // Для всех остальных статусов, кроме 200, 429, 500 и 502, показываем сообщение об ошибке
          showMessage("An error occurred, redirecting to login page", "red");
          console.error(`Ошибка: код статуса ${this.status} для URL:`, url);
          setTimeout(() => {
            redirectToLoginPage();
          }, 2000);
        }
      }
    });

    // Вызываем оригинальный метод open
    originalOpen.call(this, method, url, ...rest);
  };

  // Запускаем основную функцию
  openAndSelectDateAndSlot();

})();

