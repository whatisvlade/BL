// ==UserScript==
// @name         bls-spain-2.0-test
// @namespace    http://tampermonkey.net/
// @version      2025-03-12
// @description  Автоматизация логина и взаимодействия с iframe. Если loading mask не исчезает — обновляем страницу. Кнопки управления вынесены в отдельный скрипт.
// @author       You
// @match        https://appointment.thespainvisa.com/Global/Appointment/AppointmentCaptcha*
// @match        https://appointment.thespainvisa.com/Global/appointment/appointmentcaptcha*
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js
// @require      https://docs.opencv.org/5.0.0-alpha/opencv.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

$(document).ready(function () {
    waitForLoadingMaskToDisappear(() => {
        console.log('Loading завершен.');
        findVisibleDivLikeDevAbilities();
        analyzeAndSelectCaptchaImages(false)
    });
  });
  let submitClicked = false;
  let CURRENT_NUMBER = undefined;
  let resultPositions = [];

  // Функция ожидания исчезновения loading-mask
  function waitForLoadingMaskToDisappear(callback) {
    const interval = setInterval(() => {
        const loadingMask = document.querySelector('.k-loading-mask');
        const capchaContainer = document.querySelector('.main-div-container');
        const preloaderStyle = document.querySelector('.preloader').getAttribute('style');
        console.log(capchaContainer)
        if (!loadingMask && capchaContainer && preloaderStyle) {
            clearInterval(interval);
            callback();
        }
    }, 700);
  }

  // Функция для поиска видимого div внутри iframe
  function findVisibleDivLikeDevAbilities() {

    try {
        const divs = document.querySelectorAll('div[class^="col-12 box-label"]');
        console.log(divs)

        for (const div of divs) {
            const rect = div.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2; // Центр элемента по оси X
            const centerY = rect.top + rect.height / 2; // Центр элемента по оси Y

            // Определяем элемент, который виден в точке (центр div)
            const elementAtPoint = document.elementFromPoint(centerX, centerY);

            if (elementAtPoint === div) {
                let text = div.textContent.trim();
                console.log(text)

                // Заменяем фразу "Please select all boxes with number" на "Выберите картинки с числом"
                text = text.replace('Please select all boxes with number', 'Waiting for recognition');

                // Заменяем число внутри текста на выделенное
                const numberMatch = text.match(/\d+/);
                console.log(numberMatch)
                if (numberMatch) {
                    const number = numberMatch[0];
                    CURRENT_NUMBER = number;
                    text = text.replace(number, `<span style="color: green; font-weight: bold; font-size: 1.5em;">${number}</span>`);
                }

                div.innerHTML = text; // Обновляем текст внутри div
                return;
            }
        }
    } catch (error) {
        // Ошибка при доступе к содержимому iframe
    }
  }

//Функции распознавания капчи

function isElementVisible(element, doc) {
        if (!element) return false;

        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1 || element.offsetWidth <= 0 || element.offsetHeight <= 0) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) {
            return false;
        }

        if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
            return false;
        }

        const points = [
            {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2},
            {x: rect.left + rect.width / 4, y: rect.top + rect.height / 4},
            {x: rect.right - rect.width / 4, y: rect.top + rect.height / 4},
            {x: rect.left + rect.width / 4, y: rect.bottom - rect.height / 4},
            {x: rect.right - rect.width / 4, y: rect.bottom - rect.height / 4}
        ];

        let visiblePoints = 0;
        for (const point of points) {
            const elementAtPoint = doc.elementFromPoint(point.x, point.y);
            if (elementAtPoint && (element === elementAtPoint || element.contains(elementAtPoint) || elementAtPoint.contains(element))) {
                visiblePoints++;
            }
        }

        return visiblePoints >= 3;
    }

    function findAllPotentialCaptchaImages(doc) {
        const allElements = doc.querySelectorAll('*');
        const potentialImages = [];

        for (const el of allElements) {
            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;

            const style = window.getComputedStyle(el);
            let hasImage = false;
            let imageType = '';
            let imageSrc = '';

            if (el.tagName === 'IMG' && el.src) {
                hasImage = true;
                imageType = 'img';
                imageSrc = el.src;
            } else if (style.backgroundImage && style.backgroundImage !== 'none' && !style.backgroundImage.includes('gradient')) {
                hasImage = true;
                imageType = 'background';
                imageSrc = style.backgroundImage.slice(5, -2); // Извлечение URL
            }

            const hasCaptchaClass = el.className.includes('captcha-img') || el.className.includes('img-') || el.closest('.captcha-img') !== null;
            const hasPointerCursor = style.cursor === 'pointer';
            const hasBorder = style.border && style.border !== 'none' && !style.border.includes('0px');
            const hasAzureBackground = style.backgroundColor === 'azure' || style.backgroundColor === 'rgb(240, 255, 255)';

            if (hasImage || hasCaptchaClass || (hasPointerCursor && (hasBorder || hasAzureBackground))) {
                potentialImages.push({
                    element: el,
                    type: imageType || 'element',
                    src: imageSrc,
                    id: el.id,
                    classes: el.className,
                    tagName: el.tagName,
                    rect: el.getBoundingClientRect()
                });
            }
        }

        return potentialImages;
    }

    function findCaptchaContainer(doc) {
        const selectors = [
            '.main-div-container',
            '#captcha-main-div',
            '[class*="captcha"]',
            '[class*="main-div"]',
            '.col-4',
            '[class*="grid"]',
            '[class*="puzzle"]'
        ];

        for (const selector of selectors) {
            const elements = doc.querySelectorAll(selector);
            if (elements.length > 0) {
                for (const el of elements) {
                    const hasImages = el.querySelectorAll('img').length > 0 || window.getComputedStyle(el).backgroundImage !== 'none';
                    if (hasImages) {
                        return el;
                    }
                }
                return elements[0];
            }
        }

        return doc.body;
    }

    function areElementsSimilar(element1, element2) {
        if (element1.element === element2.element) {
            return true;
        }

        const rect1 = element1.rect;
        const rect2 = element2.rect;

        const overlap = !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom);

        if (overlap) {
            const overlapWidth = Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left);
            const overlapHeight = Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top);

            const area1 = rect1.width * rect1.height;
            const area2 = rect2.width * rect2.height;
            const overlapArea = overlapWidth * overlapHeight;

            if (overlapArea > 0.5 * Math.min(area1, area2)) {
                return true;
            }
        }

        if (element1.element.contains(element2.element) || element2.element.contains(element1.element)) {
            return true;
        }

        return false;
    }

    function removeDuplicateElements(elements) {
        const uniqueElements = [];

        for (const element of elements) {
            const isDuplicate = uniqueElements.some(uniqueElement => areElementsSimilar(element, uniqueElement));
            if (!isDuplicate) {
                uniqueElements.push(element);
            }
        }

        return uniqueElements;
    }

    function groupCaptchaImages(images) {
        const groups = {
            withAzureBackground: images.filter(item => {
                const style = window.getComputedStyle(item.element);
                return style.backgroundColor === 'azure' || style.backgroundColor === 'rgb(240, 255, 255)';
            }),
            withCaptchaClass: images.filter(item => item.classes.includes('captcha-img') || item.classes.includes('img-') || item.element.closest('.captcha-img') !== null),
            withPointerCursor: images.filter(item => {
                const style = window.getComputedStyle(item.element);
                return style.cursor === 'pointer';
            }),
            withBorder: images.filter(item => {
                const style = window.getComputedStyle(item.element);
                return style.border && style.border !== 'none' && !style.border.includes('0px');
            }),
            largeImages: images.filter(item => item.rect.width >= 100 && item.rect.height >= 100)
        };

        const potentialGroups = [];
        for (const [name, group] of Object.entries(groups)) {
            if (group.length >= 7 && group.length <= 12) {
                potentialGroups.push({
                    name: name,
                    count: group.length,
                    elements: group
                });
            }
        }

        if (potentialGroups.length > 1) {
            potentialGroups.sort((a, b) => b.count - a.count);
            const uniqueGroups = [];

            for (const group of potentialGroups) {
                if (uniqueGroups.length === 0) {
                    uniqueGroups.push(group);
                    continue;
                }

                let isDuplicateGroup = false;

                for (const existingGroup of uniqueGroups) {
                    let matchingElements = 0;

                    for (const element of group.elements) {
                        if (existingGroup.elements.some(existingElement => areElementsSimilar(element, existingElement))) {
                            matchingElements++;
                        }
                    }

                    if (matchingElements > group.elements.length * 0.5) {
                        isDuplicateGroup = true;
                        break;
                    }
                }

                if (!isDuplicateGroup) {
                    uniqueGroups.push(group);
                }
            }

            potentialGroups.length = 0;
            potentialGroups.push(...uniqueGroups);
        }

        return {
            all: groups,
            potential: potentialGroups
        };
    }

    function filterAndRemoveUnnecessaryElements(visibleImages, groups, doc) {
        if (groups.potential.length > 0) {
            const bestGroup = groups.potential[0].elements;
            const uniqueBestGroup = removeDuplicateElements(bestGroup);
            console.log(`Удалено ${bestGroup.length - uniqueBestGroup.length} дубликатов внутри лучшей группы`);

            let finalGroup = uniqueBestGroup;
            if (uniqueBestGroup.length > 9) {
                finalGroup = uniqueBestGroup.slice(0, 9);
                console.log(`Оставляем только первые 9 элементов из ${uniqueBestGroup.length}`);
            }

            const uniqueElements = new Set();
            finalGroup.forEach(item => {
                uniqueElements.add(item.element);
            });

            visibleImages.forEach(item => {
                const isInFinalGroup = finalGroup.some(bestItem => areElementsSimilar(item, bestItem));
                const isInCaptchaClassGroup = groups.all.withCaptchaClass.includes(item);
                const isInExcludedDiv = item.element.closest('.text-center.row.no-gutters.img-actions') !== null;

                const isButton = item.element.classList.contains('img-action') || item.element.closest('.img-action-div') !== null || item.element.innerHTML === 'Submit' || item.element.innerHTML === 'Reload' || item.element.innerHTML === 'Clear Selection';

                if (!isInFinalGroup && !isInCaptchaClassGroup && !isInExcludedDiv && !isButton) {
                    item.element.style.display = 'none';
                    console.log(`Скрыт элемент: ${item.id || item.classes || 'без идентификатора'}`);
                }
            });

            const allElements = Array.from(doc.querySelectorAll('*'));
            let removedCount = 0;

            for (const el of allElements) {
                if (uniqueElements.has(el)) continue;

                const style = window.getComputedStyle(el);
                const hasCaptchaClass = el.className && (el.className.includes('captcha') || el.className.includes('puzzle') || el.className.includes('grid'));
                const hasPointerCursor = style.cursor === 'pointer';
                const hasBorder = style.border && style.border !== 'none' && !style.border.includes('0px');

                const isButton = el.classList.contains('img-action') || el.closest('.img-action-div') !== null || el.innerHTML === 'Submit' || el.innerHTML === 'Reload' || el.innerHTML === 'Clear Selection';

                if ((hasCaptchaClass || hasPointerCursor || hasBorder) && el.tagName !== 'BODY' && el.tagName !== 'HTML' && finalGroup.length > 0 && !el.contains(finalGroup[0].element) && !isButton) {
                    el.style.display = 'none';
                    removedCount++;
                }
            }

            console.log(`Обработка завершена, скрыто ${removedCount} дополнительных элементов`);
            return finalGroup;
        }

        return visibleImages;
    }

    function highlightElements(elements, color = 'red', duration = 5000) {
        const oldHighlights = document.querySelectorAll(`.captcha-highlight-${color}`);
        oldHighlights.forEach(el => el.remove());

        elements.forEach((item, index) => {
            const rect = item.rect;

            const highlight = document.createElement('div');
            highlight.className = `captcha-highlight captcha-highlight-${color}`;
            highlight.style.position = 'absolute';
            highlight.style.left = rect.left + 'px';
            highlight.style.top = rect.top + 'px';
            highlight.style.width = rect.width + 'px';
            highlight.style.height = rect.height + 'px';
            highlight.style.border = `2px solid ${color}`;
            highlight.style.backgroundColor = `rgba(${color === 'red' ? '255, 0, 0' : color === 'green' ? '0, 255, 0' : '0, 0, 255'}, 0.2)`;
            highlight.style.zIndex = '10000';
            highlight.style.pointerEvents = 'none';

            highlight.textContent = (index + 1).toString();
            highlight.style.display = 'flex';
            highlight.style.alignItems = 'center';
            highlight.style.justifyContent = 'center';
            highlight.style.fontSize = '16px';
            highlight.style.fontWeight = 'bold';
            highlight.style.color = 'white';
            highlight.style.textShadow = '1px 1px 1px black';

            document.body.appendChild(highlight);

            setTimeout(() => {
                if (highlight.parentNode) {
                    highlight.parentNode.removeChild(highlight);
                }
            }, duration);
        });
    }
    function selectCaptchaImageByIndex(doc, elements, index) {
        if (index < 0 || index >= elements.length) {
            console.error(`Индекс ${index} выходит за пределы массива элементов (0-${elements.length - 1})`);
            return null;
        }

        try {
            const selectedElement = elements[index].element;
            console.log(`Проверяется элемент #${index + 1}: ${elements[index].id || elements[index].classes || 'без идентификатора'}`);

          // Получаем URL изображения для распознавания
            const imageUrl = selectedElement.src || selectedElement.style.backgroundImage.slice(5, -2);
            console.log(`URL изображения: ${imageUrl}`); // Логирование URL

            recognizeCaptchaText(imageUrl, index, selectedElement, doc);
            return elements[index];
        } catch (error) {
            console.error(`Ошибка при выборе элемента #${index + 1}: ${error.message}`);
            return null;
        }
    }


    async function sendCaptchaToFreeOcr(imageUrl) {
        const match = imageUrl.match(/^data:(image\/\w+);base64,/);
        const mimeType = match ? match[1] : 'image/png';
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');

        const formData = new FormData();
        formData.append('base64Image', `data:${mimeType};base64,${base64Data}`);
        formData.append('apikey', 'GP88X5P4NYFBX');  // замените на свой ключ
        formData.append('OCREngine', '2');

        // создаём AbortController для таймаута
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, 3000); // 3000 мс = 3 секунды

        try {
            const response = await fetch('https://apipro2.ocr.space/parse/image', {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`OCR API вернул статус ${response.status}`);
            }

            const result = await response.json();
            const parsedText = result?.ParsedResults?.[0]?.ParsedText || '';
            return parsedText.trim();

        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Запрос к OCR.space прерван по таймауту (3 сек)');
            } else {
                console.error('Ошибка при работе с OCR.space:', error);
            }
            return null;
        }
    }

        // Переменные-блокировки для защиты от повторных 503
    let trueCaptcha503Count = 0;
    let trueCaptchaBlockedUntil = 0;

    async function sendCaptchaToTrueCaptcha(imageUrl) {
        // Если блокировка активна — сразу пропускаем вызов
        if (Date.now() < trueCaptchaBlockedUntil) {
            console.warn('TrueCaptcha временно отключён из-за ошибок 503. Ждём...');
            return null;
        }
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
        const params = {
            userid: 'vladislavzyablov1997@gmail.com',
            apikey: '9pWMRDrqKzYWsAoLtXeo',
            data: base64Data,
            numeric: true,
            len_str: 3
        };
        try {
            const response = await fetch('https://api.apitruecaptcha.org/one/gettext', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            if (response.status === 503) {
                trueCaptcha503Count++;
                console.error(`TrueCaptcha вернул 503 (${trueCaptcha503Count} подряд) — сервис временно недоступен!`);
                // Блокируем вызовы на 10 минут после 3 подряд 503
                if (trueCaptcha503Count >= 3) {
                    trueCaptchaBlockedUntil = Date.now() + 10 * 60 * 1000; // 10 минут
                    console.warn('TrueCaptcha отключён на 10 минут из-за повторных 503.');
                    trueCaptcha503Count = 0;
                }
                return null;
            } else {
                // Если успех — сбрасываем счётчик ошибок
                trueCaptcha503Count = 0;
            }
            const result = await response.json();
            if (result && result.result) {
                return result.result.trim();
            }
            return null;
        } catch (err) {
            console.error('TrueCaptcha API error:', err);
            return null;
        }
    }


    const modes = [
        'pyramid_upscale','two_stage_threshold','smooth_and_pyramid','median_filter_simple','pyramid_up','pyramid_upscale',
        'pyramid_up','two_stage_threshold','smooth_and_pyramid','median_filter_simple'
    ];
      const modesLen = modes.length;
      let recognizedCount = 0;
      let validRecognizedCount = 0;
      let uncknownNumber = 0;
      let result = [];

      function clickSubmitButton(doc) {
          if (submitClicked) {
              console.log('⛔ Кнопка Submit уже была нажата, повторный клик отменён.');
              return;
          }

          const submitBtn = document.getElementById('btnVerify');
          if (submitBtn) {
              submitBtn.click();
              submitClicked = true;
              console.log('✅ Выполнен клик по кнопке Submit');
          } else {
              console.warn('⚠️ Кнопка Submit не найдена');
          }
      }

    async function recognizeCaptchaText(imageUrl, imagePos, selectedElement, doc) {
        console.log(CURRENT_NUMBER + '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        if (imagePos === 9) {
            console.log(`⏭️ Позиция ${imagePos + 1} пропущена.`);
            return;
        }

        const originalImageUrl = imageUrl;
        let foundValidNumber = false;
        const resultsCount = {};

        // --- КАСКАД: Tesseract -> TrueCaptcha -> Free OCR API ---
        for (let index = 0; index < modesLen; index++) {
            try {
                const processedImageUrl = await preprocessImageWithOpenCV(originalImageUrl, modes[index]);

                // 1. Tesseract
                let { data: { text } } = await Tesseract.recognize(
                    processedImageUrl,
                    'eng',
                    {
                        tessedit_char_whitelist: '0123456789',
                        tessedit_pageseg_mode: 6,
                    }
                );
                let cleanedText = text.replace(/\D/g, '').slice(0, 3);
                console.log(`🔍 Tesseract [${modes[index]}]: "${cleanedText}" (${imagePos + 1})`);

                if (!cleanedText || cleanedText.startsWith("0") || cleanedText.length < 3) {
                    console.log(`⚠️ Tesseract не распознал ("${cleanedText}"), пробуем TrueCaptcha...`);
                    const trueCaptchaText = await sendCaptchaToTrueCaptcha(processedImageUrl);
                    if (trueCaptchaText) {
                        cleanedText = trueCaptchaText.replace(/\D/g, '').slice(0, 3);
                        console.log(`🔍 TrueCaptcha: "${cleanedText}" на позиции ${imagePos + 1}`);
                    } else {
                        console.log('⚠️ TrueCaptcha не распознал текст.');
                        continue;
                    }
                }

                // Если найдено совпадение с CURRENT_NUMBER
                if (/^\d{3}$/.test(cleanedText) && cleanedText === CURRENT_NUMBER) {
                    await delay(50);
                    selectedElement.click();
                    console.log(`✅ "${cleanedText}" совпало с CURRENT_NUMBER — кликаем (позиция ${imagePos + 1})`);
                    foundValidNumber = true;
                    validRecognizedCount++;
                    recognizedCount++;
                    result.push({ pos: imagePos, value: cleanedText });
                    selectedElement.style.display = 'none';
                    if (validRecognizedCount >= 6 || recognizedCount >= 9) {
                        clickSubmitButton(doc);
                        index = modesLen;
                    }
                    break;
                }

                resultsCount[cleanedText] = (resultsCount[cleanedText] || 0) + 1;
                if (resultsCount[cleanedText] === 2) {
                    if (cleanedText === CURRENT_NUMBER) {
                        await delay(50);
                        selectedElement.click();
                        console.log(`✅ "${cleanedText}" совпало с CURRENT_NUMBER и распознано 2 раза — кликаем (позиция ${imagePos + 1})`);
                        foundValidNumber = true;
                    } else {
                        recognizedCount++;
                        console.log(`🚫 "${cleanedText}" распознано 2 раза, но не совпадает с CURRENT_NUMBER (${CURRENT_NUMBER}) — ничего не делаем.`);
                        selectedElement.style.display = 'none';
                        result.push({ pos: imagePos, value: cleanedText });
                        foundValidNumber = true;
                        if (recognizedCount >= 9) {
                            clickSubmitButton(doc);
                        }
                    }
                    break;
                } else {
                    console.log(`🔸 "${cleanedText}" пока ${resultsCount[cleanedText]} раз(а).`);
                }
            } catch (err) {
                console.error(`❌ Ошибка распознавания в режиме ${modes[index]}:`, err);
            }
        }

        // --- Если ничего не найдено ---
        if (!foundValidNumber) {
            console.log(`📌 Позиция ${imagePos + 1} пропущена — не было нужного совпадения. ${uncknownNumber}`);
            uncknownNumber++;

            if (recognizedCount + uncknownNumber === 9) {
                if (uncknownNumber === 1 && validRecognizedCount === 2) {
                    selectedElement.click();
                    clickSubmitButton(doc);
                    console.log('clickSubmitButton 1 не распознало и 2 правильные');
                    return;
                }

                
                clickSubmitButton(doc);
                console.log(`📌 Пропущено — auto-submit вместо alert`);
            }
        }
    }



    function preprocessImageWithOpenCV(imageUrl, mode) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = imageUrl;
            img.onload = () => {
                const mat = cv.imread(img),
                      gray = new cv.Mat(),
                      canvas = document.createElement('canvas');
                try {
                    switch (mode) {

                        // --- УНИКАЛЬНЫЕ (pyramid + уникальные переменные) ---
                        case 'gray_and_median_blur_with_normalization':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.medianBlur(gray, gray, 3);
                            cv.normalize(gray, gray, 0, 255, cv.NORM_MINMAX);
                            var down1 = new cv.Mat(), up1 = new cv.Mat();
                            cv.pyrDown(gray, down1); cv.pyrUp(down1, up1);
                            cv.normalize(up1, up1, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up1); down1.delete(); up1.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'gray_and_median_blur':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.medianBlur(gray, gray, 3);
                            var down2 = new cv.Mat(), up2 = new cv.Mat();
                            cv.pyrDown(gray, down2); cv.pyrUp(down2, up2);
                            cv.normalize(up2, up2, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up2); down2.delete(); up2.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'gray_and_gaussian_blur_with_normalization':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 1);
                            cv.normalize(gray, gray, 0, 255, cv.NORM_MINMAX);
                            var down3 = new cv.Mat(), up3 = new cv.Mat();
                            cv.pyrDown(gray, down3); cv.pyrUp(down3, up3);
                            cv.normalize(up3, up3, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up3); down3.delete(); up3.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'clahe':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
                            clahe.apply(gray, gray);
                            clahe.delete();
                            var down4 = new cv.Mat(), up4 = new cv.Mat();
                            cv.pyrDown(gray, down4); cv.pyrUp(down4, up4);
                            cv.normalize(up4, up4, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up4); down4.delete(); up4.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'multi_scale_enhancement':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var scale1 = new cv.Mat(), scale2 = new cv.Mat(), scale3 = new cv.Mat(), combined = new cv.Mat();
                            cv.resize(gray, scale1, new cv.Size(gray.cols * 0.5, gray.rows * 0.5), 0, 0, cv.INTER_AREA);
                            cv.resize(gray, scale2, new cv.Size(gray.cols * 1.5, gray.rows * 1.5), 0, 0, cv.INTER_CUBIC);
                            cv.resize(gray, scale3, new cv.Size(gray.cols * 2.0, gray.rows * 2.0), 0, 0, cv.INTER_CUBIC);
                            var clahe2 = new cv.CLAHE(2.0, new cv.Size(8, 8));
                            clahe2.apply(scale1, scale1); clahe2.apply(scale2, scale2); clahe2.apply(scale3, scale3);
                            cv.resize(scale1, scale1, gray.size(), 0, 0, cv.INTER_LINEAR);
                            cv.resize(scale2, scale2, gray.size(), 0, 0, cv.INTER_LINEAR);
                            cv.resize(scale3, scale3, gray.size(), 0, 0, cv.INTER_LINEAR);
                            cv.addWeighted(scale1, 0.3, scale2, 0.4, 0, combined);
                            cv.addWeighted(combined, 1.0, scale3, 0.3, 0, combined);
                            cv.normalize(combined, combined, 0, 255, cv.NORM_MINMAX);
                            cv.threshold(combined, combined, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            var down5 = new cv.Mat(), up5 = new cv.Mat();
                            cv.pyrDown(combined, down5); cv.pyrUp(down5, up5);
                            cv.normalize(up5, up5, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up5);
                            scale1.delete(); scale2.delete(); scale3.delete(); combined.delete(); clahe2.delete(); down5.delete(); up5.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'unsharp_mask':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var blur = new cv.Mat();
                            cv.GaussianBlur(gray, blur, new cv.Size(0, 0), 3);
                            cv.addWeighted(gray, 1.5, blur, -0.5, 0, gray); blur.delete();
                            cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            var down6 = new cv.Mat(), up6 = new cv.Mat();
                            cv.pyrDown(gray, down6); cv.pyrUp(down6, up6);
                            cv.normalize(up6, up6, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up6); down6.delete(); up6.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'two_stage_threshold':
                            var scaleFactor = 1.5; var scaled = new cv.Mat();
                            cv.resize(mat, scaled, new cv.Size(0, 0), scaleFactor, scaleFactor, cv.INTER_CUBIC);
                            cv.cvtColor(scaled, gray, cv.COLOR_RGBA2GRAY);
                            var blurs = new cv.Mat(); cv.GaussianBlur(gray, blurs, new cv.Size(5, 5), 0);
                            var thresh1 = new cv.Mat(); cv.threshold(blurs, thresh1, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            var kernels = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
                            var opened = new cv.Mat(); cv.morphologyEx(thresh1, opened, cv.MORPH_OPEN, kernels);
                            var down7 = new cv.Mat(), up7 = new cv.Mat();
                            cv.pyrDown(opened, down7); cv.pyrUp(down7, up7);
                            cv.normalize(up7, up7, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up7);
                            scaled.delete(); blurs.delete(); thresh1.delete(); kernels.delete(); opened.delete(); down7.delete(); up7.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'gaussian_blur_simple':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
                            cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            var down8 = new cv.Mat(), up8 = new cv.Mat();
                            cv.pyrDown(gray, down8); cv.pyrUp(down8, up8);
                            cv.normalize(up8, up8, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up8); down8.delete(); up8.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'median_blur_simple':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.medianBlur(gray, gray, 5);
                            cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            var down9 = new cv.Mat(), up9 = new cv.Mat();
                            cv.pyrDown(gray, down9); cv.pyrUp(down9, up9);
                            cv.normalize(up9, up9, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up9); down9.delete(); up9.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'median_filter_simple':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.medianBlur(gray, gray, 3);
                            cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            var down10 = new cv.Mat(), up10 = new cv.Mat();
                            cv.pyrDown(gray, down10); cv.pyrUp(down10, up10);
                            cv.normalize(up10, up10, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up10); down10.delete(); up10.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'adaptive_threshold':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var adaptive = new cv.Mat();
                            cv.adaptiveThreshold(gray, adaptive, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
                            var down11 = new cv.Mat(), up11 = new cv.Mat();
                            cv.pyrDown(adaptive, down11); cv.pyrUp(down11, up11);
                            cv.normalize(up11, up11, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up11); adaptive.delete(); down11.delete(); up11.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'adaptive_median_blur':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var clahe5 = new cv.CLAHE(2.0, new cv.Size(8, 8)); clahe5.apply(gray, gray);
                            cv.medianBlur(gray, gray, 3);
                            cv.adaptiveThreshold(gray, gray, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, 11, 2);
                            var kernel3b = cv.Mat.ones(3, 3, cv.CV_8U); cv.morphologyEx(gray, gray, cv.MORPH_CLOSE, kernel3b); kernel3b.delete();
                            clahe5.delete();
                            var down12 = new cv.Mat(), up12 = new cv.Mat();
                            cv.pyrDown(gray, down12); cv.pyrUp(down12, up12);
                            cv.normalize(up12, up12, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up12); down12.delete(); up12.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'enhanced_morphology':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
                            var morph = new cv.Mat(); var kernel5_3 = cv.Mat.ones(5, 5, cv.CV_8U);
                            cv.morphologyEx(gray, morph, cv.MORPH_CLOSE, kernel5_3); cv.morphologyEx(morph, morph, cv.MORPH_OPEN, kernel5_3);
                            cv.threshold(morph, morph, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            var down13 = new cv.Mat(), up13 = new cv.Mat();
                            cv.pyrDown(morph, down13); cv.pyrUp(down13, up13);
                            cv.normalize(up13, up13, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up13); morph.delete(); kernel5_3.delete(); down13.delete(); up13.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'mixed_morphology':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var mixed = new cv.Mat(); var kernel5_2 = cv.Mat.ones(5, 5, cv.CV_8U);
                            cv.morphologyEx(gray, mixed, cv.MORPH_CLOSE, kernel5_2); cv.morphologyEx(mixed, mixed, cv.MORPH_OPEN, kernel5_2);
                            var down14 = new cv.Mat(), up14 = new cv.Mat();
                            cv.pyrDown(mixed, down14); cv.pyrUp(down14, up14);
                            cv.normalize(up14, up14, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up14); mixed.delete(); kernel5_2.delete(); down14.delete(); up14.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'morph_gradients':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.bilateralFilter(gray, gray, 9, 75, 75); var kernel5 = cv.Mat.ones(5, 5, cv.CV_8U);
                            cv.morphologyEx(gray, gray, cv.MORPH_GRADIENT, kernel5); kernel5.delete();
                            var down15 = new cv.Mat(), up15 = new cv.Mat();
                            cv.pyrDown(gray, down15); cv.pyrUp(down15, up15);
                            cv.normalize(up15, up15, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up15); down15.delete(); up15.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'morph_extraction':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var morphResult = new cv.Mat(); var kernel5_4 = cv.Mat.ones(5, 5, cv.CV_8U);
                            cv.morphologyEx(gray, morphResult, cv.MORPH_CLOSE, kernel5_4);
                            var down16 = new cv.Mat(), up16 = new cv.Mat();
                            cv.pyrDown(morphResult, down16); cv.pyrUp(down16, up16);
                            cv.normalize(up16, up16, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up16); morphResult.delete(); kernel5_4.delete(); down16.delete(); up16.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'remove_lines':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var lineKernel = cv.Mat.ones(1, 5, cv.CV_8U); var removedLines = new cv.Mat();
                            cv.morphologyEx(gray, removedLines, cv.MORPH_OPEN, lineKernel); lineKernel.delete();
                            var down17 = new cv.Mat(), up17 = new cv.Mat();
                            cv.pyrDown(removedLines, down17); cv.pyrUp(down17, up17);
                            cv.normalize(up17, up17, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up17); removedLines.delete(); down17.delete(); up17.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'edge_detection':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0); var edges = new cv.Mat();
                            cv.Canny(gray, edges, 50, 150);
                            var down18 = new cv.Mat(), up18 = new cv.Mat();
                            cv.pyrDown(edges, down18); cv.pyrUp(down18, up18);
                            cv.normalize(up18, up18, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up18); edges.delete(); down18.delete(); up18.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'resize':
                            var scaleFactors = 0.7;
                            var resized = new cv.Mat();
                            var newSizes = new cv.Size(mat.cols * scaleFactors, mat.rows * scaleFactors);
                            var interpolationMethod = scaleFactors < 1 ? cv.INTER_AREA : cv.INTER_LINEAR;
                            cv.resize(mat, resized, newSizes, 0, 0, interpolationMethod);
                            var grayResized = new cv.Mat();
                            cv.cvtColor(resized, grayResized, cv.COLOR_RGBA2GRAY);
                            var down19 = new cv.Mat(), up19 = new cv.Mat();
                            cv.pyrDown(grayResized, down19); cv.pyrUp(down19, up19);
                            cv.normalize(up19, up19, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up19); resized.delete(); grayResized.delete(); down19.delete(); up19.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'contrast_enhancement':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.convertScaleAbs(gray, gray, 2, 20);
                            var down20 = new cv.Mat(), up20 = new cv.Mat();
                            cv.pyrDown(gray, down20); cv.pyrUp(down20, up20);
                            cv.normalize(up20, up20, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up20); down20.delete(); up20.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'rotate_-10': case 'rotate_-5': case 'rotate_0': case 'rotate_5': case 'rotate_10':
                            var angle = parseInt(mode.split('_')[1], 10);
                            var center = new cv.Point(mat.cols / 2, mat.rows / 2);
                            var rotationMatrix = cv.getRotationMatrix2D(center, angle, 1);
                            var rotated = new cv.Mat();
                            cv.warpAffine(mat, rotated, rotationMatrix, new cv.Size(mat.cols, mat.rows));
                            var grayRotated = new cv.Mat();
                            cv.cvtColor(rotated, grayRotated, cv.COLOR_RGBA2GRAY);
                            var down21 = new cv.Mat(), up21 = new cv.Mat();
                            cv.pyrDown(grayRotated, down21); cv.pyrUp(down21, up21);
                            cv.normalize(up21, up21, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up21); rotated.delete(); grayRotated.delete(); down21.delete(); up21.delete();
                            resolve(canvas.toDataURL()); return;

                        // --- Режимы, которые изначально были с pyramid ---
                        case 'smooth_and_pyramid':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var blurMat = new cv.Mat(), reducedMat = new cv.Mat(), expandedMat = new cv.Mat();
                            cv.GaussianBlur(gray, blurMat, new cv.Size(5, 5), 0);
                            cv.pyrDown(blurMat, reducedMat); cv.pyrUp(reducedMat, expandedMat);
                            cv.normalize(expandedMat, expandedMat, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, expandedMat); blurMat.delete(); reducedMat.delete(); expandedMat.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'pyramid_upscale':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var down22 = new cv.Mat(); var up22 = new cv.Mat();
                            cv.pyrDown(gray, down22); cv.pyrUp(down22, up22);
                            cv.normalize(up22, up22, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up22); down22.delete(); up22.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'pyramid_up':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY); cv.equalizeHist(gray, gray);
                            var scaledDown = new cv.Mat(), scaledUp = new cv.Mat();
                            cv.pyrDown(gray, scaledDown); cv.pyrUp(scaledDown, scaledUp);
                            cv.normalize(scaledUp, scaledUp, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, scaledUp); scaledDown.delete(); scaledUp.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'gray_blur_and_pyramid':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY); cv.equalizeHist(gray, gray);
                            cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 1);
                            var pyrDownMat = new cv.Mat(), pyrUpMat = new cv.Mat();
                            cv.pyrDown(gray, pyrDownMat); cv.pyrUp(pyrDownMat, pyrUpMat);
                            cv.normalize(pyrUpMat, pyrUpMat, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, pyrUpMat); pyrDownMat.delete(); pyrUpMat.delete();
                            resolve(canvas.toDataURL()); return;

                        case 'gray_hist_blur_pyramid':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY); cv.equalizeHist(gray, gray);
                            cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 1);
                            var pyrDownMat1 = new cv.Mat(), pyrUpMat1 = new cv.Mat();
                            cv.pyrDown(gray, pyrDownMat1); cv.pyrUp(pyrDownMat1, pyrUpMat1);
                            cv.normalize(pyrUpMat1, pyrUpMat1, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, pyrUpMat1); pyrDownMat1.delete(); pyrUpMat1.delete();
                            resolve(canvas.toDataURL()); return;
                         default:
                            throw new Error('Неизвестный режим');
                    }

                } catch (error) {
                    console.error('Ошибка обработки изображения:', error);
                    reject(error);
                } finally {
                    gray.delete();
                    mat.delete();
                }
            };

            img.onerror = (error) => {
                console.error('Ошибка загрузки изображения:', error);
                reject(new Error('Не удалось загрузить изображение'));
            };
        });
    }



    function startAnalizeAndSelectCaptchaImages(doc, elements) {
        elements.forEach((item, index) => {
            selectCaptchaImageByIndex(doc, elements, index);
        });
    }

    function analyzeAndSelectCaptchaImages(isFirstAnalyze) {
      recognizedCount = 0;
      validRecognizedCount = 0;
      uncknownNumber = 0;
      result = [];
        try {
            if (!isFirstAnalyze) {
                waitForLoadingMaskToDisappear(() => {
                    console.log('Loading завершен.');
                    findVisibleDivLikeDevAbilities();
                });
            }

            const potentialImages = findAllPotentialCaptchaImages(document);
            console.log(`Найдено ${potentialImages.length} потенциальных изображений`);

            const captchaContainer = findCaptchaContainer(document);
            console.log('Найден контейнер капчи:', captchaContainer);

            const visibleImages = potentialImages.filter(item => {
                return captchaContainer.contains(item.element) && isElementVisible(item.element, document);
            });
            console.log(`Найдено ${visibleImages.length} видимых изображений внутри контейнера`);

            const uniqueVisibleImages = removeDuplicateElements(visibleImages);
            console.log(`После удаления дубликатов осталось ${uniqueVisibleImages.length} уникальных изображений`);

            const groups = groupCaptchaImages(uniqueVisibleImages);
            console.log('Группы изображений:', groups);
            console.log(`Найдено ${groups.potential.length} потенциальных групп с ~9 элементами`);

            let filteredImages = uniqueVisibleImages;
            filteredImages = filterAndRemoveUnnecessaryElements(uniqueVisibleImages, groups, document);
            console.log(`После фильтрации осталось ${filteredImages.length} элементов`);

            if (groups.potential.length > 0) {
                groups.potential.forEach((group, index) => {
                    startAnalizeAndSelectCaptchaImages(document, group.elements);
                });
            } else {
                alert('Не найдено потенциальных групп с ~9 элементами');

                startAnalizeAndSelectCaptchaImages(document, filteredImages);
            }

            return {
                success: true,
                visibleImages: filteredImages,
                groups: groups
            };
        } catch (error) {
            console.error('Ошибка при анализе iframe:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

  (function() {
    'use strict';
    const shadowHost = document.createElement('div');
    document.body.appendChild(shadowHost);
    const shadowRoot = shadowHost.attachShadow({ mode: 'open' });


    const button = document.createElement('button');
    button.innerHTML = '🔍';
    button.title = 'Анализировать капчу';
    button.style.position = 'fixed';
    button.style.bottom = '20px';
    button.style.left = '50%';
    button.style.transform = 'translateX(-50%)';
    button.style.zIndex = '999999';
    button.style.width = '60px';
    button.style.height = '60px';
    button.style.backgroundColor = '#4CAF50';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '50%';
    button.style.cursor = 'pointer';
    button.style.fontSize = '28px';
    button.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    button.style.transition = 'all 0.3s ease';

    button.addEventListener('mouseover', () => {
      button.style.transform = 'translateX(-50%) scale(1.1)';
      button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4)';
    });
    button.addEventListener('mouseout', () => {
      button.style.transform = 'translateX(-50%) scale(1)';
      button.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    });

    shadowRoot.appendChild(button);

    button.addEventListener('click', function() {
        analyzeAndSelectCaptchaImages(false);
    });

    if (window.self !== window.top && document.title === "Verify Registration") {
        console.log("Обнаружен прямой доступ к iframe капчи");

        const iframeButton = document.createElement('button');
        button.innerHTML = '🔍';
        button.title = 'Анализировать капчу';
        button.style.position = 'fixed';
        button.style.bottom = '20px';
        button.style.left = '50%';
        button.style.transform = 'translateX(-50%)';
        button.style.zIndex = '999999';
        button.style.width = '60px';
        button.style.height = '60px';
        button.style.backgroundColor = '#4CAF50';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '50%';
        button.style.cursor = 'pointer';
        button.style.fontSize = '28px';
        button.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
        button.style.transition = 'all 0.3s ease';
        button.addEventListener('mouseover', () => {
          button.style.transform = 'translateX(-50%) scale(1.1)';
          button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4)';
        });
        button.addEventListener('mouseout', () => {
          button.style.transform = 'translateX(-50%) scale(1)';
          button.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
        });
        document.body.appendChild(iframeButton);

        iframeButton.addEventListener('click', function() {
            analyzeAndSelectCaptchaImages(false);
        });
    }
  })();
