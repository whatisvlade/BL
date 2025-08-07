import os
import tempfile
import zipfile
import shutil
import logging
import re

from aiogram import Bot, Dispatcher, Router, F, types
from aiogram.enums import ParseMode
from aiogram.types import Message, CallbackQuery, FSInputFile
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.filters import CommandStart
from aiogram.utils.keyboard import InlineKeyboardBuilder
from dotenv import load_dotenv

# ───────────────────────────────────────────────────────────
# Конфигурация
# ───────────────────────────────────────────────────────────
load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN env var missing")

logging.basicConfig(level=logging.INFO)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher(storage=MemoryStorage())
rt = Router()
dp.include_router(rt)

BASE_DIR = os.path.dirname(__file__)
# Наборы путей для разных сценариев
DIRS = {
    "Россия": ("templates", "strategies", "static_base", "visa_type"),
}
DIRS = {k: tuple(os.path.join(BASE_DIR, p) for p in v) for k, v in DIRS.items()}

# ───────────────────────────────────────────────────────────
# FSM группы состояний
# ───────────────────────────────────────────────────────────
class Form(StatesGroup):
    country = State()
    city = State()
    visa_category = State()  # Новое состояние для категории визы
    name = State()
    email = State()
    password = State()
    emailpassword = State()
    travel_date = State()
    visa_type = State()
    start_day = State()
    end_day = State()
    forbidden_dates = State()
    strategy = State()
    confirm = State()

# ───────────────────────────────────────────────────────────
# /start — выбор страны (только Россия)
# ───────────────────────────────────────────────────────────
@rt.message(CommandStart())
async def cmd_start(m: Message, state: FSMContext):
    await state.update_data(country="Pakistan")
    kb = InlineKeyboardBuilder()
    for code, title in [
        ("Islamabad", "Islamabad"),
        ("Karachi", "Karachi"),
        ("Lahore", "Lahore")
    ]:
        kb.button(text=title, callback_data=code)
    kb.adjust(2)
    await m.answer("Выберите город записи:", reply_markup=kb.as_markup())
    await state.set_state(Form.city)

# ───────────────────────────────────────────────────────────
# Обработка города (Россия)
# ───────────────────────────────────────────────────────────
@rt.callback_query(Form.city, F.data.in_(["Islamabad", "Karachi", "Lahore"]))
async def choose_city(cb: CallbackQuery, state: FSMContext):
    mapping = {
        "Islamabad": "Islamabad",
        "Karachi": "Karachi",
        "Lahore": "Lahore",
    }
    city_code = cb.data
    city_name = mapping[city_code]
    await state.update_data(city=city_name)
    
    # Определяем категории виз в зависимости от города
    if city_code == "Islamabad":
        categories = [("Work Visa", "Work Visa"), ("Other National Visa", "Other National Visa")]
    elif city_code == "Karachi":
        categories = [("National Visa", "National Visa")]
    elif city_code == "Lahore":
        categories = [("Work Visa", "Work Visa"), ("Other National Visa", "Other National Visa")]
    
    kb = InlineKeyboardBuilder()
    for code, title in categories:
        kb.button(text=title, callback_data=code)
    kb.adjust(1)
    
    await cb.message.answer("Выберите категорию визы:", reply_markup=kb.as_markup())
    await state.set_state(Form.visa_category)
    await cb.answer()

# ───────────────────────────────────────────────────────────
# Обработка выбора категории визы
# ───────────────────────────────────────────────────────────
@rt.callback_query(Form.visa_category)
async def process_visa_category(cb: CallbackQuery, state: FSMContext):
    await state.update_data(visa_category=cb.data)
    await state.set_state(Form.name)
    await cb.message.answer("Введите имя и фамилию:")
    await cb.answer()

# ───────────────────────────────────────────────────────────
# Ввод текстовых полей: имя, email, пароли, дата поездки
# ───────────────────────────────────────────────────────────
@rt.message(Form.name)
async def process_name(m: Message, state: FSMContext):
    await state.update_data(name=m.text, chat_id=m.chat.id)
    await m.answer("Введите email:")
    await state.set_state(Form.email)

@rt.message(Form.email)
async def process_email(m: Message, state: FSMContext):
    await state.update_data(email=m.text)
    await m.answer("Введите пароль от аккаунта:")
    await state.set_state(Form.password)

@rt.message(Form.password)
async def process_password(m: Message, state: FSMContext):
    await state.update_data(password=m.text)
    await m.answer("Введите пароль от email:")
    await state.set_state(Form.emailpassword)

@rt.message(Form.emailpassword)
async def process_emailpwd(m: Message, state: FSMContext):
    await state.update_data(emailpassword=m.text)
    await m.answer("Введите дату поездки (ГГГГ-ММ-ДД):")
    await state.set_state(Form.travel_date)

@rt.message(Form.travel_date)
async def process_travel_date(m: Message, state: FSMContext):
    await state.update_data(travel_date=m.text)
    kb = InlineKeyboardBuilder()
    for code, title in [
        ("normal", "Обычная (Normal)"),
        ("premium", "Премиум (Premium)"),
        ("random", "Рандомно (Premium/Normal)"),
    ]:
        kb.button(text=title, callback_data=code)
    # Устанавливаем по одной кнопке в строке
    kb.adjust(1)
    await m.answer("Выберите тип визы:", reply_markup=kb.as_markup())
    await state.set_state(Form.visa_type)

# ───────────────────────────────────────────────────────────
# Выбор типа визы и диапазона дней
# ───────────────────────────────────────────────────────────
@rt.callback_query(Form.visa_type, F.data.in_(["normal", "premium", "random"]))
async def process_visa_type(cb: CallbackQuery, state: FSMContext):
    await state.update_data(visa_type=cb.data)
    await cb.message.answer("Введите начальный день диапазона (номер дня):")
    await state.set_state(Form.start_day)
    await cb.answer()

@rt.message(Form.start_day)
async def process_start_day(m: Message, state: FSMContext):
    await state.update_data(start_day=m.text)
    await m.answer("Введите конечный день диапазона (номер дня):")
    await state.set_state(Form.end_day)

@rt.message(Form.end_day)
async def process_end_day(m: Message, state: FSMContext):
    await state.update_data(end_day=m.text)
    await m.answer("Введите запрещённые даты через запятую или '-' если нет:")
    await state.set_state(Form.forbidden_dates)

@rt.message(Form.forbidden_dates)
async def process_forbidden(m: Message, state: FSMContext):
    await state.update_data(forbidden_dates=m.text)
    kb = InlineKeyboardBuilder()
    # Список стратегий с короткими подписями
    strategies = [
        ("first_date_first_time.user", "Первая дата и первое время"),
        ("first_date_last_time.user", "Первая дата и последнее время"),
        ("last_date_first_time.user", "Последняя дата и первое время"),
        ("last_date_last_time.user", "Последняя дата и последнее время"),
        ("random_date_random_time.user", "Рандомно"),
    ]
    for code, title in strategies:
        kb.button(text=title, callback_data=code)
    # По одной кнопке в строке
    kb.adjust(1)
    await m.answer("Выберите стратегию выбора дат и времени:", reply_markup=kb.as_markup())
    await state.set_state(Form.strategy)

# ───────────────────────────────────────────────────────────
# Превью и подтверждение перед генерацией
# ───────────────────────────────────────────────────────────
@rt.callback_query(Form.strategy, F.data.endswith(".user"))
async def preview(cb: CallbackQuery, state: FSMContext):
    await state.update_data(strategy=cb.data)
    d = await state.get_data()
    visa = {"normal": "Обычная", "premium": "Премиум", "random": "Рандомно"}[d["visa_type"]]
    forbid = "нет" if d["forbidden_dates"].strip() == "-" else d["forbidden_dates"]
    city = d.get("city", "")
    country_city = f"Pakistan – {city}"

  text = (
        "<b>Проверьте данные:</b>\n"
        f"Страна/город: {country_city}\n"
        f"Категория визы: {d.get('visa_category', 'не указана')}\n"
        f"Имя: {d['name']}\n"
        f"Email: {d['email']}\n"
        f"Пароль: {d['password']}\n"
        f"Пароль e-mail: {d['emailpassword']}\n"
        f"Дата поездки: {d['travel_date']}\n"
        f"Тип визы: {visa}\n"
        f"Диапазон: {d['start_day']}–{d['end_day']}\n"
        f"Запрещ. даты: {forbid}\n"
        f"Стратегия: {d['strategy']}\n\n"
        "Все верно?"
    )
    kb = InlineKeyboardBuilder()
    kb.button(text="✅ Подтвердить", callback_data="confirm_generate")
    kb.button(text="🔄 Начать заново", callback_data="restart")
    kb.adjust(2)
    await cb.message.edit_text(text, reply_markup=kb.as_markup(), parse_mode=ParseMode.HTML)
    await state.set_state(Form.confirm)
    await cb.answer()

# ───────────────────────────────────────────────────────────
# Генерация скриптов и отправка архива
# ───────────────────────────────────────────────────────────
@rt.callback_query(Form.confirm, F.data=="confirm_generate")
async def generate(cb: CallbackQuery, state: FSMContext):
    await cb.answer("Генерирую скрипты…")
    d = await state.get_data()
    vt1 = 'Normal' if d['visa_type']=='normal' else 'Premium'
    vt2 = 'Normal' if d['visa_type']!='premium' else 'Premium'
    dirs = d['selected_dirs']
    strat_file = os.path.join(dirs['STRATEGIES_DIR'], f"strategy_{d['strategy']}.js")
    if not os.path.exists(strat_file):
        return await cb.message.answer("❌ Стратегия не найдена")
    forbidden_js = ",".join(f"'{x.strip()}'" for x in d['forbidden_dates'].split(',') if x.strip()) if d['forbidden_dates'].strip()!='-' else ""
    mapping = {
        'START_DATE': d['start_day'],
        'END_DATE': d['end_day'],
        'FORBIDDEN_DATES': forbidden_js,
        'TELEGRAM_CHAT_ID': str(d['chat_id']),
        'USER_NAME': d['name'],
        'EMAIL': d['email'],
        'PASSWORD': d['password'],
        'EMAILPASSWORD': d['emailpassword'],
        'TRAVEL_DATE': d['travel_date'],
        'VISA_TYPE_1': vt1,
        'VISA_TYPE_2': vt2,
        'CITY': d.get('city', ''),
        'CATEGORY': d.get('visa_category', ''),  # Добавляем категорию визы
    }
    def repl(m): return mapping.get(m.group(1), m.group(0))
    with tempfile.TemporaryDirectory() as tmp:
        # Стратегия
        txt = re.sub(r"{{\s*([A-Z_]+)\s*}}", repl, open(strat_file, encoding='utf-8').read())
        open(os.path.join(tmp, os.path.basename(strat_file)), 'w', encoding='utf-8').write(txt)
        # Visa type
        for root,_,files in os.walk(dirs['VISA_TYPE_DIR']):
            for fn in files:
                c = open(os.path.join(root, fn), encoding='utf-8').read()
                c = re.sub(r"{{\s*CITY\s*}}", mapping['CITY'], c)
                c = re.sub(r"{{\s*VISA_TYPE_1\s*}}", mapping['VISA_TYPE_1'], c)
                c = re.sub(r"{{\s*VISA_TYPE_2\s*}}", mapping['VISA_TYPE_2'], c)
                open(os.path.join(tmp, fn), 'w', encoding='utf-8').write(c)
        # Шаблоны
        for root,_,files in os.walk(dirs['TEMPLATES_DIR']):
            for fn in files:
                t = re.sub(r"{{\s*([A-Z_]+)\s*}}", repl, open(os.path.join(root, fn), encoding='utf-8').read())
                open(os.path.join(tmp, fn), 'w', encoding='utf-8').write(t)
        # Статика
        for root,_,files in os.walk(dirs['STATIC_BASE_DIR']):
            for fn in files:
                shutil.copy(os.path.join(root, fn), os.path.join(tmp, fn))
        # Архив и отправка
        archive_name = d['name'].replace(' ', '_') + '_scripts.zip'
        zip_path = os.path.join(tmp, archive_name)
        with zipfile.ZipFile(zip_path, 'w') as z:
            for f in os.listdir(tmp):
                if f != archive_name:
                    z.write(os.path.join(tmp, f), f)
        await bot.send_document(chat_id=d['chat_id'], document=FSInputFile(zip_path, filename=archive_name))
    kb = InlineKeyboardBuilder()
    kb.button(text="🔄 Начать заново", callback_data="restart")
    await cb.message.answer("✅ Архив отправлен!", reply_markup=kb.as_markup())
    await state.clear()

# ───────────────────────────────────────────────────────────
# Рестарт
# ───────────────────────────────────────────────────────────
@rt.callback_query(F.data=="restart")
async def restart(cb: CallbackQuery, state: FSMContext):
    await state.clear()
    await cmd_start(cb.message, state)
    await cb.answer()

# ───────────────────────────────────────────────────────────
# Запуск бота
# ───────────────────────────────────────────────────────────
if __name__ == '__main__':
    import asyncio
    asyncio.run(dp.start_polling(bot))
