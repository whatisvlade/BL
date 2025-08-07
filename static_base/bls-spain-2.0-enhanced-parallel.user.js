// ==UserScript==
// @name         bls-spain-2.0-enhanced-parallel
// @namespace    http://tampermonkey.net/
// @version      2025-06-26.3
// @description  Параллельное распознавание капчи с ускоренной обработкой (Promise.all), автоввод, OCR.space, OpenCV.js, досрочная отправка при успехе >=6, максимум 9 картинок, финальный alert при неудаче всех попыток, обработка до 8 режимов OpenCV.js, оптимизировано для BLS Belarus Spain (newcaptcha). Полный код с предобработкой, анализом, фильтрацией и кликами. Работает быстро и надёжно с captcha image grid. Поддержка submitClicked защиты и распараллеленного анализа.
// @author       You
// @match        https://appointment.blsspainrussia.ru/Global/newcaptcha/logincaptcha*
// @match        https://appointment.blsspainrussia.ru/Global/NewCaptcha/LoginCaptcha*
// @match        https://belarus.blsspainglobal.com/Global/newcaptcha/logincaptcha*
// @match        https://belarus.blsspainglobal.com/Global/NewCaptcha/LoginCaptcha*
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js
// @require      https://docs.opencv.org/5.0.0-alpha/opencv.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    console.log('🟢 bls-spain-2.0-enhanced-parallel loaded');

    let submitClicked = false;
    let CURRENT_NUMBER;
    let recognizedCount = 0;
    let validRecognizedCount = 0;
    let uncknownNumber = 0;
    const result = [];

    const modes = [
        'pyramid_upscale', 'smooth_and_pyramid','gray_and_median_blur_with_normalization', 'gray_hist_blur_pyramid',
        'smooth_filter', 'pyramid_up', 'pyramid_upscale','pyramid_up','gray_and_median_blur_with_normalization',
        'gaussian_blur_simple', 'gray_blur_and_pyramid','unsharp_mask','smooth_and_pyramid'
    ];

    start();

    function start() {
        console.log('🟢 Auto-start');
        if (document.querySelectorAll('.box-label').length) {
            run();
        } else {
            console.warn('⚠️ box-label отсутствует, повторный запуск через 500ms');
            setTimeout(start, 500);
        }
    }

    function run() {
        const label = findVisibleBoxLabel();
        if (!label) {
            console.warn('⚠️ box-label не найден');
            return;
        }
        highlightBoxLabel(label);
        setTimeout(() => analyzeAndSelectCaptchaImagesParallel(), 600);
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
    
        if (submitClicked || validRecognizedCount >= 6) {
            alert('🏁 Достигнут порог распознаваний или уже отправлено — пропускаем анализ');
            return;
        }

        const container = findCaptchaContainer(document);
        const allImgs = findAllPotentialCaptchaImages(container);
        const visible = allImgs.filter(item =>
            isElementVisible(item.element) && isTopMost(item.element)
        );
        allImgs.forEach(img => {
            if (!visible.some(visibleImg => visibleImg.src === img.src)) {
                img.element.style.display = 'none';
            }
        });

        if (!visible.length) {
            console.warn('⚠️ Нет видимых картинок');
            return;
        }

        const unique = removeDuplicateElements(visible);
        await Promise.all(
            unique.map((item, i) =>
                recognizeCaptchaText(item.src, item.element, i)
            )
        );

        if (!submitClicked && validRecognizedCount === 2 && unique.length === 9) {
            const remaining = unique.find(item =>
           
                item.element.style.display !== 'none'
            );
            if (remaining) {
                alert('🚀 Выбираем последнюю нераспознанную как совпадающую и отправляем');
                remaining.element.click();
                clickSubmitButton(document);
                return;
            }
        }
    
        setTimeout(() => {
            if (!submitClicked && validRecognizedCount === 0) {
                alert(
                '❗ Не удалось автоматически распознать ни одной подходящей картинки. ' +
                'Проверьте вручную и нажмите Submit Selection.'
                );
            }
        }, 500);
    }


    async function recognizeCaptchaText(imageUrl, selectedElement, imagePos) {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        if (imagePos === 9) {
            console.log(`⏭️ Позиция ${imagePos + 1} пропущена.`);
            return;
        }

        const originalImageUrl = imageUrl;
        let foundValidNumber = false;
        const resultsCount = {};

        for (let index = 0; index < modes.length; index++) {
            try {
                const processedImageUrl = await preprocessImageWithOpenCV(originalImageUrl, modes[index]);
                const { data: { text } } = await Tesseract.recognize(
                    processedImageUrl, 'eng',
                    { tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: 6 }
                );

                let cleanedText = text.replace(/\D/g, '').slice(0, 3);
                console.log(`🔍 Режим: ${modes[index]}, результат Tesseract: "${cleanedText}" на позиции ${imagePos + 1}`);

                if (!cleanedText || cleanedText.startsWith("0") || cleanedText.length < 3) {
                    console.log(`⚠️ Неполное число: "${cleanedText}", пробуем OCR.space.`);
                    const recognizedText = await sendCaptchaToOcrSpace(processedImageUrl);
                    if (recognizedText) {
                        cleanedText = recognizedText.trim();
                        console.log(`🔍 Результат OCR.space: "${cleanedText}" на позиции ${imagePos + 1}`);
                    } else {
                        console.log('⚠️ OCR.space не распознал текст.');
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
                    result.push({ pos: imagePos, value: cleanedText });
                    selectedElement.style.display = 'none';
                    if (validRecognizedCount >= 6 || recognizedCount >= 9) {
                        clickSubmitButton(document);
                        break;
                    }
                    break;
                }

                resultsCount[cleanedText] = (resultsCount[cleanedText] || 0) + 1;

                if (resultsCount[cleanedText] === 2) {
                    selectedElement.style.display = 'none';
                    recognizedCount++;
                    foundValidNumber = true;
                    console.log(`🚫 "${cleanedText}" распознано 2 раза, но не совпадает с CURRENT_NUMBER (${CURRENT_NUMBER})`);
                    result.push({ pos: imagePos, value: cleanedText });
                    if (recognizedCount >= 9) {
                        clickSubmitButton(document);
                    }
                    break;
                } else {
                    console.log(`🔸 "${cleanedText}" пока ${resultsCount[cleanedText]} раз(а).`);
                }

            } catch (err) {
                console.error(`❌ Ошибка в режиме ${modes[index]}:`, err);
            }
        }

        if (!foundValidNumber) {
            console.log(`📌 Позиция ${imagePos + 1} пропущена — не было совпадения.`);
            uncknownNumber++;

            console.log(`Всего пропущенго: ${uncknownNumber}`);

            if (recognizedCount + uncknownNumber === 9) {
                alert('Выберите нужное число и нажмите Submit Selection внизу под картинками ' + `📌 Позиция ${imagePos + 1} пропущена — не было нужного совпадения.`);
            }
        }
    }

    function clickSubmitButton(doc) {
        if (submitClicked) return;
        const btn = doc.getElementById('btnVerify');
        if (btn) {
            console.log('🟢 clicking Submit');
            btn.click();
            submitClicked = true;
        }
    }

    function findCaptchaContainer(doc) {
        for (const sel of ['.main-div-container', '#captcha-main-div', '.captcha-grid']) {
            const el = doc.querySelector(sel);
            if (el) return el;
        }
        return doc.body;
    }

    function findAllPotentialCaptchaImages(container) {
        const out = [];
        container.querySelectorAll('img, [style*="background-image"]').forEach(el => {
            const bg = getComputedStyle(el).backgroundImage;
            const src = el.src || bg.replace(/^url\("?|"?\)$/g, '');
            if (src) out.push({ element: el, src, rect: el.getBoundingClientRect() });
        });
        return out;
    }

    function isElementVisible(el) {
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

    function removeDuplicateElements(arr) {
        const uniq = [];
        arr.forEach(a => {
            if (!uniq.some(b => isSameRect(a.rect, b.rect))) uniq.push(a);
        });
        return uniq;
    }

    function isSameRect(r1, r2) {
        return !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
    }

    async function sendCaptchaToOcrSpace(dataUrl) {
        const form = new FormData();
        form.append('base64Image', dataUrl);
        form.append('apikey', 'GP88X5P4NYFBX');
        form.append('language', 'eng');
        form.append('OCREngine', '2');
        const r = await fetch('https://apipro2.ocr.space/parse/image', { method: 'POST', body: form });
        const j = await r.json();
        return j.ParsedResults?.[0]?.ParsedText.trim() || '';
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
})();