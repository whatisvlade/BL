// ==UserScript==
// @name         visa_type_selector
// @namespace    http://tampermonkey.net/
// @version      2025-03-12
// @description  Automatically selects dropdown options and submits the form.
// @author       You
// @match        https://belarus.blsspainglobal.com/Global/Appointment/VisaType*
// @match        https://appointment.blsspainrussia.ru/Global/Appointment/VisaType*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=blsspainrussia.ru
// @grant        none
// ==/UserScript==

$(document).ready(function() {
  runScript();
});

// Функция для клика по видимой радиокнопке Family
function clickFamilyRadio() {
  const familyRadio = Array.from(document.querySelectorAll('input[value="Family"]')).find(radio => {
    const rect = radio.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0; // Проверяем, что элемент видим
  });

  if (familyRadio) {
    try {
      familyRadio.click();
      familyRadio.checked = true;
      console.log('Радиокнопка Family выбрана');
      return true;
    } catch (error) {
      console.log('Ошибка при клике по радиокнопке:', error);
      return false;
    }
  }
  console.log('Видимая радиокнопка Family не найдена');
  return false;
}

// Функция ожидания появления активного модального окна и клика по Accept
async function waitForModalAndAccept() {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 50;

    const checkModal = setInterval(() => {
      attempts++;
      const modal = document.querySelector('.modal.fade.show[id="familyDisclaimer"]');
      const acceptButton = modal ? modal.querySelector('.btn.btn-success') : null;

      // Проверка, если окно активно
      if (modal && modal.style.display === 'block' && acceptButton) {
        // Фокусируемся на кнопке
        acceptButton.focus();

        // Создаем и диспатчим события
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });

        // Пробуем несколько способов клика
        acceptButton.dispatchEvent(clickEvent);
        acceptButton.click();

        // Пробуем вызвать функцию напрямую
        if (typeof window.OnFamilyAccept === 'function') {
          window.OnFamilyAccept();
        }

        console.log('Кнопка Accept нажата');

        // Проверяем закрытие модального окна
        setTimeout(() => {
          const modalStillVisible = document.querySelector('.modal.fade.show[id="familyDisclaimer"][style*="display: block"]');
          if (!modalStillVisible) {
            console.log('Модальное окно закрыто успешно');
            clearInterval(checkModal);
            resolve(true);
          }
        }, 10);
      }

      if (attempts >= maxAttempts) {
        console.log('Превышено максимальное количество попыток');
        clearInterval(checkModal);
        resolve(false);
      }
    }, 100);

    // Общий таймаут
    setTimeout(() => {
      clearInterval(checkModal);
      console.log('Таймаут ожидания модального окна');
      resolve(false);
    }, 10000);
  });
}

// Функция ожидания появления элемента по селектору
function waitForElementPromise(selector, timeout) {
  return new Promise((resolve, reject) => {
    timeout = timeout || 0;
    const intervalTime = 0;
    let elapsed = 0;
    const timer = setInterval(() => {
      const $elem = $(selector);
      if ($elem.length > 0 && $elem.is(':visible')) {
        clearInterval(timer);
        resolve($elem);
      }
      elapsed += intervalTime;
      if (elapsed >= timeout) {
        clearInterval(timer);
        reject(new Error('Timeout waiting for element: ' + selector));
      }
    }, intervalTime);
  });
}

// Функция ожидания, пока dropdown откроется
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

// Функция ожидания, пока dropdown закроется
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

// Асинхронная функция для открытия dropdown, выбора пункта и его закрытия
async function openDropdownAndSelect(optionGroup) {
  try {
    const $dropdownRaw = await waitForElementPromise('.k-widget.k-dropdown[aria-expanded="false"]:visible:not(.processed)', 0);
    const $dropdown = $dropdownRaw.first();
    if (!$dropdown.length) {
      throw new Error("Dropdown не найден");
    }

    const $arrow = $dropdown.find('.k-select .k-icon.k-i-arrow-60-down').first();
    if ($arrow.length) {
      $arrow.click(); // Открываем dropdown
      await waitForDropdownToOpen($dropdown, 0);

      const ownsId = $dropdown.attr('aria-owns');
      if (!ownsId) {
        throw new Error("Атрибут aria-owns не найден");
      }
      const listSelector = '#' + ownsId;
      const $listContainerRaw = await waitForElementPromise(listSelector, 0);
      const $listContainer = $listContainerRaw.first();

      let selectedOption = null;
      $listContainer.find('li').each(function() {
        const text = $(this).text().trim();
        if (optionGroup.includes(text)) {
          selectedOption = text; // Сохраняем первое найденное значение
          $(this).click(); // Выбираем нужную опцию
          return false; // Прерываем перебор
        }
      });

      if (!selectedOption) {
        throw new Error('Не найдено доступное значение для dropdown');
      }

      $dropdown.find('.k-dropdown-wrap').first().click();
      await waitForDropdownToClose($dropdown, 30);
      $dropdown.addClass('processed');
      console.log('Опция "' + selectedOption + '" выбрана');
    } else {
      throw new Error("Не найдена стрелка для открытия dropdown");
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// Основная асинхронная функция
async function runScript() {
  try {
    // Сначала кликаем по радиокнопке Family
    clickFamilyRadio();

    // Затем ждем, пока модальное окно появится и нажимаем Accept
    await waitForModalAndAccept();

    // Определяем последний пункт (Normal или Premium) по чётности текущей минуты
    const currentMinute = new Date().getMinutes();
    const lastOption = (currentMinute % 2 === 0) ? '{{VISA_TYPE_1}}' : '{{VISA_TYPE_2}}';

    // Массивы с возможными значениями для каждого dropdown
    const options = [
      ['Minsk', '2 Members'],      // Первый dropdown
      ['Minsk', 'Schengen Visa','2 Members'],  // Второй dropdown
      ['Schengen Visa', '2 Members'], // Третий dropdown
      ['Schengen Visa', '2 Members'], // Четвертый dropdown
      [lastOption]                 // Пятый dropdown (Normal или Premium)
    ];

    // Обрабатываем каждый dropdown, выбирая первое доступное значение из массива
    for (const optionGroup of options) {
      await openDropdownAndSelect(optionGroup);
    }

    // После выбора всех опций ожидаем появления кнопки и кликаем по ней
    const $btnSubmitRaw = await waitForElementPromise('#btnSubmit', 0);
    const $btnSubmit = $btnSubmitRaw.first();
    $btnSubmit.click();
    console.log("Кнопка была нажата");
  } catch (error) {
    console.error("Ошибка в runScript:", error);
  }
}
