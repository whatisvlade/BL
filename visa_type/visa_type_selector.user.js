// ==UserScript==
// @name         visa_type_selector
// @namespace    http://tampermonkey.net/
// @version      2025-03-13
// @description  Select dropdowns, handle modals (NationalVisaModal hide manually, PremiumTypeModel waits with delay and Accept). Submit after all dropdowns selected.
// @author       You
// @match        https://appointment.thespainvisa.com/Global/Appointment/VisaType*
// @grant        none
// ==/UserScript==

$(document).ready(async function () {
  observeNationalVisaModal();
  await waitForPremiumAccept(); // обработка модалки сразу при загрузке
  await runScript();            // основной выбор dropdown'ов
});

// Наблюдение за NationalVisaModal (скрытие вручную)
function observeNationalVisaModal() {
  const observer = new MutationObserver(() => {
    const $modal = $('#NationalVisaModal.modal.show');
    if ($modal.length && $modal.is(':visible')) {
      console.log('На экране — NationalVisaModal. Закрытие вручную.');
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

// Ожидание появления и закрытия PremiumTypeModel с задержкой и нажатием Accept
function waitForPremiumAccept(timeout = 10000, delayBeforeClick = 1000) {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const observer = new MutationObserver(() => {
      const $premiumModal = $('#PremiumTypeModel.modal.show');
      if ($premiumModal.length && $premiumModal.is(':visible')) {
        console.log('Появилось окно PremiumTypeModel');

        const $acceptBtn = $premiumModal.find('.modal-footer .btn-success');
        if ($acceptBtn.length) {
          setTimeout(() => {
            $acceptBtn.click();
            console.log('Кнопка Accept нажата после задержки ' + delayBeforeClick + 'мс');
          }, delayBeforeClick);
        }
      }

      // Когда модалка исчезла — продолжаем
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
        console.warn("PremiumTypeModel не появился за отведённое время");
        resolve(); // продолжаем даже без окна
      }
    }, timeout);
  });
}

// --- Вспомогательные функции ---
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
      if (!ownsId) throw new Error("Атрибут aria-owns не найден");

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

      if (!selectedOption) throw new Error('Не найдено значение в dropdown');

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

// --- Главный сценарий ---
async function runScript() {
  try {
    const options = [
      ['Islamabad', 'Premium'],
      ['Islamabad', 'National Visa/ Long Term Visa'],
      ['National Visa/ Long Term Visa', 'Other National   Visa'],
      ['Other National   Visa', 'Premium']
    ];

    for (const optionGroup of options) {
      await openDropdownAndSelect(optionGroup);
      await waitForPremiumAccept(); // ждём, пока окно Accept исчезнет (или не появится)
    }

    const $btnSubmitRaw = await waitForElementPromise('#btnSubmit', 100);
    const $btnSubmit = $btnSubmitRaw.first();
    $btnSubmit.click();
    console.log("Кнопка Submit нажата");
  } catch (error) {
    console.error("Ошибка в runScript:", error);
  }
}
