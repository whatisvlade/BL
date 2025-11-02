// ==UserScript==
// @name         bls-spain-2.0-unified-exact-original
// @namespace    http://tampermonkey.net/
// @version      2025-10-29-v5
// @description  ТОЧНАЯ копия оригинальной логики поиска картинок
// @author       You
// @match        https://appointment.blsspainbelarus.by/Global/Appointment/AppointmentCaptcha*
// @match        https://appointment.blsspainbelarus.by/Global/appointment/appointmentcaptcha*
// @match        https://belarus.blsspainglobal.com/Global/Appointment/AppointmentCaptcha*
// @match        https://belarus.blsspainglobal.com/Global/appointment/appointmentcaptcha*
// @match        https://appointment.blsspainbelarus.by/Global/newcaptcha/logincaptcha*
// @match        https://appointment.blsspainbelarus.by/Global/NewCaptcha/LoginCaptcha*
// @match        https://appointment.blsspainrussia.ru/Global/newcaptcha/logincaptcha*
// @match        https://appointment.blsspainrussia.ru/Global/NewCaptcha/LoginCaptcha*
// @exclude      https://appointment.blsspainbelarus.by/Global/NewCaptcha/LoginCaptchaSubmit*
// @exclude      https://appointment.blsspainbelarus.by/Global/NewCaptcha/logincaptchasubmit*
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js
// @require      https://docs.opencv.org/4.8.0/opencv.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const currentUrl = window.location.href.toLowerCase();
    const isLoginCaptcha = currentUrl.includes('/newcaptcha/') || currentUrl.includes('/logincaptcha');
    const isAppointmentCaptcha = currentUrl.includes('/appointmentcaptcha');

    console.log(`🟢 Script loaded. Type: ${isLoginCaptcha ? 'LoginCaptcha' : isAppointmentCaptcha ? 'AppointmentCaptcha' : 'UNKNOWN'}`);

    let submitClicked = false;
    let CURRENT_NUMBER = undefined;
    let recognizedCount = 0;
    let validRecognizedCount = 0;
    let uncknownNumber = 0;
    let result = [];
    let trueCaptcha503Count = 0;
    let trueCaptchaBlockedUntil = 0;

    const modes = [
       'pyramid_upscale','two_stage_threshold','pyramid_up','smooth_and_pyramid','median_filter_simple','pyramid_up','pyramid_upscale','smooth_and_pyramid','two_stage_threshold'
       

    ];

    // ============================================
    // ОБЩИЕ ФУНКЦИИ
    // ============================================

    async function sendCaptchaToTrueCaptcha(imageUrl) {
        if (Date.now() < trueCaptchaBlockedUntil) {
            console.warn('TrueCaptcha временно отключён');
            return null;
        }
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
        const params = {
            userid: 'vladislavzyablov1997@gmail.com',
            apikey: 'awL93AjZ7rs1DAwZvZh7',
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
                if (trueCaptcha503Count >= 3) {
                    trueCaptchaBlockedUntil = Date.now() + 10 * 60 * 1000;
                    trueCaptcha503Count = 0;
                }
                return null;
            } else {
                trueCaptcha503Count = 0;
            }
            const result = await response.json();
            return result?.result?.trim() || null;
        } catch (err) {
            console.error('TrueCaptcha error:', err);
            return null;
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
                        case 'pyramid_upscale':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var down = new cv.Mat(), up = new cv.Mat();
                            cv.pyrDown(gray, down); cv.pyrUp(down, up);
                            cv.normalize(up, up, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up); down.delete(); up.delete();
                            break;
                        case 'two_stage_threshold':
                            var scaled = new cv.Mat();
                            cv.resize(mat, scaled, new cv.Size(0, 0), 1.5, 1.5, cv.INTER_CUBIC);
                            cv.cvtColor(scaled, gray, cv.COLOR_RGBA2GRAY);
                            var blurs = new cv.Mat(); cv.GaussianBlur(gray, blurs, new cv.Size(5, 5), 0);
                            var thresh1 = new cv.Mat(); cv.threshold(blurs, thresh1, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            var kernels = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
                            var opened = new cv.Mat(); cv.morphologyEx(thresh1, opened, cv.MORPH_OPEN, kernels);
                            var down2 = new cv.Mat(), up2 = new cv.Mat();
                            cv.pyrDown(opened, down2); cv.pyrUp(down2, up2);
                            cv.normalize(up2, up2, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up2);
                            scaled.delete(); blurs.delete(); thresh1.delete(); kernels.delete(); opened.delete(); down2.delete(); up2.delete();
                            break;
                        case 'smooth_and_pyramid':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            var blurMat = new cv.Mat(), reducedMat = new cv.Mat(), expandedMat = new cv.Mat();
                            cv.GaussianBlur(gray, blurMat, new cv.Size(5, 5), 0);
                            cv.pyrDown(blurMat, reducedMat); cv.pyrUp(reducedMat, expandedMat);
                            cv.normalize(expandedMat, expandedMat, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, expandedMat); blurMat.delete(); reducedMat.delete(); expandedMat.delete();
                            break;
                        case 'median_filter_simple':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.medianBlur(gray, gray, 3);
                            cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
                            var down3 = new cv.Mat(), up3 = new cv.Mat();
                            cv.pyrDown(gray, down3); cv.pyrUp(down3, up3);
                            cv.normalize(up3, up3, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, up3); down3.delete(); up3.delete();
                            break;
                        case 'pyramid_up':
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY); cv.equalizeHist(gray, gray);
                            var scaledDown = new cv.Mat(), scaledUp = new cv.Mat();
                            cv.pyrDown(gray, scaledDown); cv.pyrUp(scaledDown, scaledUp);
                            cv.normalize(scaledUp, scaledUp, 0, 255, cv.NORM_MINMAX);
                            cv.imshow(canvas, scaledUp); scaledDown.delete(); scaledUp.delete();
                            break;
                        default:
                            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
                            cv.imshow(canvas, gray);
                    }
                    gray.delete();
                    mat.delete();
                    resolve(canvas.toDataURL());
                } catch (error) {
                    console.error('OpenCV error:', error);
                    gray.delete();
                    mat.delete();
                    reject(error);
                }
            };
            img.onerror = (error) => reject(new Error('Image load failed'));
        });
    }

    // ============================================
    // СКРИПТ 1: AppointmentCaptcha (100% ОРИГИНАЛ)
    // ============================================

    if (isAppointmentCaptcha) {
        console.log('🔵 Запуск логики AppointmentCaptcha');

        $(document).ready(function () {
            waitForLoadingMaskToDisappear(() => {
                console.log('✅ Loading завершен.');
                findVisibleDivLikeDevAbilities();
                analyzeAndSelectCaptchaImages(false);
            });
        });

        function waitForLoadingMaskToDisappear(callback) {
            const interval = setInterval(() => {
                const loadingMask = document.querySelector('.k-loading-mask');
                const capchaContainer = document.querySelector('.main-div-container');
                const preloader = document.querySelector('.preloader');
                const preloaderStyle = preloader ? preloader.getAttribute('style') : null;

                console.log(`⏳ Проверка: loadingMask=${!!loadingMask}, container=${!!capchaContainer}, preloaderStyle=${preloaderStyle}`);

                if (!loadingMask && capchaContainer && preloaderStyle) {
                    clearInterval(interval);
                    callback();
                }
            }, 700);
        }

        function findVisibleDivLikeDevAbilities() {
            try {
                const divs = document.querySelectorAll('div[class^="col-12 box-label"]');
                console.log(`🔍 Найдено divs: ${divs.length}`);

                for (const div of divs) {
                    const rect = div.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const elementAtPoint = document.elementFromPoint(centerX, centerY);

                    if (elementAtPoint === div) {
                        let text = div.textContent.trim();
                        console.log(`📝 Текст: "${text}"`);

                        text = text.replace('Please select all boxes with number', 'Выберите картинки с числом');
                        const numberMatch = text.match(/\d+/);

                        if (numberMatch) {
                            const number = numberMatch[0];
                            CURRENT_NUMBER = number;
                            text = text.replace(number, `<span style="color: green; font-weight: bold; font-size: 1.5em;">${number}</span>`);
                            div.innerHTML = text;
                            console.log(`✅ CURRENT_NUMBER: ${CURRENT_NUMBER}`);
                            return;
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Ошибка findVisibleDivLikeDevAbilities:', error);
            }
        }

        // ТОЧНАЯ КОПИЯ из оригинала
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
                    imageSrc = style.backgroundImage.slice(5, -2);
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

        function selectCaptchaImageByIndex(doc, elements, index) {
            if (index < 0 || index >= elements.length) {
                console.error(`Индекс ${index} выходит за пределы массива элементов (0-${elements.length - 1})`);
                return null;
            }

            try {
                const selectedElement = elements[index].element;
                console.log(`Проверяется элемент #${index + 1}: ${elements[index].id || elements[index].classes || 'без идентификатора'}`);

                const imageUrl = selectedElement.src || selectedElement.style.backgroundImage.slice(5, -2);
                console.log(`URL изображения: ${imageUrl}`);

                recognizeCaptchaText(imageUrl, index, selectedElement, doc);
                return elements[index];
            } catch (error) {
                console.error(`Ошибка при выборе элемента #${index + 1}: ${error.message}`);
                return null;
            }
        }

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

                return;
            }

            const originalImageUrl = imageUrl;
            let foundValidNumber = false;
            const resultsCount = {};

            for (let index = 0; index < modes.length; index++) {
                try {
                    const processedImageUrl = await preprocessImageWithOpenCV(originalImageUrl, modes[index]);

                    let { data: { text } } = await Tesseract.recognize(
                        processedImageUrl,
                        'eng',
                        {
                            tessedit_char_whitelist: '0123456789',
                            tessedit_pageseg_mode: 6,
                        }
                    );
                    let cleanedText = text.replace(/\D/g, '').slice(0, 3);


                    if (!cleanedText || cleanedText.startsWith("0") || cleanedText.length < 3) {

                        const trueCaptchaText = await sendCaptchaToTrueCaptcha(processedImageUrl);
                        if (trueCaptchaText) {
                            cleanedText = trueCaptchaText.replace(/\D/g, '').slice(0, 3);

                        } else {

                            continue;
                        }
                    }

                    if (/^\d{3}$/.test(cleanedText) && cleanedText === CURRENT_NUMBER) {
                        await delay(50);
                        selectedElement.click();

                        foundValidNumber = true;
                        validRecognizedCount++;
                        recognizedCount++;
                        result.push({ pos: imagePos, value: cleanedText });
                        selectedElement.style.display = 'none';
                        if (validRecognizedCount >= 6 || recognizedCount >= 9) {
                            clickSubmitButton(doc);
                            index = modes.length;
                        }
                        break;
                    }

                    resultsCount[cleanedText] = (resultsCount[cleanedText] || 0) + 1;
                    if (resultsCount[cleanedText] === 2) {
                        if (cleanedText === CURRENT_NUMBER) {
                            await delay(50);
                            selectedElement.click();

                            foundValidNumber = true;
                        } else {
                            recognizedCount++;

                            selectedElement.style.display = 'none';
                            result.push({ pos: imagePos, value: cleanedText });
                            foundValidNumber = true;
                            if (recognizedCount >= 9) {
                                clickSubmitButton(doc);
                            }
                        }
                        break;
                    } else {

                    }
                } catch (err) {
                    console.error(`❌ Ошибка распознавания в режиме ${modes[index]}:`, err);
                }
            }

            if (!foundValidNumber) {

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


                const captchaContainer = findCaptchaContainer(document);


                const visibleImages = potentialImages.filter(item => {
                    return captchaContainer.contains(item.element) && isElementVisible(item.element, document);
                });


                const uniqueVisibleImages = removeDuplicateElements(visibleImages);


                const groups = groupCaptchaImages(uniqueVisibleImages);


                let filteredImages = uniqueVisibleImages;
                filteredImages = filterAndRemoveUnnecessaryElements(uniqueVisibleImages, groups, document);

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

        // Кнопка
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
        })();
    }

    // ============================================
    // СКРИПТ 2: LoginCaptcha (без изменений)
    // ============================================


    if (isLoginCaptcha) {
        console.log('🟠 Запуск логики LoginCaptcha (parallel)');

        function start() {
            if (document.querySelectorAll('.box-label').length) {
                run();
            } else {
                setTimeout(start, 500);
            }
        }

        function run() {
            const label = findVisibleBoxLabel();
            if (!label) return;
            highlightBoxLabel(label);
            setTimeout(() => analyzeAndSelectCaptchaImagesParallel(), 700);
        }

        function findVisibleBoxLabel() {
            for (const div of document.querySelectorAll('.box-label')) {
                const r = div.getBoundingClientRect();
                const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                if (el === div || div.contains(el)) return div;
            }
            return null;
        }

        function highlightBoxLabel(div) {
            let text = div.textContent.replace('Please select all boxes with number', 'Выберите картинки с числом');
            const m = text.match(/\d+/);
            if (m) {
                CURRENT_NUMBER = m[0];
                text = text.replace(CURRENT_NUMBER, `<span style="color:green;font-weight:bold;font-size:1.5em;">${CURRENT_NUMBER}</span>`);
            }
            div.innerHTML = text;
            div.style.transition = 'background 0.5s';
            div.style.background = '#ffe0b2';
            setTimeout(() => div.style.background = '', 50);

        }

        async function analyzeAndSelectCaptchaImagesParallel() {
            if (submitClicked || validRecognizedCount >= 6) return;
            const container = findCaptchaContainer2(document);
            const allImgs = findAllPotentialCaptchaImages2(container);
            const visible = allImgs.filter(item => isElementVisible2(item.element) && isTopMost(item.element));
            allImgs.forEach(img => {
                if (!visible.some(visibleImg => visibleImg.src === img.src)) {
                    img.element.style.display = 'none';
                }
            });
            if (!visible.length) return;
            const unique = removeDuplicateElements2(visible);
            await Promise.all(unique.map((item, i) => recognizeCaptchaTextParallel(item.src, item.element, i)));
            if (!submitClicked && validRecognizedCount === 2 && unique.length === 9) {
                const remaining = unique.find(item => item.element.style.display !== 'none');
                if (remaining) {
                    remaining.element.click();
                    clickSubmitButton2(document);
                    return;
                }
            }
            setTimeout(() => {
                if (!submitClicked && validRecognizedCount === 0) {
                    alert('❗ Не удалось распознать. Проверьте вручную.');
                }
            }, 500);
        }

        async function recognizeCaptchaTextParallel(imageUrl, selectedElement, imagePos) {
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            if (imagePos === 9) return;
            const originalImageUrl = imageUrl;
            let foundValidNumber = false;
            const resultsCount = {};

            for (let index = 0; index < modes.length; index++) {
                try {
                    const processedImageUrl = await preprocessImageWithOpenCV(originalImageUrl, modes[index]);
                    let { data: { text } } = await Tesseract.recognize(processedImageUrl, 'eng', {
                        tessedit_char_whitelist: '0123456789',
                        tessedit_pageseg_mode: 6
                    });
                    let cleanedText = text.replace(/\D/g, '').slice(0, 3);


                    if (!cleanedText || cleanedText.startsWith("0") || cleanedText.length < 3) {
                        const trueCaptchaText = await sendCaptchaToTrueCaptcha(processedImageUrl);
                        if (trueCaptchaText) {
                            cleanedText = trueCaptchaText.replace(/\D/g, '').slice(0, 3);

                        } else {
                            continue;
                        }
                    }

                    if (/^\d{3}$/.test(cleanedText) && cleanedText === CURRENT_NUMBER) {
                        await delay(50);
                        selectedElement.click();

                        foundValidNumber = true;
                        validRecognizedCount++;
                        recognizedCount++;
                        result.push({ pos: imagePos, value: cleanedText });
                        selectedElement.style.display = 'none';
                        if (validRecognizedCount >= 6 || recognizedCount >= 9) {
                            clickSubmitButton2(document);
                            break;
                        }
                        break;
                    }

                    resultsCount[cleanedText] = (resultsCount[cleanedText] || 0) + 1;
                    if (resultsCount[cleanedText] === 2) {
                        selectedElement.style.display = 'none';
                        recognizedCount++;
                        foundValidNumber = true;
                        result.push({ pos: imagePos, value: cleanedText });
                        if (recognizedCount >= 9) clickSubmitButton2(document);
                        break;
                    }
                } catch (err) {
                    console.error(`❌ Ошибка в режиме ${modes[index]}:`, err);
                }
            }

            if (!foundValidNumber) {
                uncknownNumber++;
                if (recognizedCount + uncknownNumber === 9 && validRecognizedCount !== 2) {
                    clickSubmitButton2(document);
                }
            }
        }

        function clickSubmitButton2(doc) {
            if (submitClicked) return;
            const btn = doc.getElementById('btnVerify');
            if (btn) {
                btn.click();
                submitClicked = true;
                console.log('✅ Submit clicked');
            }
        }

        function findCaptchaContainer2(doc) {
            for (const sel of ['.main-div-container', '#captcha-main-div', '.captcha-grid']) {
                const el = doc.querySelector(sel);
                if (el) return el;
            }
            return doc.body;
        }

        function findAllPotentialCaptchaImages2(container) {
            const out = [];
            container.querySelectorAll('img, [style*="background-image"]').forEach(el => {
                const bg = getComputedStyle(el).backgroundImage;
                const src = el.src || bg.replace(/^url\("?|"?\)$/g, '');
                if (src) out.push({ element: el, src, rect: el.getBoundingClientRect() });
            });
            return out;
        }

        function isElementVisible2(el) {
            const s = getComputedStyle(el);
            if (s.display === 'none' || s.visibility !== 'visible') return false;
            const r = el.getBoundingClientRect();
            return r.width > 10 && r.height > 10 && r.top < innerHeight && r.left < innerWidth;
        }

        function isTopMost(el) {
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            const topEl = document.elementFromPoint(x, y);
            return topEl === el || el.contains(topEl);
        }

        function removeDuplicateElements2(arr) {
            const uniq = [];
            arr.forEach(a => {
                if (!uniq.some(b => isSameRect(a.rect, b.rect))) uniq.push(a);
            });
            return uniq;
        }

        function isSameRect(r1, r2) {
            return !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
        }

        start();
    }

})();
