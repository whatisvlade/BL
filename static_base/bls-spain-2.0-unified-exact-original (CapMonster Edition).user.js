// ==UserScript==
// @name         bls-spain-2.0-unified-exact-original (CapMonster Edition)
// @namespace    http://tampermonkey.net/
// @version      2025-10-29-v9
// @description  Оригинальная логика + CapMonster ImageToTextTask через Tampermonkey (без CORS проблем) + нормализация первых N цифр
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
// @grant        GM_xmlhttpRequest
// @connect      api.capmonster.cloud
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ===== CapMonster Config =====
    const CAPMONSTER = {
        clientKey: 'c16654a22ee24ae016c6d371f625ff9c', // ВСТАВЬТЕ ваш ключ CapMonster
        recognizingThreshold: 65, // 0-100; при не достижении — unsolvable без списания
        numeric: 1,               // 1 = только цифры
        caseSensitive: false,     // регистр (для цифр обычно false)
        pollIntervalMs: 1000,     // опрос результата
        timeoutMs: 15000,         // таймаут ожидания
        useProxyEndpoint: false,  // false = прямой вызов через GM_xmlhttpRequest
        proxyEndpoint: 'https://your-server.example.com/capmonster/solve' // если будет свой сервер — укажите здесь и поставьте true
        // capMonsterModule: 'yandex', // при необходимости можно задать модуль
    };

    const wait = (ms) => new Promise(res => setTimeout(res, ms));

    // Обёртка над GM_xmlhttpRequest для JSON
    function gmRequestJSON({ url, method = 'GET', headers = {}, data = undefined, timeout = 20000 }) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                url,
                method,
                headers,
                data,
                timeout,
                responseType: 'json',
                onload: (resp) => {
                    try {
                        const status = resp.status;
                        const json = typeof resp.response === 'object' && resp.response !== null
                            ? resp.response
                            : (resp.responseText ? JSON.parse(resp.responseText) : null);
                        resolve({ status, json, raw: resp });
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: (e) => reject(e),
                ontimeout: () => reject(new Error('GM_xmlhttpRequest timeout'))
            });
        });
    }

    async function sendCaptchaToCapMonster(imageDataUrl) {
        try {
            const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');

            if (CAPMONSTER.useProxyEndpoint) {
                const { status, json } = await gmRequestJSON({
                    url: CAPMONSTER.proxyEndpoint,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({
                        imageBase64: base64,
                        options: {
                            recognizingThreshold: CAPMONSTER.recognizingThreshold,
                            numeric: CAPMONSTER.numeric,
                            case: CAPMONSTER.caseSensitive
                        }
                    }),
                    timeout: CAPMONSTER.timeoutMs + 5000
                });
                if (status >= 200 && status < 300 && json && typeof json.text === 'string') {
                    return json.text.trim();
                }
                console.warn('CapMonster proxy error/status:', status, json);
                return null;
            } else {
                // 1) createTask
                const { status: cStatus, json: cJson } = await gmRequestJSON({
                    url: 'https://api.capmonster.cloud/createTask',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({
                        clientKey: CAPMONSTER.clientKey,
                        task: {
                            type: 'ImageToTextTask',
                            body: base64,
                            recognizingThreshold: CAPMONSTER.recognizingThreshold,
                            numeric: CAPMONSTER.numeric,
                            case: CAPMONSTER.caseSensitive
                            // ...(CAPMONSTER.capMonsterModule ? { capMonsterModule: CAPMONSTER.capMonsterModule } : {})
                        }
                    }),
                    timeout: 20000
                });
                if (cStatus < 200 || cStatus >= 300 || !cJson || (cJson.errorId && cJson.errorId !== 0)) {
                    console.warn('CapMonster createTask error:', cStatus, cJson);
                    return null;
                }
                const taskId = cJson.taskId;
                if (!taskId) {
                    console.warn('CapMonster: no taskId');
                    return null;
                }

                // 2) getTaskResult (polling)
                const started = Date.now();
                while (Date.now() - started < CAPMONSTER.timeoutMs) {
                    await wait(CAPMONSTER.pollIntervalMs);
                    const { status: gStatus, json: gJson } = await gmRequestJSON({
                        url: 'https://api.capmonster.cloud/getTaskResult',
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        data: JSON.stringify({ clientKey: CAPMONSTER.clientKey, taskId }),
                        timeout: 20000
                    });
                    if (gStatus < 200 || gStatus >= 300 || !gJson || (gJson.errorId && gJson.errorId !== 0)) {
                        console.warn('CapMonster getTaskResult error:', gStatus, gJson);
                        return null;
                    }
                    if (gJson.status === 'ready') {
                        return (gJson.solution && gJson.solution.text || '').trim();
                    }
                }
                console.warn('CapMonster timeout waiting result');
                return null;
            }
        } catch (e) {
            console.error('CapMonster error:', e);
            return null;
        }
    }

    // ОБЩИЕ ФЛАГИ СТРАНИЦЫ — объявляем ОДИН раз
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

    const modes = [
        'pyramid_upscale','smooth_and_pyramid','pyramid_up','median_filter_simple','pyramid_up','pyramid_upscale','two_stage_threshold'
    ];

    // ============================================
    // ОБЩИЕ ФУНКЦИИ
    // ============================================

    // Берём только первые N цифр (N = длина CURRENT_NUMBER или 3 по умолчанию)
    function normalizeDigits(rawText, targetLen = (CURRENT_NUMBER ? CURRENT_NUMBER.length : 3)) {
        const digits = String(rawText || '').replace(/\D/g, '');
        return digits.slice(0, targetLen);
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
            img.onerror = () => reject(new Error('Image load failed'));
        });
    }

    // ============================================
    // СКРИПТ 1: AppointmentCaptcha
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

        function isElementVisible(element, doc) {
            if (!element) return false;

            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1 || element.offsetWidth <= 0 || element.offsetHeight <= 0) {
                return false;
            }

            const rect = element.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) return false;
            if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return false;

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
                        if (hasImages) return el;
                    }
                    return elements[0];
                }
            }
            return doc.body;
        }

        function areElementsSimilar(element1, element2) {
            if (element1.element === element2.element) return true;

            const rect1 = element1.rect;
            const rect2 = element2.rect;

            const overlap = !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom);
            if (overlap) {
                const overlapWidth = Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left);
                const overlapHeight = Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top);
                const area1 = rect1.width * rect1.height;
                const area2 = rect2.width * rect2.height;
                const overlapArea = overlapWidth * overlapHeight;
                if (overlapArea > 0.5 * Math.min(area1, area2)) return true;
            }

            if (element1.element.contains(element2.element) || element2.element.contains(element1.element)) return true;

            return false;
        }

        function removeDuplicateElements(elements) {
            const uniqueElements = [];
            for (const element of elements) {
                const isDuplicate = uniqueElements.some(uniqueElement => areElementsSimilar(element, uniqueElement));
                if (!isDuplicate) uniqueElements.push(element);
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
                withPointerCursor: images.filter(item => window.getComputedStyle(item.element).cursor === 'pointer'),
                withBorder: images.filter(item => {
                    const style = window.getComputedStyle(item.element);
                    return style.border && style.border !== 'none' && !style.border.includes('0px');
                }),
                largeImages: images.filter(item => item.rect.width >= 100 && item.rect.height >= 100)
            };

            const potentialGroups = [];
            for (const [name, group] of Object.entries(groups)) {
                if (group.length >= 7 && group.length <= 12) {
                    potentialGroups.push({ name, count: group.length, elements: group });
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

                    let matchingElements = 0;
                    for (const element of group.elements) {
                        if (uniqueGroups[0].elements.some(existingElement => areElementsSimilar(element, existingElement))) {
                            matchingElements++;
                        }
                    }
                    if (matchingElements <= group.elements.length * 0.5) {
                        uniqueGroups.push(group);
                    }
                }

                potentialGroups.length = 0;
                potentialGroups.push(...uniqueGroups);
            }

            return { all: groups, potential: potentialGroups };
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

                const uniqueElements = new Set(finalGroup.map(x => x.element));

                visibleImages.forEach(item => {
                    const isInFinalGroup = finalGroup.some(bestItem => areElementsSimilar(item, bestItem));
                    const isInCaptchaClassGroup = groups.all.withCaptchaClass.includes(item);
                    const isInExcludedDiv = item.element.closest('.text-center.row.no-gutters.img-actions') !== null;
                    const isButton = item.element.classList.contains('img-action') || item.element.closest('.img-action-div') !== null || ['Submit','Reload','Clear Selection'].includes(item.element.innerHTML);

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

                    const isButton = el.classList.contains('img-action') || el.closest('.img-action-div') !== null || ['Submit','Reload','Clear Selection'].includes(el.innerHTML);

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
                console.log(`⏭️ Позиция ${imagePos + 1} пропущена.`);
                return;
            }

            const originalImageUrl = imageUrl;
            let foundValidNumber = false;
            const resultsCount = {};
            const targetLen = (CURRENT_NUMBER && CURRENT_NUMBER.length) || 3;

            for (let index = 0; index < modes.length; index++) {
                try {
                    const processedImageUrl = await preprocessImageWithOpenCV(originalImageUrl, modes[index]);
                    let { data: { text } } = await Tesseract.recognize(processedImageUrl, 'eng', {
                        tessedit_char_whitelist: '0123456789',
                        tessedit_pageseg_mode: 6,
                    });
                    let cleanedText = normalizeDigits(text, targetLen);
                    console.log(`🔍 Tesseract [${modes[index]}]: "${cleanedText}" (${imagePos + 1})`);

                    if (!cleanedText || cleanedText.startsWith("0") || cleanedText.length < targetLen) {
                        console.log(`⚠️ Tesseract не дал уверенный результат ("${cleanedText}"), пробуем CapMonster...`);
                        const cmText = await sendCaptchaToCapMonster(processedImageUrl);
                        if (cmText) {
                            cleanedText = normalizeDigits(cmText, targetLen);
                            console.log(`🔍 CapMonster: "${cleanedText}" на позиции ${imagePos + 1}`);
                        } else {
                            console.log('⚠️ CapMonster не распознал текст.');
                            continue;
                        }
                    }

                    if (cleanedText.length === targetLen && cleanedText === CURRENT_NUMBER) {
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
                            index = modes.length;
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
                    groups.potential.forEach((group) => {
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

        // Плавающая кнопка
        (function() {
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
    // СКРИПТ 2: LoginCaptcha
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
            console.log('🟢 CURRENT_NUMBER:', CURRENT_NUMBER);
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
            const targetLen = (CURRENT_NUMBER && CURRENT_NUMBER.length) || 3;

            for (let index = 0; index < modes.length; index++) {
                try {
                    const processedImageUrl = await preprocessImageWithOpenCV(originalImageUrl, modes[index]);
                    let { data: { text } } = await Tesseract.recognize(processedImageUrl, 'eng', {
                        tessedit_char_whitelist: '0123456789',
                        tessedit_pageseg_mode: 6
                    });
                    let cleanedText = normalizeDigits(text, targetLen);
                    console.log(`🔍 Режим: ${modes[index]}, Tesseract: "${cleanedText}" (${imagePos + 1})`);

                    if (!cleanedText || cleanedText.startsWith("0") || cleanedText.length < targetLen) {
                        const cmText = await sendCaptchaToCapMonster(processedImageUrl);
                        if (cmText) {
                            cleanedText = normalizeDigits(cmText, targetLen);
                            console.log(`🔍 CapMonster: "${cleanedText}" (${imagePos + 1})`);
                        } else {
                            continue;
                        }
                    }

                    if (cleanedText.length === targetLen && cleanedText === CURRENT_NUMBER) {
                        await delay(50);
                        selectedElement.click();
                        console.log(`✅ "${cleanedText}" совпало — клик (${imagePos + 1})`);
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
            arr.forEach(a => { if (!uniq.some(b => isSameRect(a.rect, b.rect))) uniq.push(a); });
            return uniq;
        }

        function isSameRect(r1, r2) {
            return !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
        }

        start();
    }

})();