// ==UserScript==
// @name         bls-spain-2.0-test
// @namespace    http://tampermonkey.net/
// @version      2025-03-12
// @description  Автоматизация логина и взаимодействия с iframe. Если loading mask не исчезает — обновляем страницу. Кнопки управления вынесены в отдельный скрипт.
// @author       You
// @match        https://appointment.blsspainrussia.ru/Global/Appointment/AppointmentCaptcha*
// @match        https://appointment.blsspainrussia.ru/Global/appointment/appointmentcaptcha*
// @match        https://belarus.blsspainglobal.com/Global/Appointment/AppointmentCaptcha*
// @match        https://belarus.blsspainglobal.com/Global/appointment/appointmentcaptcha*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js
// @require      https://docs.opencv.org/5.0.0-alpha/opencv.js
// @run-at       document-idle
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
    }, 400);
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
                text = text.replace('Please select all boxes with number', 'Выберите картинки с числом');

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


    async function sendCaptchaToOcrSpace(imageUrl) {

      const match = imageUrl.match(/^data:(image\/\w+);base64,/);
      const mimeType = match ? match[1] : 'image/png'; //
      const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
      const formData = new FormData();

      formData.append('base64Image', `data:${mimeType};base64,${base64Data}`);
      formData.append('apikey', 'GP88X5P4NYFBX');
      formData.append('language', 'eng');
      formData.append('OCREngine', '2');


      try {
        const response = await fetch('https://apipro2.ocr.space/parse/image', {
          method: 'POST',
          body: formData,
        });
            if (!response.ok) {
                throw new Error('Ошибка при отправке изображения на OCR API');
            }

            const result = await response.json();
            const parsedText = result?.ParsedResults?.[0]?.ParsedText || '';
            return parsedText;
        } catch (error) {
            console.error('Ошибка при работе с OCR API:', error);
            return null;
        }
    }

      const modes = [
        'pyramid_upscale', 'smooth_and_pyramid','gray_and_median_blur_with_normalization', 'gray_hist_blur_pyramid',
        'smooth_filter', 'pyramid_up', 'pyramid_upscale','pyramid_up','gray_and_median_blur_with_normalization',
        'gaussian_blur_simple', 'gray_blur_and_pyramid','unsharp_mask','smooth_and_pyramid'
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
        console.log(CURRENT_NUMBER + '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        if (imagePos === 9) {
            console.log(`⏭️ Позиция ${imagePos + 1} пропущена.`);
            return;
        }

        const originalImageUrl = imageUrl;
        let foundValidNumber = false;
        const resultsCount = {};

        for (let index = 0; index < modesLen; index++) {
            try {
                const processedImageUrl = await preprocessImageWithOpenCV(originalImageUrl, modes[index]);

              // Используем предобработанное изображение для Tesseract
                const { data: { text } } = await Tesseract.recognize(
                    processedImageUrl,
                    'eng',
                    {
                        tessedit_char_whitelist: '0123456789',
                        tessedit_pageseg_mode: 6,

                    }
                );

                let cleanedText = text.replace(/\D/g, '').slice(0, 3);
                console.log(`🔍 Режим: ${modes[index]}, результат Tesseract: "${cleanedText}" на позиции ${imagePos + 1}`);

                if (!cleanedText || cleanedText.startsWith("0") || cleanedText.length < 3) {
                    console.log(`⚠️ Неполное число: "${cleanedText}", пробуем OCR.space.`);
                    const recognizedText = await sendCaptchaToOcrSpace(processedImageUrl); // Используем предобработанное изображение

                    if (recognizedText) {
                        cleanedText = recognizedText.trim();
                        console.log(`🔍 Результат OCR.space: "${cleanedText}" на позиции ${imagePos + 1}`);
                    } else {
                        console.log(`⚠️ OCR.space не распознал текст.`);
                        continue;
                    }
                }

                if (/^\d{3}$/.test(cleanedText) && cleanedText === CURRENT_NUMBER) {
                    await delay(50);
                    selectedElement.click();
                    console.log(`✅ "${cleanedText}" совпало с CURRENT_NUMBER — кликаем (позиция ${imagePos + 1})`);
                    foundValidNumber = true;
                    validRecognizedCount++;
                    recognizedCount++;
                    result.push({pos: imagePos, value: cleanedText});
                    selectedElement.style.display = 'none';
                    console.log(`🎯🎯🎯всего распознано: ${recognizedCount}, правильно распознано: ${validRecognizedCount}`);
                    if(validRecognizedCount >= 6 || recognizedCount >= 9) {
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
                        console.log(console.log(`🎯🎯🎯всего распознано: ${recognizedCount}, правильно распознано: ${validRecognizedCount}`));
                        selectedElement.style.display = 'none';
                    result.push({pos: imagePos, value: cleanedText});
                        foundValidNumber = true;

                        if(recognizedCount >= 9) {
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

        if (!foundValidNumber) {
            console.log(`📌 Позиция ${imagePos + 1} пропущена — не было нужного совпадения. ${uncknownNumber}`);
            uncknownNumber++;

            if(recognizedCount + uncknownNumber === 9) {
                alert('Выберите нужное число и нажмите Submit Selection внизу под картинками ' + `📌 Позиция ${imagePos + 1} пропущена — не было нужного совпадения.`);
            }
        }
    }

function preprocessImageWithOpenCV(imageUrl, mode) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = imageUrl;

            img.onload = () => {
                const mat = cv.imread(img);
                const gray = new cv.Mat();
                const canvas = document.createElement('canvas');

                try {
                    switch (mode) {
                       case 'gray_and_median_blur_with_normalization':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.medianBlur(gray, gray, 3);
                            cv.normalize(gray, gray, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, gray);
                            resolve(canvas.toDataURL());
                            return;
                       case 'smooth_filter':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var smoothed = new cv.Mat();
                            cv.GaussianBlur(gray, smoothed, new cv.Size(5, 5), 0);
                            cv.imshow(canvas, smoothed);
                            smoothed.delete();
                            resolve(canvas.toDataURL());
                            return;
                       case 'pyramid_upscale':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var down = new cv.Mat();
                            var up = new cv.Mat();
                            cv.pyrDown(gray, down);
                            cv.pyrUp(down, up);
                            cv.normalize(up, up, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up);
                            down.delete();
                            up.delete();
                            resolve(canvas.toDataURL());
                            return;
                       case 'median_filter_simple':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.medianBlur(gray, gray, 3);
                            cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            cv.imshow(canvas, gray);
                            resolve(canvas.toDataURL());
                            return;
                       case 'median_blur_simple':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.medianBlur(gray, gray, 5);
                            cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            cv.imshow(canvas, gray);
                            resolve(canvas.toDataURL());
                            return;
                       case 'gaussian_blur_simple':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
                            cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            cv.imshow(canvas, gray);
                            resolve(canvas.toDataURL());
                            return;
                        case 'gray_and_gaussian_blur':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.equalizeHist(gray, gray);
                            cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 1);
                            cv.imshow(canvas, gray);
                            resolve(canvas.toDataURL());
                            return;
                       case 'pyramid_up':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.equalizeHist(gray, gray);
                            var scaledDown = new cv.Mat();  // Заменили 'down' на 'scaledDown'
                            var scaledUp = new cv.Mat();    // Заменили 'up' на 'scaledUp'
                            cv.pyrDown(gray, scaledDown);
                            cv.pyrUp(scaledDown, scaledUp);
                            cv.normalize(scaledUp, scaledUp, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, scaledUp);
                            scaledDown.delete();
                            scaledUp.delete();
                            resolve(canvas.toDataURL());
                            return;
                       case 'gray_blur_and_pyramid':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.equalizeHist(gray, gray);
                            cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 1);

                            var pyrDownMat = new cv.Mat();
                            var pyrUpMat = new cv.Mat();
                            cv.pyrDown(gray, pyrDownMat);
                            cv.pyrUp(pyrDownMat, pyrUpMat);
                            cv.normalize(pyrUpMat, pyrUpMat, 0, 255, cv.NORM_MINMAX);

                            cv.imshow(canvas, pyrUpMat);
                            resolve(canvas.toDataURL());
                            pyrDownMat.delete();
                            pyrUpMat.delete();
                            return;
                       case 'smooth_and_pyramid':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var blurMat = new cv.Mat();
                            cv.GaussianBlur(gray, blurMat, new cv.Size(5, 5), 0);
                            var reducedMat = new cv.Mat();
                            var expandedMat = new cv.Mat();
                            cv.pyrDown(blurMat, reducedMat);
                            cv.pyrUp(reducedMat, expandedMat);
                            cv.normalize(expandedMat, expandedMat, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, expandedMat);
                            resolve(canvas.toDataURL());
                            blurMat.delete();
                            reducedMat.delete();
                            expandedMat.delete();
                            return;
                       case 'gray_hist_blur_pyramid':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);               // 1. Градации серого
                            cv.equalizeHist(gray, gray);                              // 2. Выравнивание гистограммы
                            cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 1);        // 3. Гауссово размытие

                            var pyrDownMat1 = new cv.Mat();
                            var pyrUpMat1 = new cv.Mat();
                            cv.pyrDown(gray, pyrDownMat1);                            // 4. Уменьшение
                            cv.pyrUp(pyrDownMat1, pyrUpMat1);                         // 5. Увеличение

                            cv.normalize(pyrUpMat1, pyrUpMat1, 0, 255, cv.NORM_MINMAX); // ← Была ошибка: pyrUpMat → pyrUpMat1

                            cv.imshow(canvas, pyrUpMat1);
                            resolve(canvas.toDataURL());

                            pyrDownMat1.delete();
                            pyrUpMat1.delete();
                            return;
                       case 'gray_and_median_blur_with_normalization':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.medianBlur(gray, gray, 3);
                            cv.normalize(gray, gray, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, gray);
                            resolve(canvas.toDataURL());
                            return;
                        case 'gray_and_gaussian_blur':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.equalizeHist(gray, gray);
                            cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 1);
                            cv.imshow(canvas, gray);
                            resolve(canvas.toDataURL());
                            return;
                        case 'unsharp_mask':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  // создаём слегка размытую копию
                            var blur = new cv.Mat();
                            cv.GaussianBlur(gray, blur, new cv.Size(0, 0), 3);
  // комбинируем исходное + усиленное различие
                            cv.addWeighted(gray, 1.5, blur, -0.5, 0, gray);
                            blur.delete();
                            cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            cv.imshow(canvas, gray);
                            resolve(canvas.toDataURL());
                            return;

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
