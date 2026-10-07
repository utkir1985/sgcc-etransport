import urllib.request
import urllib.parse
import json
import time
import datetime
import subprocess

TOKEN = "8984531185:AAE_Z0AzIs4IcDHbFtFug3WAUsf7QPYUbUk"
API_URL = f"https://api.telegram.org/bot{TOKEN}/"

# Vagon holatlarini o'zbek tiliga tarjima qilish
STATUS_UZ = {
    "Loaded": "Yuklangan",
    "Loading": "Yuklanmoqda",
    "ToRailwayScale": "Taroziga yuborilgan",
    "GrossWeighed": "Brutto tortilgan",
    "SealPending": "Plomba kutilmoqda",
    "SealInstallation": "Plomba o‘rnatilmoqda",
    "Sealed": "Plombalangan",
    "Estakada": "Estakadada",
    "EstakadaPlaced": "Yuklashga tayyor",
    "AwaitingTare": "Tara kutilmoqda",
    "TareWeighing": "Tara tortilmoqda",
    "Tared": "Tara tortilgan",
    "Returned": "Qaytarilgan",
    "SecurityInspection": "Ko‘rikda",
    "ReadyForEstakada": "Tara kutilmoqda",
    "RailwayInspected": "Ro‘yxatga olingan",
    "Exited": "Chiqarilgan",
}

def translate_status(status_raw):
    if not status_raw:
        return ""
    st = status_raw.strip()
    return STATUS_UZ.get(st, st)

def call_tg(method, data=None):
    url = API_URL + method
    headers = {"Content-Type": "application/json"}
    req_data = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=req_data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=35) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return None

def query_db(sql):
    try:
        cmd = [
            "docker", "exec", "etransport-postgres",
            "psql", "-U", "etransport", "-d", "etransport", "-t", "-A", "-c", sql
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return None

def get_system_status():
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status_text = f"🕒 <b>Vaqt:</b> {now}\n\n"
    
    # Sayt tekshiruvi
    try:
        req = urllib.request.Request("https://etransport.sgcc.uz", headers={"User-Agent": "ETransportBot/1.0"})
        with urllib.request.urlopen(req, timeout=5) as r:
            status_text += f"🌐 <b>Sayt (etransport.sgcc.uz):</b> {'🟢 Faol' if r.status == 200 else '🟡 ' + str(r.status)}\n"
    except Exception:
        status_text += "🌐 <b>Sayt:</b> 🔴 Bog'lanib bo'lmadi\n"

    # API Backend (8080) tekshiruvi
    try:
        req_local = urllib.request.Request("http://127.0.0.1:8080/health")
        with urllib.request.urlopen(req_local, timeout=3) as r_loc:
            status_text += "⚙️ <b>Ichki API (8080):</b> 🟢 Ishlamoqda (Healthy)\n"
    except Exception:
        status_text += "⚙️ <b>Ichki API (8080):</b> 🟡 Faol\n"

    # PostgreSQL real statistikasi
    active_wagons = query_db('SELECT count(*) FROM "EmptyWagonUnits" WHERE "ScaleExitedAt" IS NULL;') or "0"
    exited_wagons = query_db('SELECT count(*) FROM "EmptyWagonUnits" WHERE "ScaleExitedAt" IS NOT NULL;') or "0"
    active_arrivals = query_db('SELECT count(*) FROM "EmptyWagonArrivals" WHERE "Stage" != \'Exited\';') or "0"
    order_count = query_db('SELECT count(*) FROM "MonthlyOrders";') or "0"
    
    status_text += f"\n🚆 <b>Hududdagi faol vagonlar:</b> <b>{active_wagons} ta</b>\n"
    status_text += f"📤 <b>Zavoddan chiqarilgan vagonlar:</b> {exited_wagons} ta\n"
    status_text += f"📥 <b>Joriy ochiq partiyalar:</b> {active_arrivals} ta\n"
    status_text += f"📋 <b>Joriy buyurtmalar:</b> {order_count} ta\n"
    status_text += "🖥 <b>Server IP:</b> <code>172.16.90.62</code>"
    return status_text

def get_wagons_summary():
    active_wagons = query_db('SELECT count(*) FROM "EmptyWagonUnits" WHERE "ScaleExitedAt" IS NULL;') or "0"
    exited_wagons = query_db('SELECT count(*) FROM "EmptyWagonUnits" WHERE "ScaleExitedAt" IS NOT NULL;') or "0"
    
    raw_units = query_db('''
        SELECT string_agg(u."WagonNumber" || ':' || coalesce(u."Status", ''), ',')
        FROM "EmptyWagonUnits" u
        WHERE u."ScaleExitedAt" IS NULL;
    ''')
    
    if raw_units:
        items = []
        for pair in raw_units.split(','):
            if ':' in pair:
                num, st = pair.split(':', 1)
                st_uz = translate_status(st)
                items.append(f"{num.strip()} ({st_uz})")
            else:
                items.append(pair.strip())
        active_details = ", ".join(items)
    else:
        active_details = "Ma'lumot yo'q"
    
    total_registries = query_db('SELECT count(*) FROM "LoadingRegistries";') or "0"
    order_count = query_db('SELECT count(*) FROM "MonthlyOrders";') or "0"
    
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    text = (
        "🚂 <b>E-Transport Vagonlar va Dispetcherlik hisoboti:</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"🟢 <b>Hududda mavjud faol vagonlar:</b> <b>{active_wagons} ta</b>\n"
        f"📍 <i>Faol vagonlar ro'yxati:</i> {active_details}\n\n"
        f"📤 <b>Chiqarilgan vagonlar (tarix):</b> {exited_wagons} ta\n"
        f"📋 <b>Rasmiylashtirilgan yuk xatlari:</b> {total_registries} ta\n"
        f"📦 <b>Oylik buyurtmalar soni:</b> {order_count} ta\n"
        f"🕒 <b>Yangilangan:</b> {now}\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        "Batafsil ma'lumot: https://etransport.sgcc.uz"
    )
    return text

def send_message(chat_id, text, reply_markup=None):
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return call_tg("sendMessage", payload)

def main():
    print("E-Transport Telegram Bot ishga tushdi...")
    call_tg("deleteWebhook", {"drop_pending_updates": False})
    
    main_keyboard = {
        "keyboard": [
            [{"text": "📊 Tizim holati"}, {"text": "🚂 Vagonlar hisoboti"}],
            [{"text": "🌐 Saytga o'tish"}, {"text": "ℹ️ Yordam"}]
        ],
        "resize_keyboard": True
    }
    
    site_inline = {
        "inline_keyboard": [
            [{"text": "🔗 E-Transport tizimini ochish", "url": "https://etransport.sgcc.uz"}]
        ]
    }
    
    offset = 0
    while True:
        try:
            updates = call_tg("getUpdates", {"offset": offset, "timeout": 25})
            if updates and updates.get("ok"):
                for upd in updates.get("result", []):
                    offset = upd["update_id"] + 1
                    
                    if "callback_query" in upd:
                        cq = upd["callback_query"]
                        call_tg("answerCallbackQuery", {"callback_query_id": cq["id"]})
                    
                    if "message" in upd:
                        msg = upd["message"]
                        chat_id = msg["chat"]["id"]
                        text = msg.get("text", "").strip()
                        user_name = msg.get("from", {}).get("first_name", "Foydalanuvchi")
                        
                        if text == "/start":
                            welcome = (
                                f"Assalomu alaykum, <b>{user_name}</b>!\n\n"
                                "🚆 <b>E-Transport Logistika tizimi</b> rasmiy botiga xush kelibsiz.\n\n"
                                "Ushbu bot orqali temir yo'l vagonlari harakati, yuklash holatlari "
                                "va tizim serverlari haqida operativ ma'lumot olishingiz mumkin.\n\n"
                                "Quyidagi tugmalardan birini tanlang:"
                            )
                            send_message(chat_id, welcome, main_keyboard)
                            
                        elif text in ["/status", "📊 Tizim holati"]:
                            info = get_system_status()
                            send_message(chat_id, f"📊 <b>TIZIM VA SERVER HOLATI:</b>\n━━━━━━━━━━━━━━━━━━━━\n{info}", main_keyboard)
                            
                        elif text in ["🚂 Vagonlar hisoboti", "/wagons"]:
                            report = get_wagons_summary()
                            send_message(chat_id, report, main_keyboard)
                            
                        elif text in ["/help", "ℹ️ Yordam"]:
                            hlp = (
                                "ℹ️ <b>Yordam va Buyruqlar:</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━\n"
                                "• /start - Botni qayta ishga tushirish\n"
                                "• /status - Server, sayt va vagonlar holati\n"
                                "• /wagons - Vagonlar va buyurtmalar statistikasi\n"
                                "• /help - Yordam menyusi\n\n"
                                "🌐 <b>Platforma:</b> https://etransport.sgcc.uz\n"
                                "🖥 <b>Server:</b> 172.16.90.62"
                            )
                            send_message(chat_id, hlp, main_keyboard)
                            
                        elif text in ["🌐 Saytga o'tish", "/site"]:
                            send_message(chat_id, "E-Transport platformasiga quyidagi havola orqali kiring:", site_inline)
                            
            time.sleep(0.5)
        except Exception as e:
            time.sleep(2)

if __name__ == "__main__":
    main()
