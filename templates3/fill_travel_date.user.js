// ==UserScript==
// @name         fill_travel_date
// @namespace    http://tampermonkey.net/
// @version      2025-07-08
// @description  Combined script with OTP and travel date message + авто-TG по ошибкам ОТП
// @author       You
// @match        https://appointment.blsspainrussia.ru/Global/Appointment/ApplicantSelection*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=blsspainrussia.ru
// ==/UserScript==

(function () {
    'use strict';

    // --- НАСТРОЙКИ ---
    const USER_NAME = '{{ USER_NAME }}';
    const TELEGRAM_BOT_TOKEN = '7901901530:AAE29WGTOS3s7TBVUmShUEYBkXXPq7Ew1UA';
    const TELEGRAM_CHAT_ID = '{{ TELEGRAM_CHAT_ID }}';
    const TRAVEL_DATE = '{{ TRAVEL_DATE }}';
    const USER_EMAIL = '{{ EMAIL }}';
    const USER_PASSWORD = '{{ EMAILPASSWORD }}';
    const apiUrl = "https://firstmail-imap-api.onrender.com/mail";
    const CODE_MAX_AGE_MIN = 7;
    let isAgreeButtonClicked = false;
    let isOtpMessageSent = false;
    let otpErrorSent = false;

    // --- ОТП-КНОПКА ---
    function createOtpButton() {
        if (document.getElementById('get-mail-code-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'get-mail-code-btn';
        btn.textContent = 'Запросить код';
        btn.style.position = 'fixed';
        btn.style.left = '50%';
        btn.style.bottom = '32px';
        btn.style.transform = 'translateX(-50%)';
        btn.style.zIndex = 9999999;
        btn.style.padding = '10px 18px';
        btn.style.background = '#157af6';
        btn.style.color = '#fff';
        btn.style.fontSize = '15px';
        btn.style.border = 'none';
        btn.style.borderRadius = '32px';
        btn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.10)';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';
        btn.style.letterSpacing = '0.2px';
        btn.style.width = '140px';
        btn.style.margin = '0';

        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = 'Запрос...';

            // Функция для проверки кода
            const checkCode = async () => {
                try {
                    const resp = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD })
                    });
                    const data = await resp.json();
                    let codeOk = false, timeMsg = '', code = data.code;
                    if (data.code && data.date) {
                        let date = new Date(data.date);
                        let now = new Date();
                        let diffMs = now - date;
                        let diffMin = diffMs / 1000 / 60;
                        let dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                        if (diffMin > CODE_MAX_AGE_MIN) {
                            codeOk = false;
                            timeMsg = `Письмо пришло в ${dateStr}`;
                        } else {
                            codeOk = true;
                            timeMsg = `Пришло: ${dateStr}`;
                        }
                    }
                    return { codeOk, code, timeMsg };
                } catch (e) {
                    return { codeOk: false, code: null, timeMsg: '', error: true };
                }
            };

            // Первый запрос
            let result = await checkCode();

            if (result.codeOk) {
                showPopupCode(result.code, result.timeMsg);
                showNotification('Код получен!');
            } else if (result.error) {
                await sendOtpTgRequest('ошибка запроса');
                showPopupMsg('Ошибка, обратитесь к менеджеру', '');
                showNotification('Ошибка');
            } else {
                // Нет кода, ждем 7 секунд и делаем второй запрос
                showNotification('Код не найден, повторный запрос через 7 сек...');
                btn.textContent = 'Ожидание...';

                setTimeout(async () => {
                    btn.textContent = 'Повторный запрос...';
                    let secondResult = await checkCode();

                    if (secondResult.codeOk) {
                        showPopupCode(secondResult.code, secondResult.timeMsg);
                        showNotification('Код получен!');
                    } else {
                        // После второго неудачного запроса отправляем в Telegram
                        await sendOtpTgRequest('нет кода после двух попыток');
                        showPopupMsg('Код подтверждения не пришел, обратитесь к менеджеру', secondResult.timeMsg);
                        showNotification('Код не найден, отправлено в Telegram');
                    }

                    btn.disabled = false;
                    btn.textContent = 'Запросить код';
                }, 7000);
                return; // Выходим, чтобы не сбросить состояние кнопки сразу
            }

            btn.disabled = false;
            btn.textContent = 'Запросить код';
        };

        document.body.appendChild(btn);
    }

    // --- TG ОТПРАВКА ---
    function sendTelegramMessage(message) {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        })
            .then(res => res.json())
            .then(data => console.log('Сообщение отправлено в Telegram:', data))
            .catch(error => console.error('Ошибка отправки в Telegram:', error));
    }

    async function sendOtpTgRequest(errorType) {
        if (otpErrorSent) return;
        const date = extractDateFromHiddenField() || TRAVEL_DATE;
        const text = `❗️${USER_NAME} не удалось получить/проверить ОТП-код (${errorType})\n\n📧 Почта: ${USER_EMAIL}\n🔐 Пароль: ${USER_PASSWORD}\n📅 Дата записи: ${date}`;
        await sendTelegramMessage(text);
        otpErrorSent = true;
    }

    // --- UI: Попапы, уведомления ---
    function showNotification(msg) {
        let note = document.getElementById('mail-code-note');
        if (!note) {
            note = document.createElement('div');
            note.id = 'mail-code-note';
            note.style.position = 'fixed';
            note.style.top = '50%';
            note.style.left = '50%';
            note.style.transform = 'translate(-50%, -50%)';
            note.style.background = '#ff6b35';
            note.style.color = '#fff';
            note.style.padding = '20px 30px';
            note.style.fontSize = '18px';
            note.style.fontWeight = 'bold';
            note.style.borderRadius = '12px';
            note.style.boxShadow = '0 8px 32px rgba(255, 107, 53, 0.4)';
            note.style.zIndex = 999999;
            note.style.opacity = '0';
            note.style.transition = 'all 0.3s ease';
            note.style.textAlign = 'center';
            note.style.minWidth = '300px';
            note.style.border = '3px solid #fff';
            document.body.appendChild(note);
        }

        note.textContent = msg;
        note.style.opacity = '1';
        note.style.transform = 'translate(-50%, -50%) scale(1.05)';

        setTimeout(() => {
            note.style.transform = 'translate(-50%, -50%) scale(1)';
        }, 200);

        setTimeout(() => {
            note.style.opacity = '0';
            note.style.transform = 'translate(-50%, -50%) scale(0.95)';
        }, 4000);
    }

    function showPopupCode(code, dateStr) {
        let box = document.getElementById('mail-code-popup');
        if (!box) {
            box = document.createElement('div');
            box.id = 'mail-code-popup';
            box.style.position = 'fixed';
            box.style.top = '0';
            box.style.left = '50%';
            box.style.transform = 'translate(-50%, 0)';
            box.style.background = '#fff';
            box.style.color = '#222';
            box.style.fontSize = '17px';
            box.style.fontWeight = 'bold';
            box.style.padding = '11px 16px 13px 16px';
            box.style.marginTop = '16px';
            box.style.borderRadius = '15px';
            box.style.boxShadow = '0 2px 8px rgba(0,0,0,0.13)';
            box.style.zIndex = 100000;
            box.style.display = 'flex';
            box.style.flexDirection = 'column';
            box.style.alignItems = 'center';
            box.style.maxWidth = '95vw';
            box.style.wordBreak = 'break-word';
            const close = document.createElement('button');
            close.textContent = '✕';
            close.style.marginTop = '5px';
            close.style.background = 'transparent';
            close.style.color = '#888';
            close.style.border = 'none';
            close.style.fontSize = '17px';
            close.style.cursor = 'pointer';
            close.onclick = () => box.remove();
            box.appendChild(close);
            document.body.appendChild(box);
        } else {
            box.childNodes.forEach(node => { if (node.tagName !== "BUTTON") node.remove(); });
        }
        let dateHtml = dateStr ? `<div style="font-size:12px;color:#555;margin-bottom:4px;">${dateStr}</div>` : '';
        box.innerHTML = dateHtml +
            `<div style="margin-bottom:4px;">Ваш код подтверждения:</div>
             <div style="font-size:21px;letter-spacing:5px;">${code}</div>`;
        const close = document.createElement('button');
        close.textContent = '✕';
        close.style.marginTop = '5px';
        close.style.background = 'transparent';
        close.style.color = '#888';
        close.style.border = 'none';
        close.style.fontSize = '17px';
        close.style.cursor = 'pointer';
        close.onclick = () => box.remove();
        box.appendChild(close);
        box.style.display = 'flex';

        // Автоматически вставить код в поле EmailCode
        setTimeout(() => {
            const emailCodeInput = document.getElementById('EmailCode');
            if (emailCodeInput) {
                emailCodeInput.value = code;
                emailCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
                emailCodeInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, 500);
    }

    function showPopupMsg(message, dateStr) {
        let box = document.getElementById('mail-code-popup');
        if (!box) {
            box = document.createElement('div');
            box.id = 'mail-code-popup';
            box.style.position = 'fixed';
            box.style.top = '0';
            box.style.left = '50%';
            box.style.transform = 'translate(-50%, 0)';
            box.style.background = '#fff';
            box.style.color = '#d40000';
            box.style.fontSize = '15px';
            box.style.fontWeight = 'bold';
            box.style.padding = '11px 16px 13px 16px';
            box.style.marginTop = '16px';
            box.style.borderRadius = '15px';
            box.style.boxShadow = '0 2px 8px rgba(0,0,0,0.13)';
            box.style.zIndex = 100000;
            box.style.display = 'flex';
            box.style.flexDirection = 'column';
            box.style.alignItems = 'center';
            box.style.maxWidth = '95vw';
            box.style.wordBreak = 'break-word';
            const close = document.createElement('button');
            close.textContent = '✕';
            close.style.marginTop = '5px';
            close.style.background = 'transparent';
            close.style.color = '#888';
            close.style.border = 'none';
            close.style.fontSize = '17px';
            close.style.cursor = 'pointer';
            close.onclick = () => box.remove();
            box.appendChild(close);
            document.body.appendChild(box);
        } else {
            box.childNodes.forEach(node => { if (node.tagName !== "BUTTON") node.remove(); });
        }
        let dateHtml = dateStr ? `<div style="font-size:12px;color:#555;margin-bottom:4px;">${dateStr}</div>` : '';
        box.innerHTML = dateHtml + `<div style="margin-bottom:4px;">${message}</div>`;
        const close = document.createElement('button');
        close.textContent = '✕';
        close.style.marginTop = '5px';
        close.style.background = 'transparent';
        close.style.color = '#888';
        close.style.border = 'none';
        close.style.fontSize = '17px';
        close.style.cursor = 'pointer';
        close.onclick = () => box.remove();
        box.appendChild(close);
        box.style.display = 'flex';
    }

    // --- ОТП Триггер по ошибке на странице ---
    function watchOtpError() {
        if (otpErrorSent) return;
        const selector = '.validation-summary.validation-summary-errors ul li';
        const li = document.querySelector(selector);
        if (
            li &&
            /Please enter correct email OTP/i.test(li.textContent)
        ) {
            sendOtpTgRequest('неверный код ОТП');
            showNotification('Отправлено в Telegram: ошибка кода ОТП');
        }
    }

    // --- ВСПОМОГАТЕЛЬНОЕ (взято из твоего кода) ---
    function extractDateFromHiddenField() {
        const input = document.getElementById('ResponseData');
        if (!input) return null;
        try {
            const data = JSON.parse(input.value.replace(/&quot;/g, '"'));
            for (const key in data) {
                const value = data[key];
                if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
                    return value;
                }
            }
        } catch (e) {
            // fallback
        }
        return null;
    }

    // --- ОСТАЛЬНАЯ ЛОГИКА БЕЗ ИЗМЕНЕНИЙ (твой код) ---
    function showMessage(message, color) {
        const existing = document.getElementById("status-message");
        if (existing) existing.remove();
        const div = document.createElement("div");
        div.id = "status-message";
        Object.assign(div.style, {
            position: "fixed", top: "0", left: "0", width: "100%", zIndex: "9999",
            backgroundColor: color || "red", color: "white",
            textAlign: "center", padding: "10px", fontSize: "18px", fontWeight: "bold",
            fontFamily: "Arial, sans-serif"
        });
        div.textContent = message;
        document.body.appendChild(div);
    }

    function handleStatus(method, url, status) {
        if (url.includes("/Global/appointment/UploadApplicantPhoto")) {
            if (status === 200) {
                showMessage("ФОТО ЗАГРУЖЕНО УСПЕШНО.", "green");
            } else if (status === 429) {
                showMessage("УПС. АЙПИ ЗАБЛОКИРОВАН.", "red");
                setTimeout(() => window.location.href = window.location.origin + "/Global/account/login", 3000);
            } else {
                showMessage("ФОТО НЕ ПРОШЛО, ПЕРЕЗАГРУЗКА.", "orange");
                sendTelegramMessage(`⚠️${USER_NAME}\n\nФОТО НЕ ПРОШЛО ДЛЯ ЗАГРУЗКИ`);
                setTimeout(() => location.reload(), 5000);
            }
        }
    }

    (function interceptXHR() {
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this._requestMethod = method;
            this._requestUrl = url;
            origOpen.apply(this, [method, url, ...rest]);
        };
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (...args) {
            this.addEventListener("load", function () {
                try {
                    handleStatus(this._requestMethod, this._requestUrl, this.status);
                } catch (error) {}
            });
            origSend.apply(this, args);
        };
    })();

    function changeAlertText() {
        document.querySelectorAll('.alert.alert-warning.text-center').forEach(div => {
            if (div.textContent.includes('An OTP has been sent')) {
                div.innerHTML = 'ВСТАВЬТЕ КОД ОТП ИЗ 6 ЦИФР <span class="required">*</span>';
            }
        });
    }

    async function autoClickAgreeButtonInPhotoUploadModal() {
        const modal = document.getElementById('photoUploadModal');
        const btn = modal?.querySelector('.btn.btn-primary');
        if (modal && modal.style.display === 'block' && btn) {
            btn.click();
            isAgreeButtonClicked = true;
        }
    }

    async function autoClickAgreeButton() {
        const modal = document.getElementById('termsmodal');
        const btn = modal?.querySelector('.btn.btn-primary');
        if (modal && modal.style.display === 'block' && btn) {
            btn.click();
            if (!isOtpMessageSent) {
                const extractedDate = extractDateFromHiddenField();
                const message = `📆 ${USER_NAME} Взял(а) дату: ${extractedDate || TRAVEL_DATE}`;
                sendTelegramMessage(message);
                isOtpMessageSent = true;
            }
            await typeTravelDate();
        }
    }

    async function typeTravelDate() {
        const input = document.querySelector('#TravelDate');
        if (input && input.offsetParent !== null) {
            input.value = TRAVEL_DATE;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            const kendoPicker = $(input).data('kendoDatePicker');
            if (kendoPicker) {
                kendoPicker.value(TRAVEL_DATE);
                kendoPicker.trigger('change');
            }
            input.style.display = 'none'; // скрыть само поле
            const parentGroup = input.closest('.form-group');
            if (parentGroup) {
                parentGroup.style.display = 'none'; // скрыть блок, если есть
            }
        }
    }


    async function selectApplicants() {
        try {
            const apps = document.querySelectorAll('.bls-applicant');
            if (apps.length >= 2) {
                await new Promise(res => setTimeout(res, 1000));
                const id1 = apps[0].getAttribute('onclick').match(/OnApplicantSelect\('(\d+)'/)[1];
                OnApplicantSelect(id1, 'True');
                await new Promise(res => setTimeout(res, 2000));
                const id2 = apps[1].getAttribute('onclick').match(/OnApplicantSelect\('(\d+)'/)[1];
                OnApplicantSelect(id2, 'True');
            }
        } catch (err) {}
    }

    async function executeActionsSequentially() {
        while (!isAgreeButtonClicked) {
            await new Promise(r => setTimeout(r, 50));
        }
        await selectApplicants();
        await new Promise(r => setTimeout(r, 150));
        const submitBtn = document.getElementById('btnSubmit');
        if (submitBtn && submitBtn.offsetParent !== null) {
            submitBtn.click();
        }
    }

    function initialize() {
        changeAlertText();
        const alertInterval = setInterval(() => {
            if (document.querySelector('.alert.alert-warning.text-center')) {
                changeAlertText();
                clearInterval(alertInterval);
            }
        }, 100);
        setInterval(autoClickAgreeButtonInPhotoUploadModal, 50);
        autoClickAgreeButton();
        setInterval(autoClickAgreeButton, 1000);
        setTimeout(typeTravelDate, 100);
        executeActionsSequentially();
        setTimeout(createOtpButton, 10000);
        setInterval(watchOtpError, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
