// ==UserScript==
// @name         visa_type_selector
// @namespace    http://tampermonkey.net/
// @version      2025-08-07
// @description  Выбирает значения в выпадающих списках. Категория Premium или Normal выбирается по чётности текущей минуты. Обрабатывает модальные окна. Нажимает Submit после выбора.
// @author       You
// @match        https://appointment.thespainvisa.com/Global/Appointment/VisaType*
// @grant        none
// ==/UserScript==

$(document).ready(async function () {
  observeNationalVisaModal();
  await waitForPremiumAccept(); // обработка модалки при загрузке
  await runScript();            // основной сценарий
});

// Закрытие NationalVisaModal вручную
function observeNationalVisaModal() {
  const observer = new MutationObserver(() => {
    const $modal = $('#NationalVisaModal.modal.show');
    if ($modal.length && $modal.is(':visible')) {
      console.log('Закрываем NationalVisaModal вручную.');
      $modal.removeClass('show').addClass('fade').css('display', 'none');
      $('body').removeClass('modal-open');
      $('.modal-backdrop').remove();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });
}

// Ожидание модалки PremiumTypeModel и нажатие Accept
function waitForPremiumAccept(timeout = 10000, delayBeforeClick = 1000) {
  return new Promise((resolve) => {
    let resolved = false;

    const observer = new MutationObserver(() => {
      const $modal = $('#PremiumTypeModel.modal.show');
      if ($modal.length && $modal.is(':visible')) {
        console.log('Обнаружено окно PremiumTypeModel');
        const $accept = $modal.find('.modal-footer .btn-success');
        if ($accept.length) {
          setTimeout(() => {
            $accept.click();
            console.log('Кнопка Accept нажата через ' + delayBeforeClick + 'мс');
          }, delayBeforeClick);
        }
      }

      if ($('#PremiumTypeModel').length && !$('#PremiumTypeModel').hasClass('show')) {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve();
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        console.warn("Окно PremiumTypeModel не появилось за " + timeout + "мс");
        resolve();
      }
    }, timeout);
  });
}

// Вспомогательные функции ожидания
function waitForElementPromise(selector, timeout = 0) {
  return new Promise((resolve, reject) => {
    const intervalTime = 10;
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
        reject(new Error('Таймаут ожидания элемента: ' + selector));
      }
    }, intervalTime);
  });
}

function waitForDropdownToOpen($dropdown, timeout = 30) {
  return new Promise((resolve) => {
    const intervalTime = 30;
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

function waitForDropdownToClose($dropdown, timeout = 30) {
  return new Promise((resolve) => {
    const intervalTime = 10;
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

// Выбор из dropdown'ов
async function openDropdownAndSelect(optionGroup) {
  try {
    const $dropdownRaw = await waitForElementPromise('.k-widget.k-dropdown[aria-expanded="false"]:visible:not(.processed)', 30);
    const $dropdown = $dropdownRaw.first();
    if (!$dropdown.length) throw new Error("Dropdown не найден");

    const $arrow = $dropdown.find('.k-select .k-icon.k-i-arrow-60-down').first();
    if ($arrow.length) {
      $arrow.click();
      await waitForDropdownToOpen($dropdown, 30);

      const ownsId = $dropdown.attr('aria-owns');
      if (!ownsId) throw new Error("Нет aria-owns у dropdown");

      const $listContainerRaw = await waitForElementPromise('#' + ownsId, 30);
      const $listContainer = $listContainerRaw.first();

      let selectedOption = null;
      $listContainer.find('li').each(function () {
        const text = $(this).text().trim();
        if (optionGroup.includes(text)) {
          selectedOption = text;
          $(this).click();
          return false;
        }
      });

      if (!selectedOption) throw new Error('Не найдено подходящее значение');

      $dropdown.find('.k-dropdown-wrap').first().click();
      await waitForDropdownToClose($dropdown, 30);
      $dropdown.addClass('processed');
      console.log('Выбрана опция "' + selectedOption + '"');
    } else {
      throw new Error("Не найдена стрелка раскрытия");
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// Главный сценарий
async function runScript() {
  try {
    const currentMinute = new Date().getMinutes();
    const visaCategory = currentMinute % 2 === 0 ? '{{VISA_TYPE_1}}' : '{{VISA_TYPE_2}}';
    console.log(`Минутa: ${currentMinute} — выбрана категория: ${visaCategory}`);

    const options = [
      ['{{CITY}}', visaCategory],
      ['{{CITY}}', 'National Visa/ Long Term Visa', '{{CATEGORY}}'],
      ['National Visa/ Long Term Visa', visaCategory, '{{CATEGORY}}'], // <- сюда подставляется Premium или Normal
      ['{{CATEGORY}}', visaCategory]
    ];

    for (const optionGroup of options) {
      await openDropdownAndSelect(optionGroup);
      await waitForPremiumAccept();
    }

    const $btnSubmitRaw = await waitForElementPromise('#btnSubmit', 100);
    const $btnSubmit = $btnSubmitRaw.first();
    $btnSubmit.click();
    console.log("Кнопка Submit нажата");
  } catch (error) {
    console.error("Ошибка в runScript:", error);
  }
}


