// ==UserScript==
// @name         bls-spain-2.0-enhanced-parallel
// @namespace    http://tampermonkey.net/
// @version      2025-06-26.3
// @description  Параллельное распознавание капчи с ускоренной обработкой (Promise.all), автоввод, OCR.space, OpenCV.js, досрочная отправка при успехе >=6, максимум 9 картинок, финальный alert при неудаче всех попыток, обработка до 8 режимов OpenCV.js, оптимизировано для BLS Belarus Spain (newcaptcha). Полный код с предобработкой, анализом, фильтрацией и кликами. Работает быстро и надёжно с captcha image grid. Поддержка submitClicked защиты и распараллеленного анализа.
// @author       You
// @match        https://appointment.blsspainbelarus.by/Global/newcaptcha/logincaptcha*
// @match        https://appointment.blsspainbelarus.by/Global/NewCaptcha/LoginCaptcha*
// @match        https://appointment.blsspainrussia.ru/Global/newcaptcha/logincaptcha*
// @match        https://appointment.blsspainrussia.ru/Global/NewCaptcha/LoginCaptcha*
// @exclude      https://appointment.blsspainbelarus.by/Global/NewCaptcha/LoginCaptchaSubmit*
// @exclude      https://appointment.blsspainbelarus.by/Global/NewCaptcha/logincaptchasubmit*
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@6.0/dist/tesseract.min.js
// @require      https://docs.opencv.org/4.1.0/opencv.js
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
        'pyramid_upscale','two_stage_threshold','smooth_and_pyramid','median_filter_simple','pyramid_up','pyramid_upscale',
        'pyramid_up','two_stage_threshold','smooth_and_pyramid','median_filter_simple'
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
            console.log('🏁 Достигнут порог распознаваний или уже отправлено — пропускаем анализ');
            return;
        }
        const container = findCaptchaContainer(document);
        const allImgs = findAllPotentialCaptchaImages(container);
        const visible = allImgs.filter(item => isElementVisible(item.element) && isTopMost(item.element));

        // Скрываем лишние картинки
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

        await Promise.all(unique.map((item, i) => recognizeCaptchaText(item.src, item.element, i)));

        if (!submitClicked && validRecognizedCount === 2 && unique.length === 9) {
            const remaining = unique.find(item =>

                item.element.style.display !== 'none'
            );
            if (remaining) {
                console.log('🚀 Выбираем последнюю нераспознанную как совпадающую и отправляем');
                remaining.element.click();
                clickSubmitButton(document);
                return;
            }
        }

        setTimeout(() => {
            if (!submitClicked && validRecognizedCount === 0) {
                alert('❗ Не удалось автоматически распознать ни одной подходящей картинки. Проверьте вручную и нажмите Submit Selection.');
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

                // 1. Tesseract
                let { data: { text } } = await Tesseract.recognize(
                    processedImageUrl,
                    'eng',
                    { tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: 6 }
                );
                let cleanedText = text.replace(/\D/g, '').slice(0, 3);
                console.log(`🔍 Режим: ${modes[index]}, результат Tesseract: "${cleanedText}" на позиции ${imagePos + 1}`);

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
            console.log(`Всего пропущено: ${uncknownNumber}`);

            if (recognizedCount + uncknownNumber === 9 && validRecognizedCount !== 2) {

                clickSubmitButton(document);
                console.log(`📌 Пропущено — кликаем Submit вместо alert.`);
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
    async function sendCaptchaToTrueCaptcha(imageUrl) {
        // Если блокировка активна — сразу пропускаем вызов
        if (Date.now() < trueCaptchaBlockedUntil) {
            console.warn('TrueCaptcha временно отключён из-за ошибок 503. Ждём...');
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
})();