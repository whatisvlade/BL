// ==UserScript==
// @name         strategy_last_date_last_time
// @namespace    http://tampermonkey.net/
// @version      2025-02-08
// @description  Скрипт для работы в Mozilla Firefox с Tampermonkey. Автоматизация выбора даты и перехода по календарю с отслеживанием статуса запросов. Добавлена фильтрация «запрещённых» дней месяца (без полного формата YYYY-MM-DD).
// @author       You
// @match        https://appointment.blsspainbelarus.by/Global/Appointment/SlotSelection*
// @match        https://belarus.blsspainglobal.com/Global/Appointment/SlotSelection*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';


    const forbiddenDates = [{{FORBIDDEN_DATES}}];
   

    
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

        console.log("[MESSAGE] " + message);

        // Убираем сообщение через 2 секунды, если это не сообщение об ошибке
        if (color !== "red" && color !== "orange") {
            setTimeout(() => {
                const el = document.getElementById("status-message");
                if (el && el.parentNode) {
                    el.remove();
                }
            }, 2000);
        }
    }

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

    function checkIfTimeSlotsAvailable() {
        const $slots = $(".slot-item.bg-success").filter(":visible");
        const slotsAvailable = $slots.length > 0;
        console.log("Доступные слоты времени: " + slotsAvailable + " (количество: " + $slots.length + ")");
        return slotsAvailable;
    }

    function startOverlayCheckTimer() {
        if (overlayCheckTimer) {
            clearTimeout(overlayCheckTimer);
            overlayCheckTimer = null;
        }

        console.log("Запущен таймер проверки оверлея (5 секунд)");
        showMessage("Ожидание загрузки слотов времени...", "blue");

        overlayCheckTimer = setTimeout(() => {
            console.log("Сработал таймер проверки оверлея");

            if (!overlayCheckTimer) {
                console.log("Таймер был остановлен, прерываем выполнение");
                return;
            }

            const isOverlayHidden = checkIfOverlayHidden();
            const areSlotsAvailable = checkIfTimeSlotsAvailable();

            if (!isOverlayHidden || !areSlotsAvailable) {
                showMessage("Проблема с загрузкой данных. Перенаправление на страницу входа...", "orange");
                console.log("Оверлей не скрылся или слоты времени не появились в течение 5 секунд");
                redirectToLoginPage();
            } else {
                console.log("Оверлей скрыт и слоты времени доступны, продолжаем выполнение");
                showMessage("Данные загружены успешно!", "green");
            }
        }, 5000);
    }

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

    // ------------------------------------------------------------------------
    // Функция поиска доступных дат в диапазоне, с учётом forbiddenDates (только номер дня)
    function findAvailableDatesInRange(startDate, endDate) {
        const availableDates = [];
        const $calendarTable = $(".k-calendar-view table").filter(":visible");
        if ($calendarTable.length) {
            $calendarTable.find('td[role="gridcell"]').each(function () {
                const $cell = $(this);
                const $link = $cell.find("a");
                const dateText = $link.text().trim(); // "5", "12", "30" и т.д.
                const day = parseInt(dateText, 10);

                // Условия:
                // 1) есть <a>
                // 2) ячейка не disabled и не часть другого месяца
                // 3) число day находится в диапазоне от startDate до endDate
                // 4) dateText (номер дня) не содержится в forbiddenDates
                if (
                    $link.length &&
                    !$cell.hasClass("k-state-disabled") &&
                    !$cell.hasClass("k-other-month") &&
                    !isNaN(day) &&
                    day >= startDate &&
                    day <= endDate &&
                    forbiddenDates.indexOf(dateText) === -1
                ) {
                    availableDates.push(dateText);
                }
            });
        }
        return availableDates; // возвращаем массив строк с номерами дней
    }
    // ------------------------------------------------------------------------

    function selectAvailableDateInRange(startDate, endDate) {
        const availableDates = findAvailableDatesInRange(startDate, endDate);
        if (availableDates.length > 0) {
            const dateToSelect = availableDates[availableDates.length - 1]; // Последняя доступная
            selectDate(dateToSelect);
            console.log("Дата выбрана:", dateToSelect);
            dateSelected = true;

            // Запускаем таймер проверки оверлея после выбора даты
            startOverlayCheckTimer();
        } else {
            console.log("Нет доступных дат в указанном диапазоне после фильтрации forbiddenDates");
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
                console.log("selectDate(): клик по дате =", date);
            } else {
                console.log("selectDate(): дата не найдена или недоступна:", date);
            }
        } else {
            console.log("selectDate(): не удалось найти календарь");
        }
    }

    function findAndOpenDropdown(callback) {
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
            console.log("selectAvailableTimeSlot(): не найдено доступных слотов времени");
            redirectToLoginPage();
        }
    }

    function redirectToLoginPage() {
        console.log("redirectToLoginPage(): перенаправление на страницу входа");
        window.location.href = "https://appointment.blsspainbelarus.by/Global/account/Login?returnUrl=%2FGlobal%2Fappointment%2Fnewappointment&err=HU7zqU0yCxX3GNnx4emgb8d%2FwA73yBclF%2B5Wi%2B0CSYM%3D";
    }

    function submitSlotSelection() {
        const $submitButton = $("#btnSubmit").filter(":visible");
        if ($submitButton.length) {
            stopOverlayCheckTimer();
            console.log("submitSlotSelection(): таймер проверки оверлея остановлен перед Submit");

            clickElement($submitButton.get(0));
            submitButtonClicked = true;
            console.log("submitSlotSelection(): нажата кнопка Submit");
        } else {
            console.log("submitSlotSelection(): кнопка Submit не найдена");
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
                            console.log("После selectAvailableDateInRange: ожидаем скрытия оверлея");

                            // Если после фильтрации forbiddenDates нет доступных дат, редиректим
                            if (findAvailableDatesInRange(startDate, endDate).length === 0) {
                                console.log("openAndSelectDateAndSlot: нет доступных дат после фильтрации forbiddenDates");
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
                                        console.log("openAndSelectDateAndSlot: нет доступных слотов времени, перезагрузка страницы");
                                        window.location.reload();
                                    }
                                });
                            });
                        });
                    });
                });
            });
        });

        // Через 25 секунд проверяем, если дата выбрана, но слоты не появились — редирект
        setTimeout(() => {
            if (dateSelected && !checkIfTimeSlotsAvailable()) {
                showMessage("Слоты времени не появились. Перенаправление на страницу входа...", "red");
                console.log("openAndSelectDateAndSlot: 25 секунд истекли, слотов нет");
                redirectToLoginPage();
            }
        }, 155000);
    }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [resource, config] = args;
        if (resource.includes(targetUrl)) {
            console.log("fetch -> запрос к:", resource);
        }
        const response = await originalFetch(...args);
        if (resource.includes(targetUrl)) {
            console.log("fetch -> ответ с кодом", response.status, "для", resource);
            if (response.status === 200) {
                showMessage("Дата выбрана успешно!", "green");
            } else if (response.status === 429) {
                showMessage("АЙПИ ЗАБЛОКИРОВАН. Переход на страницу входа...", "orange");
                console.error("fetch ошибка 429 для", resource);
                setTimeout(redirectToLoginPage, 2000);
            } else if (response.status === 500 || response.status === 502) {
                showMessage("Ошибка сервера, переход на страницу входа", "red");
                console.error("fetch ошибка сервера", response.status, "для", resource);
                setTimeout(redirectToLoginPage, 2000);
            } else {
                showMessage("Произошла ошибка, переход на страницу входа", "red");
                console.error("fetch ошибка", response.status, "для", resource);
                setTimeout(redirectToLoginPage, 2000);
            }
        }
        return response;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        if (url.includes(targetUrl)) {
            console.log("XHR -> запрос к:", url);
        }
        this.addEventListener("readystatechange", function() {
            if (url.includes(targetUrl) && this.readyState === 4) {
                console.log("XHR -> ответ с кодом", this.status, "для", url);
                if (this.status === 200) {
                    showMessage("Дата выбрана успешно!", "green");
                } else if (this.status === 429) {
                    showMessage("АЙПИ ЗАБЛОКИРОВАН. Переход на страницу входа...", "orange");
                    console.error("XHR ошибка 429 для", url);
                    setTimeout(redirectToLoginPage, 2000);
                } else if (this.status === 500 || this.status === 502) {
                    showMessage("Ошибка сервера, переход на страницу входа", "red");
                    console.error("XHR ошибка сервера", this.status, "для", url);
                    setTimeout(redirectToLoginPage, 2000);
                } else {
                    showMessage("Произошла ошибка, переход на страницу входа", "red");
                    console.error("XHR ошибка", this.status, "для", url);
                    setTimeout(redirectToLoginPage, 2000);
                }
            }
        });
        originalOpen.call(this, method, url, ...rest);
    };

    openAndSelectDateAndSlot();

})();

