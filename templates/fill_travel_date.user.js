// ==UserScript==
// @name         fill_travel_date
// @namespace    http://tampermonkey.net/
// @version      2025-10-10.01
// @description  Блокировка/активация "Загрузите фото" по 6-значному ОТП, надёжное скрытие TravelDate, верхний попап (только при автоподстановке), кнопка "Запросить код", автоклик radio+submit после Understood и улучшенный парсинг даты для Telegram (или "неизвестную дату").
// @author       You
// @match        https://appointment.blsspainbelarus.by/Global/Appointment/ApplicantSelection*
// @grant        none
// ==/UserScript==

(async function () {
  // === НАСТРОЙКИ ===
  const TELEGRAM_BOT_TOKEN = '7901901530:AAE29WGTOS3s7TBVUmShUEYBkXXPq7Ew1UA';
  const TELEGRAM_CHAT_ID = '{{ TELEGRAM_CHAT_ID }}';
  const USER_NAME = '{{ USER_NAME }}';
  const EMAIL = '{{ EMAIL }}';
  const PASSWORD = '{{ EMAILPASSWORD }}';

  // ТЕХНИЧЕСКАЯ дата — в поле формы
  const TRAVEL_DATE = '{{ TRAVEL_DATE }}';

  // API почты (ОТП)
  const apiUrl             = 'https://firstmail-imap-api.onrender.com/mail';
  const CODE_MAX_AGE_MIN   = 6;

  // Внешний вид кнопки загрузки
  const NEW_UPLOAD_TEXT    = 'Загрузить фото';
  const UPLOAD_BTN_BG      = '#157af6';

  // Логика блокировки
  const OTP_LEN            = 6;
  const HIDE_INSTEAD_OF_DIM = false;

  // === Состояние ===
  let dateMessageSent = false;
  let otpErrorSent    = false;
  let isAgreeButtonClicked = false;

  // для автоперехода
  let autoProceedDone = false;
  let autoProceedInFlight = false;
  let lastSubmitTs = 0;

  // ошибка ОТП и grace-окно после Understood
  let otpErrorPresent = false;
  let otpErrorToastShown = false;
  let modalAgreeWindowTs = 0;
  const MODAL_AGREE_GRACE_MS = 2000;

  // Флаг для управления показом попапа с кодом (только после автоподстановки)
  let allowOtpPopupOnce = false;

  // ——— ФИКС scroll anchoring ———
  (function fixScrollAnchoring(){
    const style = document.createElement('style');
    style.textContent = `
      html, body { overflow-anchor: none !important; }
      .modal, .modal-open { overflow-anchor: none !important; }
    `;
    document.head.appendChild(style);
  })();

  // === СТИЛИ (кнопка загрузки, попап кода, статус-бар) ===
  (function injectStyles(){
    const id='__pf_styles';
    if(document.getElementById(id)) return;
    const s=document.createElement('style'); s.id=id;
    s.textContent = `
      label.upload-photo-btn[for^="uploadfile-"],
      label.upload-photo-btn[for^="uploadfile-"]:hover,
      label.upload-photo-btn[for^="uploadfile-"]:focus,
      label.upload-photo-btn[for^="uploadfile-"]:active {
        background-color: ${UPLOAD_BTN_BG} !important;
        color: #fff !important;
        border-color: ${UPLOAD_BTN_BG} !important;
        text-transform: uppercase;
        font-weight: 700;
        letter-spacing: .2px;
      }
      .upload-locked {
        position: relative !important;
        pointer-events: none !important;
        filter: grayscale(1) opacity(0.4) !important;
        box-shadow: none !important;
        cursor: not-allowed !important;
        background-color: #cccccc !important;
        color: #666666 !important;
        border-color: #cccccc !important;
      }
      .upload-locked::after {
        content: '';
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 1);
        border-radius: inherit;
        pointer-events: none;
      }
      /* Оптимизированные стили для кнопки загрузки */
      label.upload-photo-btn {
        position: relative !important;
        z-index: 100 !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        outline: none !important;
        box-sizing: border-box !important;
        display: inline-block !important;
        touch-action: manipulation !important;
      }
      label.upload-photo-btn:not(.upload-locked) {
        pointer-events: auto !important;
        cursor: pointer !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      label.upload-photo-btn:not(.upload-locked):hover {
        cursor: pointer !important;
        opacity: 0.9 !important;
      }
      label.upload-photo-btn:not(.upload-locked):active {
        transform: scale(0.98) !important;
        opacity: 0.8 !important;
      }
      /* Верхний попап кода */
      #mail-code-popup{
        position:fixed; top:0; left:50%; transform:translateX(-50%);
        background:#fff; color:#222; font-size:17px; font-weight:700;
        padding:11px 16px 13px 16px; margin-top:16px; border-radius:15px;
        box-shadow:0 2px 8px rgba(0,0,0,0.13); z-index:100000; display:none;
        align-items:center; flex-direction:column; max-width:95vw; word-break:break-word;
      }
      #mail-code-popup .otp-line{ font-size:21px; letter-spacing:5px; }
      #mail-code-popup .ts{ font-size:12px; color:#555; margin-bottom:4px; }
      #mail-code-popup button.close{
        margin-top:5px; background:transparent; color:#888; border:none; font-size:17px; cursor:pointer;
      }
      /* Верхний статус-бар (для статусов загрузки фото) */
      #status-message{
        position:fixed; top:0; left:0; width:100%; z-index:100001;
        color:#fff; text-align:center; padding:10px; font-size:18px; font-weight:700; font-family:Arial,sans-serif;
      }

      /* Мобильная адаптация для кнопок */
      @media (max-width: 768px) {
        /* Кнопка загрузки фото на мобильных */
        label.upload-photo-btn {
          font-size: 16px !important;
          padding: 12px 16px !important;
          min-height: 48px !important;
          line-height: 1.2 !important;
          margin-bottom: 8px !important;
          z-index: 200 !important;
        }

        /* Кнопка "Запросить код" на мобильных */
        #get-mail-code-btn {
          font-size: 16px !important;
          padding: 12px 20px !important;
          min-height: 48px !important;
          width: 160px !important;
          bottom: 20px !important;
          z-index: 9999998 !important;
        }

        /* Попап с кодом на мобильных */
        #mail-code-popup {
          font-size: 16px !important;
          padding: 12px 20px 16px 20px !important;
          margin-top: 10px !important;
          max-width: 90vw !important;
          z-index: 100002 !important;
        }

        #mail-code-popup .otp-line {
          font-size: 20px !important;
          letter-spacing: 3px !important;
        }

        /* Нотификации на мобильных */
        #mail-code-note {
          font-size: 16px !important;
          padding: 16px 24px !important;
          min-width: 280px !important;
          max-width: 90vw !important;
          z-index: 999998 !important;
        }

        /* Статус-бар на мобильных */
        #status-message {
          font-size: 16px !important;
          padding: 12px !important;
          z-index: 100003 !important;
        }
      }

      /* Дополнительная адаптация для очень маленьких экранов */
      @media (max-width: 480px) {
        label.upload-photo-btn {
          font-size: 15px !important;
          padding: 10px 14px !important;
          z-index: 250 !important;
        }

        #get-mail-code-btn {
          font-size: 15px !important;
          padding: 10px 16px !important;
          width: 150px !important;
          z-index: 9999997 !important;
        }

        #mail-code-popup {
          font-size: 15px !important;
          padding: 10px 16px 14px 16px !important;
          max-width: 95vw !important;
          z-index: 100004 !important;
        }

        #mail-code-popup .otp-line {
          font-size: 18px !important;
          letter-spacing: 2px !important;
        }

        #mail-code-note {
          font-size: 15px !important;
          padding: 14px 20px !important;
          min-width: 260px !important;
          max-width: 95vw !important;
          z-index: 999997 !important;
        }

        #status-message {
          font-size: 15px !important;
          padding: 10px !important;
          z-index: 100005 !important;
        }
      }
    `;
    document.head.appendChild(s);
  })();

  // — Утилиты —
  const digits = (v) => (v || '').replace(/\D+/g,'');
  const $   = (sel, root=document) => root.querySelector(sel);
  const $all= (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // === Telegram ===
  async function sendTelegramMessage(text) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' })
      });
    } catch (error) { console.error('Ошибка отправки в Telegram:', error); }
  }

  // === UI-баннер статусов загрузки фото ===
  function showStatusBar(message, color = 'red') {
    const existing = document.getElementById('status-message');
    if (existing) existing.remove();
    const bar = document.createElement('div');
    bar.id = 'status-message';
    bar.style.backgroundColor = color;
    bar.textContent = message;
    const add = () => document.body.appendChild(bar);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', add, { once: true });
    } else add();
    setTimeout(()=> bar.remove(), 5000);
  }

  // === Обработка статусов UploadApplicantPhoto ===
  function handlePhotoUploadStatus(method, url, status, responseText) {
    if (!url || !/\/Global\/appointment\/UploadApplicantPhoto/i.test(url)) return;
    console.log(`[photo] ${method} ${url} -> ${status}`);

    if (status === 200) {
      // Проверяем ответ сервера на ошибку размера файла
      let responseData = null;
      try {
        responseData = JSON.parse(responseText || '{}');
      } catch (e) {
        console.log('[photo] Не удалось распарсить JSON ответ:', responseText);
      }

      // Проверяем, есть ли ошибка размера файла в ответе сервера
      if (responseData && responseData.success === false &&
          responseData.err && /File\s+Size\s+should\s+be\s+less\s+than\s+200\s+KB/i.test(responseData.err)) {

        console.log('[photo] Сервер вернул ошибку размера файла:', responseData.err);

        // Показываем сообщение об ошибке размера
        showStatusBar('ФОТО ПРЕВЫШАЕТ ДОПУСТИМЫЙ РАЗМЕР', 'red');

        // Отправляем сообщение в Telegram
        sendTelegramMessage(`⚠️ ${USER_NAME} ЗАГРУЗИЛ ФОТО КОТОРОЕ ПРЕВЫШАЕТ 200 КБ`);

        return; // НЕ показываем успешное сообщение
      }

      // Если нет ошибки размера файла - показываем успешное сообщение
      console.log('[photo] Фото загружено успешно');
      showStatusBar('ФОТО ЗАГРУЖЕНО УСПЕШНО.', 'green');

    } else if (status === 429) {
      showStatusBar('УПС. АЙПИ ЗАБЛОКИРОВАН. ПЕРЕХОД НА СТРАНИЦУ ВХОДА.', 'red');
      setTimeout(() => {
        window.location.href = "https://appointment.blsspainbelarus.by/Global/account/Login?returnUrl=%2FGlobal%2Fappointment%2Fnewappointment&err=K7LYPi%2FpJtiLxj0JgYMBPVTdQ5hDdq9IVd7ALDT6sMo%3D";
      }, 2000);
    } else {
      showStatusBar('УПС. ПРОБУЕМ ДРУГОЕ ФОТО, СТРАНИЦА САМА ОБНОВИТСЯ.', 'orange');
      sendTelegramMessage(`⚠️${USER_NAME} ФОТО НЕ ЗАГРУЗИЛОСЬ`);
      setTimeout(() => location.reload(), 3000);
    }
  }

  // Перехват XMLHttpRequest — ставим максимально рано (run-at: document-start)
  (function patchXHR(){
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try { this.__reqMethod = method; this.__reqUrl = url; } catch(_) {}
      return originalOpen.apply(this, [method, url, ...rest]);
    };
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener('load', () => {
        try {
          handlePhotoUploadStatus(this.__reqMethod, this.__reqUrl, this.status, this.responseText);
        }
        catch (e) { console.error('Ошибка handlePhotoUploadStatus:', e); }
      });
      return originalSend.apply(this, args);
    };
  })();

  // === ПОПАП С КОДОМ (верх экрана) ===
  function ensureCodePopup(){
    let box = $('#mail-code-popup');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'mail-code-popup';
    const ts = document.createElement('div'); ts.className='ts';
    const msg= document.createElement('div'); msg.textContent='Ваш код подтверждения:';
    const code= document.createElement('div'); code.className='otp-line';
    const close=document.createElement('button'); close.className='close'; close.textContent='✕';
    close.onclick = () => box.style.display='none';
    box.append(ts, msg, code, close);
    const add = () => document.body.appendChild(box);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add, { once:true }); else add();
    return box;
  }
  function showTopCodePopup(codeStr, timeStr){
    const box = ensureCodePopup();
    box.querySelector('.ts').textContent = timeStr || '';
    box.querySelector('.otp-line').textContent = codeStr || '';
    box.style.display = 'flex';
  }

  // === TravelDate: установить и НАДЁЖНО скрыть ===
  function setAndHideTravelDateOnce() {
    const travelDateInput = $('#TravelDate');
    if (!travelDateInput) return false;
    try {
      const $jq = window.jQuery || window.$;
      const kd = $jq ? $jq(travelDateInput).data('kendoDatePicker') : null;
      if (kd) { kd.value(TRAVEL_DATE); if (typeof kd.trigger==='function') kd.trigger('change'); }
      travelDateInput.value = TRAVEL_DATE;
      travelDateInput.dispatchEvent(new Event('input', { bubbles: true }));
      travelDateInput.dispatchEvent(new Event('change', { bubbles: true }));
    } catch(_) {}
    travelDateInput.style.display = 'none';
    travelDateInput.removeAttribute('required');
    travelDateInput.removeAttribute('aria-required');
    travelDateInput.removeAttribute('data-val');
    travelDateInput.removeAttribute('data-val-required');
    travelDateInput.disabled = false;
    const widget = travelDateInput.closest('.k-widget.k-datepicker') || travelDateInput.closest('.k-widget');
    if (widget) widget.style.display = 'none';
    const label = document.querySelector(`label[for="TravelDate"]`);
    if (label) label.style.display = 'none';
    const parentGroup = travelDateInput.closest('.form-group');
    if (parentGroup) parentGroup.style.display = 'none';
    return true;
  }
  const keepTravelDateHidden = () => setAndHideTravelDateOnce();
  keepTravelDateHidden();
  new MutationObserver(keepTravelDateHidden).observe(document.documentElement, { childList:true, subtree:true });

  // === Дата для Telegram: со страницы (#ResponseData) или "неизвестную дату" ===
  function extractPageDateOrUnknown() {
    const input = document.querySelector('#ResponseData');
    if (input && typeof input.value === 'string') {
      const raw = input.value.replace(/&quot;/g, '"');
      const match = raw.match(/\d{4}-\d{2}-\d{2}/);
      if (match) return { date: match[0], known: true };
    }
    return { date: 'неизвестную дату', known: false };
  }
  async function sendDateTgMessage() {
    if (dateMessageSent) return;
    const { date, known } = extractPageDateOrUnknown();
    const msg = known ? `📆 ${USER_NAME} выбрал(а) дату: ${date}` : `📆 ${USER_NAME} выбрал(а) неизвестную дату`;
    await sendTelegramMessage(msg);
    dateMessageSent = true;
  }
  async function sendOtpTgRequest(errorType) {
    if (otpErrorSent) return;
    const { date, known } = extractPageDateOrUnknown();
    const line = known ? `📅 Дата записи: ${date}` : `📅 Дата записи: неизвестна`;
    const text = `❗️${USER_NAME} проблема с кодом ОТП (${errorType})\n\n📧 Почта: ${EMAIL}\n🔐 Пароль: ${PASSWORD}\n${line}`;
    await sendTelegramMessage(text);
    otpErrorSent = true;
  }

  // === Кнопка загрузки фото: текст и блокировка ===
  function findUploadInput(){ return $('#uploadfile-1'); }
  function findUploadLabel(){
    return $('label.upload-photo-btn[for="uploadfile-1"]')
        || $('label[for="uploadfile-1"].upload-photo-btn')
        || $all('label[for^="uploadfile-"]').find(l => /uploadfile-1$/.test(l.getAttribute('for')||''));
  }

  function isPhotoAlreadyUploaded(){
    const idInput = $('#ApplicantPhotoId');
    if (idInput && String(idInput.value||'').trim() !== '') return true;
    const preview = $('#uploadfile-1-preview')
      || $('img[id*="upload"][id*="preview"]')
      || $('img[src*="/Global/query/getfile"], img[src*="fileid="]');
    if (!preview) return false;
    const src = preview.currentSrc || preview.src || preview.getAttribute('src') || '';
    if (!src) return false;
    const looksReal = /(\/Global\/query\/getfile\b|fileid=|\/uploads?\/|\/images\/temp\/|\/Photo\/Get)/i.test(src);
    const looksPlaceholder = /(\/assets\/images\/avatar\/|\/content\/images\/avatar\/|(?:^|\/)avatar\/\d+\.(?:jpg|jpeg|png)|placeholder|default|no-image)/i.test(src);
    if (looksReal) return true;
    if (looksPlaceholder) return false;
    if (preview.naturalWidth && preview.naturalHeight) {
      return (preview.naturalWidth > 20 && preview.naturalHeight > 20);
    }
    return false;
  }

  function patchUploadLabelCopyOnce(labelEl) {
    if (!labelEl || labelEl.dataset.__uploadTextPatched === '1') return;
    labelEl.textContent = NEW_UPLOAD_TEXT;
    labelEl.setAttribute('aria-label', NEW_UPLOAD_TEXT);
    labelEl.dataset.__uploadTextPatched = '1';
  }
  function refreshUploadLabels(){
    const exact = findUploadLabel();
    if (exact) patchUploadLabelCopyOnce(exact);
    $all('label.upload-photo-btn[for^="uploadfile-"]').forEach(patchUploadLabelCopyOnce);
    $all('input[type="file"].form-control.d-none[id^="uploadfile-"]').forEach(inp => {
      const id = inp.id;
      const lbl = document.querySelector(`label[for="${id}"]`);
      if (lbl) patchUploadLabelCopyOnce(lbl);
    });
  }
  refreshUploadLabels();
  new MutationObserver(refreshUploadLabels).observe(document.documentElement, { childList: true, subtree: true });

  // Функция для принудительного обеспечения кликабельности кнопок с мобильной адаптацией
  function ensureButtonsClickable() {
    const isMobile = window.innerWidth <= 768;
    const isSmallMobile = window.innerWidth <= 480;

    // Обеспечиваем кликабельность кнопки загрузки
    const uploadLabel = findUploadLabel();
    if (uploadLabel && !uploadLabel.classList.contains('upload-locked')) {
      uploadLabel.style.pointerEvents = 'auto';
      uploadLabel.style.cursor = 'pointer';
      uploadLabel.style.zIndex = isMobile ? (isSmallMobile ? '250' : '200') : '100';
      uploadLabel.style.opacity = '1';
      uploadLabel.style.visibility = 'visible';
      uploadLabel.style.display = '';
      uploadLabel.style.position = 'relative';

      // Мобильные стили
      if (isMobile) {
        uploadLabel.style.minHeight = '48px';
        uploadLabel.style.fontSize = isSmallMobile ? '15px' : '16px';
        uploadLabel.style.padding = isSmallMobile ? '10px 14px' : '12px 16px';
        uploadLabel.style.lineHeight = '1.2';
        uploadLabel.style.marginBottom = '8px';
        uploadLabel.style.touchAction = 'manipulation';
        uploadLabel.style.webkitTapHighlightColor = 'transparent';
      }
    }

    // Обеспечиваем кликабельность кнопки "Запросить код"
    const otpBtn = $('#get-mail-code-btn');
    if (otpBtn) {
      otpBtn.style.pointerEvents = 'auto';
      otpBtn.style.cursor = 'pointer';
      otpBtn.style.zIndex = isMobile ? (isSmallMobile ? '9999997' : '9999998') : '9999999';

      // Мобильные стили
      if (isMobile) {
        otpBtn.style.minHeight = '48px';
        otpBtn.style.fontSize = isSmallMobile ? '15px' : '16px';
        otpBtn.style.padding = isSmallMobile ? '10px 16px' : '12px 20px';
        otpBtn.style.width = isSmallMobile ? '150px' : '160px';
        otpBtn.style.bottom = '20px';
        otpBtn.style.touchAction = 'manipulation';
        otpBtn.style.webkitTapHighlightColor = 'transparent';
      }
    }
  }

  // Запускаем проверку кликабельности каждые 300мс
  setInterval(ensureButtonsClickable, 300);

  // Обновляем стили при изменении размера экрана (поворот устройства)
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      ensureButtonsClickable();
    }, 250);
  });

  function lockUploadButton() {
    const label = findUploadLabel();
    if (!label) return;
    label.setAttribute('title','Введите 6-значный код из Email, чтобы загрузить фото');
    label.setAttribute('aria-disabled','true');
    label.classList.add('upload-locked');
    label.style.pointerEvents = 'none';
    if (HIDE_INSTEAD_OF_DIM) {
      label.dataset.__prevDisplay = label.style.display || '';
      label.style.display = 'none';
    }
  }
  function unlockUploadButton({flash=true} = {}) {
    const label = findUploadLabel();
    if (!label) return;
    if (HIDE_INSTEAD_OF_DIM) {
      label.style.display = label.dataset.__prevDisplay || '';
    } else {
      label.classList.remove('upload-locked');
      label.removeAttribute('aria-disabled');
      label.removeAttribute('title');
      // Принудительно устанавливаем стили для активной кнопки
      label.style.pointerEvents = 'auto';
      label.style.cursor = 'pointer';
      label.style.zIndex = '100';
      label.style.opacity = '1';
      label.style.visibility = 'visible';
      label.style.display = '';
    }
  }

  // Оптимизированная защита и улучшение кликабельности
  (function guardDisabledClick(){
    function bind(){
      const lbl = findUploadLabel();
      if (!lbl || lbl.dataset.__guardBound === '1') return;

      // Защита от клика по заблокированной кнопке
      lbl.addEventListener('click', (e)=>{
        if (lbl.classList.contains('upload-locked')) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }, {capture:true});

      // Множественные обработчики для надежности
      ['mousedown', 'touchstart'].forEach(eventType => {
        lbl.addEventListener(eventType, (e) => {
          if (!lbl.classList.contains('upload-locked')) {
            lbl.style.transform = 'scale(0.98)';
            lbl.style.opacity = '0.8';
          }
        }, {passive: false});
      });

      ['mouseup', 'touchend', 'mouseleave'].forEach(eventType => {
        lbl.addEventListener(eventType, (e) => {
          if (!lbl.classList.contains('upload-locked')) {
            lbl.style.transform = 'scale(1)';
            lbl.style.opacity = '1';
          }
        }, {passive: false});
      });

      // Принудительно устанавливаем стили для активной кнопки каждый раз
      const ensureActiveStyles = () => {
        if (!lbl.classList.contains('upload-locked')) {
          lbl.style.pointerEvents = 'auto';
          lbl.style.cursor = 'pointer';
          lbl.style.zIndex = '100';
          lbl.style.opacity = '1';
          lbl.style.visibility = 'visible';
          lbl.style.display = '';
        }
      };

      ensureActiveStyles();
      // Проверяем стили каждые 500мс
      setInterval(ensureActiveStyles, 500);

      lbl.dataset.__guardBound = '1';
    }
    bind();
    new MutationObserver(bind).observe(document.documentElement, {childList:true, subtree:true});
  })();

  function initialLockCheck() {
    if (isPhotoAlreadyUploaded()) return;
    const emailCode = $('#EmailCode');
    const hasOtp = emailCode && digits(emailCode.value).length === OTP_LEN;
    if (hasOtp) unlockUploadButton({flash:false}); else lockUploadButton();
  }
  initialLockCheck();

  // <<< БЛОК ОЧИСТКИ С БЛОКИРОВКОЙ upload-кнопки >>>
  (function clearEmailCodeOnceOnInitialOtpError(){
    let fired = false;
    function hasInitialOtpError() {
      const box = document.querySelector('div.validation-summary.text-danger.mb-3.validation-summary-errors[data-valmsg-summary="true"]');
      if (!box) return false;
      const li = box.querySelector('li');
      return !!(li && /Please\s+enter\s+correct\s+email\s+OTP/i.test(li.textContent || ''));
    }
    function clearEmailCode() {
      const el = document.getElementById('EmailCode');
      if (!el) return;
      const proto  = Object.getPrototypeOf(el);
      const setter = proto && Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, ''); else el.value = '';
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('keyup',  { bubbles: true }));
      lockUploadButton();
    }
    function run() { if (fired) return; fired = true; if (hasInitialOtpError()) clearEmailCode(); }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(run, 0), { once: true });
    } else { setTimeout(run, 0); }
  })();

  // ===========================
  // PATCH A: спрятать OTP-ошибки
  // ===========================
  function hideOtpErrors() {
    const SELS = [
      '.validation-summary.text-danger.mb-3.validation-summary-errors [data-valmsg-summary="true"] li',
      '.validation-summary.text-danger.mb-3.validation-summary-errors li',
      '.validation-summary-errors li',
      '.validation-summary, .validation-summary-errors, .field-validation-error, .text-danger',
      '.k-tooltip-validation, .k-tooltip-validation span'
    ];
    SELS.forEach(sel => {
      document.querySelectorAll(sel).forEach(n => {
        if (!n) return;
        const txt = (n.textContent || '').trim();
        if (/Please\s+enter\s+correct\s+email\s+OTP/i.test(txt)) {
          const box = n.closest('.validation-summary, .validation-summary-errors, .text-danger, .k-tooltip-validation') || n;
          box.style.display = 'none';
          box.setAttribute('aria-hidden', 'true');
        }
      });
    });
  }

  // =====================================================
  // PATCH B: надёжная разблокировка при введённых 6 цифрах
  // =====================================================
  (function ensureUnlockAfterErrorCleared_v2() {
    function tryUnlockFrom(el) {
      if (!el) return;
      const val = String(el.value || '').replace(/\D+/g, '');
      if (val.length === OTP_LEN) {
        hideOtpErrors();
        unlockUploadButton();
      } else {
        if (!isPhotoAlreadyUploaded()) lockUploadButton();
      }
    }
    function bind(el) {
      if (!el || el.dataset.__otpUnlockBound === '1') return;
      ['input','change','keyup','paste'].forEach(ev => el.addEventListener(ev, () => tryUnlockFrom(el), { passive: true }));
      el.dataset.__otpUnlockBound = '1';
      tryUnlockFrom(el);
    }
    bind(document.getElementById('EmailCode'));
    const mo = new MutationObserver(() => { bind(document.getElementById('EmailCode')); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(() => {
      const el = document.getElementById('EmailCode');
      if (el && String(el.value || '').replace(/\D+/g, '').length === OTP_LEN) {
        hideOtpErrors();
        unlockUploadButton();
      }
    }, 800);
  })();
  // ====== END PATCH B ======

  // === Watcher за полем ОТП (плюс попап) ===
  (function bindOtpWatcher(){
    let popupShownForValue = '';
    const handler = (() => {
      let t=0;
      return function(){
        clearTimeout(t);
        t = setTimeout(()=>{
          if (isPhotoAlreadyUploaded()) return;
          const el = $('#EmailCode'); if (!el) return;
          const val = digits(el.value);
          if (val.length === OTP_LEN) {
            unlockUploadButton({flash:false});
            if (allowOtpPopupOnce && popupShownForValue !== val) {
              const now = new Date();
              const ts = `Принят: ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
              showTopCodePopup(val, ts);
              popupShownForValue = val;
            }
            allowOtpPopupOnce = false;
          } else {
            lockUploadButton();
          }
        }, 120);
      };
    })();
    function attach(){
      const el = $('#EmailCode');
      if (el && !el.dataset.__otpWatchBound) {
        ['input','change','keyup','paste'].forEach(ev => el.addEventListener(ev, handler, {passive:true}));
        el.dataset.__otpWatchBound = '1';
        handler();
      }
    }
    attach();
    new MutationObserver(attach).observe(document.documentElement, {childList:true, subtree:true});
    const bindOnFileChosen = ()=>{
      const inp = findUploadInput();
      if (!inp || inp.dataset.__hidePopupOnChosen==='1') return;
      inp.addEventListener('change', ()=>{ const box = $('#mail-code-popup'); if (box) box.style.display = 'none'; }, {passive:true});
      inp.dataset.__hidePopupOnChosen='1';
    };
    bindOnFileChosen();
    new MutationObserver(bindOnFileChosen).observe(document.documentElement, {childList:true, subtree:true});
  })();

  // === Кнопка "Запросить код" (API) + попап ===
  function createOtpButton() {
    if ($('#get-mail-code-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'get-mail-code-btn';
    btn.textContent = 'Запросить код';
    Object.assign(btn.style, {
      position:'fixed', left:'50%', bottom:'32px', transform:'translateX(-50%)', zIndex:9999999,
      padding:'10px 18px', background:'#157af6', color:'#fff', fontSize:'15px', border:'none',
      borderRadius:'32px', boxShadow:'0 1px 4px rgba(0,0,0,0.10)', cursor:'pointer',
      fontWeight:'bold', letterSpacing:'0.2px', width:'140px', margin:'0'
    });
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Запрос...';
      const requestCode = async () => {
        try {
          const resp = await fetch(apiUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: EMAIL, password: PASSWORD })
          });
          const data = await resp.json();
          let codeOk = false, timeMsg = '', code = data.code;
          if (data.code && data.date) {
            let date = new Date(data.date);
            let diffMin = (new Date() - date) / 60000;
            let dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            if (diffMin > CODE_MAX_AGE_MIN) { codeOk = false; timeMsg = `Письмо пришло в ${dateStr}`; }
            else { codeOk = true; timeMsg = `Пришло: ${dateStr}`; }
          }
          return { codeOk, timeMsg, code };
        } catch (e) {
          return { codeOk: false, timeMsg: '', code: null, error: true };
        }
      };
      const MAX_ATTEMPTS = 15, ATTEMPT_INTERVAL_MS = 10000;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        btn.textContent = `Попытка ${attempt}/${MAX_ATTEMPTS}...`;
        const result = await requestCode();
        if (result.codeOk) {
          allowOtpPopupOnce = true;
          insertCodeToEmailField(result.code);
          // Показываем уведомление о получении кода + инструкцию
          showNotification(`Код получен: ${result.code}. Теперь нажмите кнопку "ЗАГРУЗИТЬ ФОТО"!`);
          break;
        } else {
          if (attempt < MAX_ATTEMPTS) {
            showNotification(`Код не найден. Повтор через 10 сек...`);
            btn.textContent = `Ждём 10 сек (${attempt}/${MAX_ATTEMPTS})`;
            await new Promise(r => setTimeout(r, ATTEMPT_INTERVAL_MS));
          } else {
            if (result?.error) {
              await sendOtpTgRequest('ошибка запроса после 15 попыток');
              showNotification('Ошибка, обратитесь к менеджеру');
            } else {
              await sendOtpTgRequest('Нет кода на почте или устарел');
              showNotification(result.timeMsg || 'Код не пришёл, обратитесь к менеджеру');
            }
          }
        }
      }
      btn.disabled = false;
      btn.textContent = 'Запросить код';
    };
    const add = () => document.body.appendChild(btn);
    if (document.readyState === 'loading') setTimeout(()=>document.addEventListener('DOMContentLoaded', add, {once:true}), 0); else add();
  }
  // Нотификация-«тост»
  function showNotification(msg) {
    let note = $('#mail-code-note');
    if (!note) {
      note = document.createElement('div');
      note.id = 'mail-code-note';
      Object.assign(note.style, {
        position:'fixed', top:'50%', left:'50%', transform:'translate(-50%, -50%)',
        background:'#ff6b35', color:'#fff', padding:'20px 30px', fontSize:'18px', fontWeight:'bold',
        borderRadius:'12px', boxShadow:'0 8px 32px rgba(255, 107, 53, 0.4)', zIndex:999999,
        opacity:'0', transition:'all 0.3s ease', textAlign:'center', minWidth:'300px', border:'3px solid #fff'
      });
      const add = () => document.body.appendChild(note);
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add, {once:true}); else add();
    }
    note.textContent = msg;
    note.style.opacity = '1';
    note.style.transform = 'translate(-50%, -50%) scale(1.05)';
    setTimeout(() => { note.style.transform = 'translate(-50%, -50%) scale(1)'; }, 200);
    setTimeout(() => { note.style.opacity = '0'; note.style.transform = 'translate(-50%, -50%) scale(0.95)'; }, 5000);
  }

  // Вставка кода (из API) => триггерит watcher
  function insertCodeToEmailField(code) {
    const el = $('#EmailCode');
    if (!el) return;
    el.value = code || '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('keyup',  { bubbles: true }));
  }

  // Подменяем текст алёрта под полем ОТП
  function replaceOtpAlertText() {
    document.querySelectorAll('.alert.alert-warning.text-center').forEach(div => {
      if (/An OTP has been sent to your registered email/i.test(div.textContent)) {
        div.innerHTML = 'ВСТАВЬТЕ КОД ОТП ИЗ 6 ЦИФР <span class="required">*</span>';
      }
    });
  }

  // === Поиск radio/submit с бэкап-селекторами ===
  function findApplicantRadio() {
    return document.querySelector('.rdo-applicant')
        || document.querySelector('input[type="radio"][name*="Applicant"]')
        || document.querySelector('input[type="radio"][id*="Applicant"]')
        || document.querySelector('input[type="radio"]');
  }
  function findSubmitButton() {
    return document.getElementById('btnSubmit')
        || document.querySelector('button[type="submit"]')
        || document.querySelector('input[type="submit"]')
        || document.querySelector('button[id*="Submit"], button[name*="Submit"]');
  }

  // === Воротник: radio + submit ===
  async function clickRadioAndSubmit(){
    if (autoProceedDone || autoProceedInFlight) return;
    const now = Date.now();
    if (now - lastSubmitTs < 2500) return;
    lastSubmitTs = now;

    autoProceedInFlight = true;
    try {
      let tries = 100; // ~10 секунд
      let radioButton, submitButton;
      while (tries-- > 0) {
        radioButton  = findApplicantRadio();
        submitButton = findSubmitButton();
        const radioReady  = radioButton  && radioButton.offsetParent !== null;
        const submitReady = submitButton && submitButton.offsetParent !== null;
        if (radioReady && submitReady) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      if (!radioButton || radioButton.offsetParent === null) { console.warn('[auto] radio not found/visible'); return; }
      if (!submitButton || submitButton.offsetParent === null) { console.warn('[auto] submit not found/visible'); return; }

      radioButton.click();
      await new Promise(r => setTimeout(r, 1000));
      submitButton.click();

      autoProceedDone = true;
      console.log('[auto] radio+submit clicked');
    } finally {
      setTimeout(()=>{ autoProceedInFlight = false; }, 500);
    }
  }

  function autoProceedIfReady(){
    // Убираем автоматический клик - теперь он происходит только вручную
  }

  // === Автоклики Agree ===
  async function autoClickAgreeButton() {
    const modal = document.getElementById('termsmodal');
    const agreeButton = modal?.querySelector('.btn.btn-primary');
    if (modal && modal.style.display === 'block' && agreeButton) {
      agreeButton.click();
      await sendDateTgMessage();
      keepTravelDateHidden();
    }
  }
  async function autoClickAgreeButtonInPhotoUploadModal() {
    const modal = document.getElementById('photoUploadModal');
    const agreeButton = modal?.querySelector('.btn.btn-primary');
    if (modal && modal.style.display === 'block' && agreeButton) {
      agreeButton.click();
      isAgreeButtonClicked = true;
      modalAgreeWindowTs = Date.now();
      await new Promise(r => setTimeout(r, 800));
      for (let i = 0; i < 3 && !autoProceedDone; i++) {
        await clickRadioAndSubmit();
        if (autoProceedDone) break;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // === Ошибка валидации ОТП (наблюдение) ===
  function watchOtpError_setup() {
    const ERROR_RE = /Please\s+enter\s+correct\s+email\s+OTP/i;
    function scanAndReact() {
      let found = false;
      const nodes = document.querySelectorAll(
        '.validation-summary, .validation-summary-errors, .validation-summary-errors li,' +
        '.field-validation-error, .text-danger, .k-tooltip-validation, .k-tooltip-validation span'
      );
      nodes.forEach(n => { if (!found && n && ERROR_RE.test(n.textContent || '')) found = true; });
      if (!found) {
        const bodyText = (document.body && document.body.innerText) ? document.body.innerText : '';
        if (ERROR_RE.test(bodyText)) found = true;
      }
      otpErrorPresent = !!found;

      // ===== PATCH C: если в поле уже 6 цифр — держим кнопку активной и прячем ошибки
      const elForLen = document.getElementById('EmailCode');
      const sixOk = elForLen && (elForLen.value || '').replace(/\D+/g,'').length === OTP_LEN;
      if (sixOk) {
        otpErrorPresent = false;
        hideOtpErrors();
        unlockUploadButton();
      }
      // ===== END PATCH C

      if (otpErrorPresent && !otpErrorToastShown) {
        otpErrorToastShown = true;
        showNotification('Неверный код ОТП, Запросите правильный код у менеджера');
        if (!otpErrorSent) sendOtpTgRequest('неверный код ОТП');
      }
      if (!otpErrorPresent && otpErrorToastShown) {
        otpErrorToastShown = true;
      }
    }
    scanAndReact();
    const mo = new MutationObserver(() => { clearTimeout(mo.__t); mo.__t = setTimeout(scanAndReact, 120); });
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(scanAndReact, 2000);
  }

  // === Служебные скрытия Arrival/Departure ===
  function hideAndDisableDateField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = true;
    el.removeAttribute('required');
    el.removeAttribute('aria-required');
    el.removeAttribute('data-val');
    el.removeAttribute('data-val-required');
    const $jq = window.jQuery;
    const kd = $jq ? $jq(el).data('kendoDatePicker') : null;
    if (kd && typeof kd.enable === 'function') kd.enable(false);
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) label.style.display = 'none';
    const widget = el.closest('.k-widget.k-datepicker') || el.closest('.k-widget');
    if (widget) widget.style.display = 'none';
    el.style.display = 'none';
  }
  function hideArrivalDepartureNoFill() {
    hideAndDisableDateField('IntendedDateOfArrival');
    hideAndDisableDateField('IntendedDateOfDeparture');
  }

  // === Запуск ===
  hideArrivalDepartureNoFill();
  new MutationObserver(hideArrivalDepartureNoFill).observe(document.documentElement, { childList: true, subtree: true });

  (function relaxValidatorForArrivalDeparture() {
    const $jq = window.jQuery;
    if (!$jq) return;
    $jq('form').each(function () {
      const v = $jq(this).data('validator') || $jq(this).data('kendoValidator');
      if (!v) return;
      if (v.settings && typeof v.settings.ignore === 'string') {
        if (!v.settings.ignore.includes('#IntendedDateOfArrival')) {
          v.settings.ignore += ', #IntendedDateOfArrival, #IntendedDateOfDeparture';
        }
      }
    });
  })();

  autoClickAgreeButton();
  setInterval(autoClickAgreeButton, 1000);
  setInterval(autoClickAgreeButtonInPhotoUploadModal, 1000);

  setTimeout(createOtpButton, 10000);

  watchOtpError_setup();

  replaceOtpAlertText();
  setInterval(replaceOtpAlertText, 1000);

  // подпинываем состояние
  setInterval(()=>{ keepTravelDateHidden(); initialLockCheck(); autoProceedIfReady(); }, 1200);

  // ДОП. СТРАХОВКА: если EmailCode пуст — перелочка кнопки
  function forceRelockIfNoOtp() {
    const el = document.getElementById('EmailCode');
    const hasOtp = el && digits(el.value).length === OTP_LEN;
    if (!hasOtp && !isPhotoAlreadyUploaded()) lockUploadButton();
  }
  setInterval(forceRelockIfNoOtp, 1000);

  console.log('Скрипт запущен и готов к работе (с фиксом OTP-ошибки и мониторингом загрузки фото).');
})();
