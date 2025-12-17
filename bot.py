import requests
from bs4 import BeautifulSoup
from telegram import Bot
import os
import time

BOT_TOKEN = os.environ["BOT_TOKEN"]
CHAT_ID = os.environ["CHAT_ID"]

bot = Bot(token=BOT_TOKEN)

URL = "https://www.dtek-kem.com.ua/ua/shutdowns"

def get_status():
    try:
        r = requests.get(URL, timeout=20)
        soup = BeautifulSoup(r.text, "html.parser")
        text = soup.get_text().lower()

        if "відключ" in text or "знеструм" in text:
            return "⚡ Можливе або активне відключення світла"
        return "✅ Світло є"
    except Exception as e:
        return "⚠️ Помилка перевірки ДТЕК"

last_status = ""

while True:
    status = get_status()

    if status != last_status:
        bot.send_message(chat_id=CHAT_ID, text=status)
        last_status = status

    time.sleep(600)  # 10 хвилин
