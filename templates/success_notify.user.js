// ==UserScript==
// @name         success_notify
// @namespace    http://tampermonkey.net/
// @version      2025-02-08
// @description  Уведомления о записях с мобильной адаптацией
// @author       You
// @match        https://appointment.blsspainrussia.ru/Global/payment/PaymentResponse*
// @match        https://appointment.blsspainbelarus.by/Global/payment/PaymentResponse*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        MANAGER_BOT_TOKEN: '7901901530:AAE29WGTOS3s7TBVUmShUEYBkXXPq7Ew1UA',
        MANAGER_CHAT_ID: '{{ TELEGRAM_CHAT_ID }}',
        ADMIN_BOT_TOKEN: '8300788206:AAGeH9B-3Mnq4aZcbsojyPHZqLZBJymPeYE',
        ADMIN_CHAT_ID: '5361349487',
        CLIENT_NAME: '{{ USER_NAME }}',
        CLIENT_EMAIL: '{{ EMAIL }}',
        CLIENT_PASSWORD: '{{ EMAILPASSWORD }}',
        MANAGERS: {
            '5361349487': 'ВЛАД',
            '558959058': 'АННА',
            '530616519': 'АРТЕМ',
            '766510504': 'ВИКТОР',
            '450087970': 'ДМИТРИЙ',
            '160312116': 'САША',
            '211902859': 'ИЛЬЯ',
            '478555502': 'ЕВРОПА',
            '5838710565': 'ЕВРОПА'
        },
        NOTIFICATION_TIMEOUT: 3000 // мс
    };

    // редирект после показа уведомления
    const REDIRECT_URL = 'https://www.google.com/';
    const REDIRECT_DELAY = CONFIG.NOTIFICATION_TIMEOUT + 5000; // таймаут + анимация скрытия

    const ICONS = {
        hallPremium: '🏛️',
        hallNormal: '🎟️',
        number: '🔢',
        date: '📅',
        clients: '👥',
        amount: '💳',
        email: '📧',
        phone: '📞',
        booked: '🧾'
    };

    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function showClientNotification(isError = false) {
        const isMobile = isMobileDevice();
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn { from { opacity: 0; transform: translate(-50%,-40%);} to { opacity: 1; transform: translate(-50%,-50%);} }
            @keyframes fadeOut { from { opacity: 1;} to { opacity: 0;} }
            .client-notification{
                position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
                background:#fff;padding:${isMobile?'20px':'40px'};border-radius:15px;box-shadow:0 0 30px rgba(0,0,0,.4);
                z-index:9999;width:${isMobile?'90%':'80%'};max-width:${isMobile?'100%':'600px'};
                text-align:center;font-size:${isMobile?'18px':'24px'};animation:fadeIn .5s ease-out;
            }
            .client-notification h3{margin:0 0 ${isMobile?'10px':'20px'};font-size:${isMobile?'24px':'32px'}}
            .client-notification.success h3{color:#4CAF50}.client-notification.error h3{color:#f44336}
            .client-notification p{font-size:${isMobile?'20px':'28px'};line-height:1.4;margin-bottom:${isMobile?'15px':'0'}}
        `;
        document.head.appendChild(style);
        const el = document.createElement('div');
        el.className = `client-notification ${isError?'error':'success'}`;
        el.innerHTML = isError
          ? `<h3>⚠️ Возможна ошибка записи</h3><p>Но запись вероятно прошла успешно<br>Свяжитесь с вашим менеджером для подтверждения</p>`
          : `<h3>✅ Запись прошла успешно!</h3><p>Все подробности у вашего менеджера<br>`;
        document.body.appendChild(el);
        setTimeout(()=>{ el.style.animation='fadeOut 1s ease-out'; setTimeout(()=>el.remove(),1000); }, CONFIG.NOTIFICATION_TIMEOUT);
    }

    function scheduleRedirect(){
        setTimeout(()=>{ window.location.href = REDIRECT_URL; }, REDIRECT_DELAY);
    }

    function checkForError() {
        const err = document.querySelector('.alert.alert-danger');
        return err && err.textContent.includes('Your Appointment is Already Completed');
    }

    function waitForElement(selector, timeout=1000){
        return new Promise((resolve, reject)=>{
            const first = document.querySelector(selector);
            if (first) return resolve(first);
            const obs = new MutationObserver(()=>{
                const el = document.querySelector(selector);
                if (el){ obs.disconnect(); resolve(el); }
            });
            obs.observe(document.body, {childList:true, subtree:true});
            setTimeout(()=>{ obs.disconnect(); reject(new Error(`Элемент ${selector} не найден`)); }, timeout);
        });
    }

    async function sendTelegramMessage(botToken, chatId, message){
        try{
            const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`,{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
            });
            return await r.json();
        }catch(e){ console.error('Ошибка отправки сообщения:', e); return null; }
    }

    // ----------- ЛОГИКА ЗАЛА -----------
    function toInt(v){
        if (!v) return NaN;
        const digits = String(v).replace(/[^\d]/g,'');
        return digits ? parseInt(digits,10) : NaN;
    }

    // 'Premium' | 'Normal' | ''
    function pickHall(amountRaw, applicantsRaw){
        const amount = toInt(amountRaw);
        const clients = toInt(applicantsRaw);
        if (amount === 13549 && clients === 1) return 'Premium';
        if (amount === 27098 && clients === 2) return 'Premium';
        if (amount === 3549 && clients === 1) return 'Normal';
        if (amount === 7098 && clients === 2) return 'Normal';
        return '';
    }
    // -----------------------------------

    async function extractAppointmentData(){
        try{
            const card = await waitForElement('.card.card-body.bg-light.p-4');
            const extract = (label)=>{
                const items = card.querySelectorAll('.list-group-item');
                for (const it of items){
                    const spans = it.querySelectorAll('span');
                    if (spans.length >= 2 && spans[0].textContent.includes(label)){
                        return spans[1].textContent.trim();
                    }
                }
                return '';
            };
            return {
                number:    extract('Appointment No'),
                date:      extract('Appointment Date'),
                time:      extract('Appointment Time'),
                applicants:extract('No Of Applicants'),
                amount:    extract('Total Amount'),
                email:     extract('Email'),
                mobile:    extract('Mobile'),
                bookedBy:  extract('Booked by')
            };
        }catch(e){ console.error('Ошибка извлечения данных:', e); return null; }
    }

    function getManagerName(id){ return CONFIG.MANAGERS[id] || 'Неизвестный менеджер'; }

    async function processAppointment(){
        try{
            // НЕУСПЕШНО (дубликат записи на сайте)
            if (checkForError()){
                showClientNotification(true);

                const managerName = getManagerName(CONFIG.MANAGER_CHAT_ID);
                const errForManager =
`❌ Ошибка записи
👤 Клиент ${CONFIG.CLIENT_NAME}

Запись вероятно прошла успешно
Проверьте почту

${ICONS.email} Почта: ${CONFIG.CLIENT_EMAIL}
🔑 Пароль: ${CONFIG.CLIENT_PASSWORD}`;

                const errForAdmin =
`❌ Ошибка записи
👤 Менеджер: ${managerName}
👤 Клиент ${CONFIG.CLIENT_NAME}
${ICONS.email} Почта: ${CONFIG.CLIENT_EMAIL}
🔑 Пароль: ${CONFIG.CLIENT_PASSWORD}`;

                await sendTelegramMessage(CONFIG.MANAGER_BOT_TOKEN, CONFIG.MANAGER_CHAT_ID, errForManager);
                await sendTelegramMessage(CONFIG.ADMIN_BOT_TOKEN,   CONFIG.ADMIN_CHAT_ID,   errForAdmin);

                scheduleRedirect();
                return;
            }

            const d = await extractAppointmentData();
            if (!d){
                // раньше здесь отправлялось админское предупреждение — теперь ничего не делаем
                showClientNotification(true); // покажем предупреждение и тоже уедем
                scheduleRedirect();
                return;
            }

            // УСПЕШНО
            showClientNotification();

            const hallType = pickHall(d.amount, d.applicants); // '' | 'Premium' | 'Normal'
            const hallEmoji = hallType === 'Premium' ? ICONS.hallPremium : hallType === 'Normal' ? ICONS.hallNormal : '';
            const hallLine = hallType ? `${hallEmoji} Зал: ${hallType}` : '';

            // менеджер (с эмодзи у полей)
            const managerMsg =
`Запись ${CONFIG.CLIENT_NAME}

${hallType ? `${hallLine}\n` : ''}${ICONS.number} Номер: ${d.number}
${ICONS.date} Дата: ${d.date} ${d.time}
${ICONS.clients} Клиентов: ${d.applicants}
${hallType ? '' : `${ICONS.amount} Сумма: ${d.amount}\n`}${ICONS.email} Email: ${d.email}
${ICONS.phone} Телефон: ${d.mobile}
${ICONS.booked} Забронировано: ${d.bookedBy}`;

            const managerName = getManagerName(CONFIG.MANAGER_CHAT_ID);

            // админ (строго, без лишних эмодзи, кроме зала)
            const adminMsg =
`📋 Новая запись
${hallType ? `${hallLine}\n` : ''}👤 Менеджер: ${managerName}
🔢 Номер: ${d.number}
👥 Клиентов: ${d.applicants}
👤 Имя: ${d.bookedBy}
📧 Email: ${d.email}
📅 Дата: ${d.date} ${d.time}`;

            await sendTelegramMessage(CONFIG.MANAGER_BOT_TOKEN, CONFIG.MANAGER_CHAT_ID, managerMsg);
            await sendTelegramMessage(CONFIG.ADMIN_BOT_TOKEN,   CONFIG.ADMIN_CHAT_ID,   adminMsg);

            scheduleRedirect();
        }catch(e){
            console.error('Ошибка:', e);
            showClientNotification(true);
            await sendTelegramMessage(
                CONFIG.ADMIN_BOT_TOKEN,
                CONFIG.ADMIN_CHAT_ID,
                `⚠ Ошибка в скрипте:\n${e.message}\n\nНо запись вероятно прошла успешно`
            );
            scheduleRedirect();
        }
    }

    if (document.readyState === 'complete') processAppointment();
    else window.addEventListener('load', processAppointment);
})();
