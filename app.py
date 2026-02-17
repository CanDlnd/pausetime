from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import json
import logging
import os
from datetime import datetime, timedelta
import pytz
from cachetools import TTLCache

app = Flask(__name__)
CORS(app)


# ============================================================
# SETTINGS SYSTEM
# ============================================================

APP_DATA_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'PauseTime')
os.makedirs(APP_DATA_DIR, exist_ok=True)
SETTINGS_FILE = os.path.join(APP_DATA_DIR, 'settings.json')
SCHEDULES_FILE = os.path.join(APP_DATA_DIR, 'schedules.json')

DEFAULT_SETTINGS = {
    "city": "ISTANBUL",
    "launch_on_startup": False,
    "start_minimized_to_tray": False,
    "close_to_tray": True
}

# Diyanet İşleri Başkanlığı - Şehir → İlçe ID eşleştirmesi (il merkezleri)
DIYANET_DISTRICT_IDS = {
    "ADANA": "9146", "ADIYAMAN": "9158", "AFYONKARAHISAR": "9167",
    "AGRI": "9185", "AKSARAY": "9193", "AMASYA": "9198",
    "ANKARA": "9206", "ANTALYA": "9225", "ARDAHAN": "9238",
    "ARTVIN": "9246", "AYDIN": "9252", "BALIKESIR": "9270",
    "BARTIN": "9285", "BATMAN": "9288", "BAYBURT": "9295",
    "BILECIK": "9297", "BINGOL": "9303", "BITLIS": "9311",
    "BOLU": "9315", "BURDUR": "9327", "BURSA": "9335",
    "CANAKKALE": "9352", "CANKIRI": "9359", "CORUM": "9370",
    "DENIZLI": "9392", "DIYARBAKIR": "9402", "DUZCE": "9414",
    "EDIRNE": "9419", "ELAZIG": "9432", "ERZINCAN": "9440",
    "ERZURUM": "9451", "ESKISEHIR": "9470", "GAZIANTEP": "9479",
    "GIRESUN": "9494", "GUMUSHANE": "9501", "HAKKARI": "9507",
    "HATAY": "20089", "IGDIR": "9522", "ISPARTA": "9528",
    "ISTANBUL": "9541", "IZMIR": "9560", "KAHRAMANMARAS": "9577",
    "KARABUK": "9581", "KARAMAN": "9587", "KARS": "9594",
    "KASTAMONU": "9609", "KAYSERI": "9620", "KILIS": "9629",
    "KIRIKKALE": "9635", "KIRKLARELI": "9638", "KIRSEHIR": "9646",
    "KOCAELI": "9654", "KONYA": "9676", "KUTAHYA": "9689",
    "MALATYA": "9703", "MANISA": "9716", "MARDIN": "9726",
    "MERSIN": "9737", "MUGLA": "9747", "MUS": "9755",
    "NEVSEHIR": "9760", "NIGDE": "9766", "ORDU": "9782",
    "OSMANIYE": "9788", "RIZE": "9799", "SAKARYA": "9807",
    "SAMSUN": "9819", "SANLIURFA": "9831", "SIIRT": "9839",
    "SINOP": "9847", "SIRNAK": "9854", "SIVAS": "9868",
    "TEKIRDAG": "9879", "TOKAT": "9887", "TRABZON": "9905",
    "TUNCELI": "9914", "USAK": "9919", "VAN": "9930",
    "YALOVA": "9935", "YOZGAT": "9949", "ZONGULDAK": "9955",
}


def _load_settings():
    """Disk'ten ayarları yükle. Dosya yoksa veya bozuksa defaults döner."""
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
            # Merge: eksik alanları default ile doldur
            merged = {**DEFAULT_SETTINGS, **saved}
            return merged
    except Exception:
        pass
    return dict(DEFAULT_SETTINGS)


def _save_settings(settings):
    """Ayarları diske yaz."""
    try:
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
        logger.info(f"Settings saved to {SETTINGS_FILE}")
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")


# Uygulama başlangıcında yükle
_settings = _load_settings()


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(APP_DATA_DIR, 'app.log')),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)
logger.info(f"Settings file: {SETTINGS_FILE}")

prayer_times_cache = TTLCache(maxsize=100, ttl=3600)


# ============================================================
# PRAYER TIMES
# ============================================================

DIYANET_API_BASE = "https://ezanvakti.imsakiyem.com/api"


def get_prayer_times(city=None, date=None):
    """Diyanet İşleri Başkanlığı verilerinden vakit bilgilerini al."""
    if city is None:
        city = _settings.get("city", "ISTANBUL")

    district_id = DIYANET_DISTRICT_IDS.get(city.upper(), "9541")

    tz = pytz.timezone('Europe/Istanbul')
    if date is None:
        date = datetime.now(tz)

    date_str = date.strftime('%Y-%m-%d')
    cache_key = f"diyanet_{district_id}_{date_str}"
    if cache_key in prayer_times_cache:
        return prayer_times_cache[cache_key]

    url = f"{DIYANET_API_BASE}/prayer-times/{district_id}/daily"
    params = {"startDate": date_str}

    try:
        response = requests.get(url, params=params, headers={"Accept": "application/json"}, timeout=15)
        response.raise_for_status()
        data = response.json()

        if data.get("success") and data.get("data"):
            times = data["data"][0]["times"]
            result = {
                "Fajr": times["imsak"],
                "Dhuhr": times["ogle"],
                "Asr": times["ikindi"],
                "Maghrib": times["aksam"],
                "Isha": times["yatsi"]
            }
            prayer_times_cache[cache_key] = result
            logger.info(f"Diyanet prayer times for {city} ({date_str}): {result}")
            return result
        else:
            logger.error(f"Diyanet API error for {city}: {data}")
            return _get_default_times()
    except requests.RequestException as e:
        logger.error(f"Diyanet request error for {city}: {str(e)}")
        return _get_default_times()
    except Exception as e:
        logger.error(f"Unexpected error for {city}: {str(e)}")
        return _get_default_times()


def _get_default_times():
    return {
        "Fajr": "06:00",
        "Dhuhr": "13:00",
        "Asr": "16:00",
        "Maghrib": "19:00",
        "Isha": "20:30"
    }


# ============================================================
# STATE ENGINE
# ============================================================

VAKIT_NAMES = {
    "Fajr": "İmsak",
    "Dhuhr": "Öğle",
    "Asr": "İkindi",
    "Maghrib": "Akşam",
    "Isha": "Yatsı"
}

VAKIT_ORDER = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]

# Ezan vaktinden 60 saniye ÖNCE duraklatmaya başla
PRE_PAUSE_OFFSET_SECONDS = 60
# Duraklatma süresi: 9 dakika (540 saniye)
PAUSE_DURATION_SECONDS = 9 * 60

# Global state
_system_enabled = True
_last_known_state = {
    "time": "--:--",
    "vakit": "Bilinmiyor",
    "remaining": "---",
    "state": "ACTIVE"
}


# ============================================================
# SCHEDULE SYSTEM
# ============================================================
# Her zamanlama:
#   id: int — benzersiz kimlik
#   pause_time: "HH:MM" — durdurma saati
#   resume_time: "HH:MM" | None — devam saati (None = süresiz)
#   days: [0..6] — 0=Pazartesi, 6=Pazar (boş = her gün)
#   label: str — kullanıcı notu
#   enabled: bool

SCHEDULES_BACKUP_FILE = SCHEDULES_FILE + '.bak'


def _load_schedules():
    """Disk'ten zamanlamaları yükle. Ana dosya bozuksa yedekten oku."""
    for filepath in [SCHEDULES_FILE, SCHEDULES_BACKUP_FILE]:
        try:
            if os.path.exists(filepath):
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                if not content:
                    continue
                data = json.loads(content)
                schedules = data.get("schedules", [])
                next_id = data.get("next_id", 1)
                if schedules:
                    max_id = max(s.get("id", 0) for s in schedules)
                    next_id = max(next_id, max_id + 1)
                if filepath == SCHEDULES_BACKUP_FILE:
                    logger.warning(f"Loaded schedules from backup file (main file was corrupted)")
                else:
                    logger.info(f"Loaded {len(schedules)} schedules from {filepath}")
                return schedules, next_id
        except Exception as e:
            logger.error(f"Failed to load schedules from {filepath}: {e}")
    return [], 1


def _save_schedules():
    """Zamanlamaları atomik olarak diske yaz (temp -> rename)."""
    import tempfile
    try:
        data = {
            "schedules": _schedules,
            "next_id": _schedule_next_id
        }
        json_str = json.dumps(data, indent=2, ensure_ascii=False)

        # Mevcut dosyayı yedekle
        if os.path.exists(SCHEDULES_FILE):
            try:
                import shutil
                shutil.copy2(SCHEDULES_FILE, SCHEDULES_BACKUP_FILE)
            except Exception:
                pass

        # Atomik yazma: önce temp dosyaya yaz, sonra rename et
        fd, tmp_path = tempfile.mkstemp(dir=APP_DATA_DIR, suffix='.tmp')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(json_str)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, SCHEDULES_FILE)
        except Exception:
            # Temp dosya kaldıysa temizle
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise

        logger.info(f"Schedules saved to {SCHEDULES_FILE}")
    except Exception as e:
        logger.error(f"Failed to save schedules: {e}")


_schedules, _schedule_next_id = _load_schedules()

DAY_NAMES_TR = {
    0: "Pazartesi", 1: "Salı", 2: "Çarşamba",
    3: "Perşembe", 4: "Cuma", 5: "Cumartesi", 6: "Pazar"
}


def _validate_time_format(time_str):
    """HH:MM formatını doğrula"""
    try:
        h, m = map(int, time_str.split(':'))
        return 0 <= h <= 23 and 0 <= m <= 59
    except Exception:
        return False


def _check_schedule_active(schedule):
    """Tek bir zamanlamanın şu an aktif olup olmadığını kontrol eder."""
    if not schedule.get("enabled", True):
        return False

    tz = pytz.timezone('Europe/Istanbul')
    now = datetime.now(tz)

    # Gün kontrolü (0=Pazartesi, 6=Pazar)
    days = schedule.get("days", [])
    if days and now.weekday() not in days:
        return False

    current_minutes = now.hour * 60 + now.minute
    pause_h, pause_m = map(int, schedule["pause_time"].split(':'))
    pause_minutes = pause_h * 60 + pause_m

    resume_minutes = None
    if schedule.get("resume_time"):
        resume_h, resume_m = map(int, schedule["resume_time"].split(':'))
        resume_minutes = resume_h * 60 + resume_m

    if resume_minutes is None:
        # Süresiz: pause_time'dan sonra gün sonuna kadar aktif
        return current_minutes >= pause_minutes

    # Zaman penceresi kontrolü
    if pause_minutes <= resume_minutes:
        return pause_minutes <= current_minutes < resume_minutes
    else:
        # Gece yarısı geçişi (ör: 23:00 → 09:00)
        return current_minutes >= pause_minutes or current_minutes < resume_minutes


def _is_any_schedule_active():
    """Herhangi bir zamanlama aktif mi?"""
    return any(_check_schedule_active(s) for s in _schedules)


def _format_remaining(minutes):
    """Kalan süreyi formatlar"""
    if minutes < 0:
        minutes = 0
    hours = minutes // 60
    mins = minutes % 60
    if hours > 0:
        return f"{hours} saat {mins} dakika"
    return f"{mins} dakika"


def _get_current_state(prayer_times):
    """
    Bir sonraki vakti, kalan süreyi ve state'i hesaplar.

    State:
    - PAUSING: Ezan vakti geldi, pause penceresi içinde
    - ACTIVE: Normal çalışma
    """
    tz = pytz.timezone('Europe/Istanbul')
    now = datetime.now(tz)
    current_minutes = now.hour * 60 + now.minute
    current_seconds = now.hour * 3600 + now.minute * 60 + now.second

    # Vakitleri saniyeye çevir
    times_in_seconds = []
    for key in VAKIT_ORDER:
        t = prayer_times.get(key, "00:00")
        h, m = map(int, t.split(':'))
        times_in_seconds.append((key, h * 3600 + m * 60))

    # PAUSING kontrolü — ezan vaktinden PRE_PAUSE_OFFSET_SECONDS önce başlar
    state = "ACTIVE"
    day_seconds = 24 * 3600
    for _vakit_key, vakit_seconds in times_in_seconds:
        pause_start = vakit_seconds - PRE_PAUSE_OFFSET_SECONDS
        pause_end = pause_start + PAUSE_DURATION_SECONDS

        if pause_start >= 0 and pause_end <= day_seconds:
            # Normal aralık
            if pause_start <= current_seconds < pause_end:
                state = "PAUSING"
                break
        elif pause_start < 0:
            # Gece yarısı öncesine sarkan başlangıç
            if current_seconds >= (pause_start + day_seconds) or current_seconds < pause_end:
                state = "PAUSING"
                break
        else:
            # Gece yarısını geçen bitiş
            adjusted_end = pause_end - day_seconds
            if current_seconds >= pause_start or current_seconds < adjusted_end:
                state = "PAUSING"
                break

    # Bir sonraki vakti bul
    next_vakit = None
    remaining_minutes = 0

    for vakit_key, vakit_seconds in times_in_seconds:
        vakit_minutes = vakit_seconds // 60
        if vakit_minutes > current_minutes:
            next_vakit = vakit_key
            remaining_minutes = vakit_minutes - current_minutes
            break

    # Bugün kalan vakit yoksa → yarının İmsak vakti
    if next_vakit is None:
        next_vakit = "Fajr"
        # Yarının gerçek İmsak vaktini al
        try:
            tomorrow = now + timedelta(days=1)
            tomorrow_times = get_prayer_times(date=tomorrow)
            fajr_str = tomorrow_times.get("Fajr", "06:00")
            fh, fm = map(int, fajr_str.split(':'))
            fajr_minutes = fh * 60 + fm
        except Exception:
            fajr_minutes = times_in_seconds[0][1] // 60
        remaining_minutes = (24 * 60 - current_minutes) + fajr_minutes

    vakit_display = VAKIT_NAMES.get(next_vakit, next_vakit)
    remaining_str = _format_remaining(remaining_minutes)

    return vakit_display, remaining_str, state


# ============================================================
# ROUTES
# ============================================================

@app.route('/state')
def get_state():
    """
    Ana state endpoint'i — Tauri UI 5 saniyede bir poll eder.

    State modeli:
    - ACTIVE: Normal çalışma
    - PAUSING: Ezan vakti, pause penceresi içinde
    - MANUAL_PAUSE: Zamanlama tarafından durduruldu
    - DISABLED: Kullanıcı sistemi kapattı
    """
    global _last_known_state

    if not _system_enabled:
        return jsonify({
            "time": _last_known_state["time"],
            "vakit": _last_known_state["vakit"],
            "remaining": _last_known_state["remaining"],
            "state": "DISABLED"
        })

    try:
        prayer_times = get_prayer_times()

        tz = pytz.timezone('Europe/Istanbul')
        now = datetime.now(tz)
        current_time = now.strftime('%H:%M')

        vakit, remaining, state = _get_current_state(prayer_times)

        # Zamanlama önceliği: MANUAL_PAUSE > PAUSING
        if _is_any_schedule_active():
            state = "MANUAL_PAUSE"

        active_schedules = sum(1 for s in _schedules if s.get("enabled") and _check_schedule_active(s))

        _last_known_state = {
            "time": current_time,
            "vakit": vakit,
            "remaining": remaining,
            "state": state,
            "schedules_active": active_schedules,
            "schedules_total": len(_schedules)
        }

        return jsonify(_last_known_state)

    except Exception as e:
        logger.error(f"Error in get_state: {str(e)}")
        return jsonify(_last_known_state)


@app.route('/state/toggle', methods=['POST'])
def toggle_state():
    """Sistemi aç/kapat."""
    global _system_enabled

    try:
        data = request.get_json() or {}
        if 'enabled' in data:
            _system_enabled = bool(data['enabled'])
            logger.info(f"System {'enabled' if _system_enabled else 'disabled'}")

        return jsonify({"success": True, "enabled": _system_enabled})
    except Exception as e:
        logger.error(f"Error in toggle_state: {str(e)}")
        return jsonify({"success": False, "enabled": _system_enabled})


@app.route('/api/prayer-times')
def api_prayer_times():
    """Günlük vakit saatlerini döndürür (dashboard timeline için).
    Tüm vakitler geçmişse yarının vakitlerini döner."""
    tz = pytz.timezone('Europe/Istanbul')
    now = datetime.now(tz)
    current_minutes = now.hour * 60 + now.minute

    times = get_prayer_times()

    # Tüm vakitler geçmiş mi kontrol et
    all_passed = True
    for key in VAKIT_ORDER:
        t = times.get(key, "00:00")
        h, m = map(int, t.split(':'))
        if h * 60 + m > current_minutes:
            all_passed = False
            break

    if all_passed:
        tomorrow = now + timedelta(days=1)
        times = get_prayer_times(date=tomorrow)
        return jsonify({'times': times, 'is_tomorrow': True})

    return jsonify({'times': times, 'is_tomorrow': False})


@app.route('/api/schedules', methods=['GET'])
def get_schedules():
    """Tüm zamanlamaları listele."""
    tz = pytz.timezone('Europe/Istanbul')
    now = datetime.now(tz)
    current_day = now.weekday()

    result = []
    for s in _schedules:
        result.append({
            **s,
            "is_active_now": _check_schedule_active(s),
            "day_names": [DAY_NAMES_TR[d] for d in s.get("days", [])]
        })

    return jsonify({
        "success": True,
        "schedules": result,
        "current_day": current_day,
        "current_day_name": DAY_NAMES_TR[current_day]
    })


@app.route('/api/schedules', methods=['POST'])
def add_schedule():
    """Yeni zamanlama ekle."""
    global _schedule_next_id

    try:
        data = request.get_json() or {}

        if 'pause_time' not in data:
            return jsonify({"success": False, "error": "pause_time gerekli"}), 400

        if not _validate_time_format(data['pause_time']):
            return jsonify({"success": False, "error": "Geçersiz pause_time formatı (HH:MM)"}), 400

        resume_time = data.get('resume_time')
        if resume_time and not _validate_time_format(resume_time):
            return jsonify({"success": False, "error": "Geçersiz resume_time formatı (HH:MM)"}), 400

        days = data.get('days', [])
        if not isinstance(days, list):
            return jsonify({"success": False, "error": "days bir liste olmalı"}), 400
        for d in days:
            if not isinstance(d, int) or d < 0 or d > 6:
                return jsonify({"success": False, "error": "days 0-6 arası integer olmalı"}), 400

        schedule = {
            "id": _schedule_next_id,
            "pause_time": data['pause_time'],
            "resume_time": resume_time,
            "days": sorted(days),
            "label": data.get('label', ''),
            "enabled": True
        }

        _schedules.append(schedule)
        _schedule_next_id += 1
        _save_schedules()

        logger.info(f"Schedule added: #{schedule['id']} {schedule['pause_time']}-{schedule.get('resume_time', 'süresiz')} days={schedule['days']}")

        return jsonify({"success": True, "schedule": schedule})

    except Exception as e:
        logger.error(f"Error adding schedule: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/schedules/<int:schedule_id>', methods=['PUT'])
def update_schedule(schedule_id):
    """Zamanlama güncelle (enabled toggle, zaman değişikliği vb.)."""
    try:
        data = request.get_json() or {}

        schedule = next((s for s in _schedules if s["id"] == schedule_id), None)
        if not schedule:
            return jsonify({"success": False, "error": "Zamanlama bulunamadı"}), 404

        if 'pause_time' in data:
            if not _validate_time_format(data['pause_time']):
                return jsonify({"success": False, "error": "Geçersiz pause_time"}), 400
            schedule['pause_time'] = data['pause_time']

        if 'resume_time' in data:
            if data['resume_time'] and not _validate_time_format(data['resume_time']):
                return jsonify({"success": False, "error": "Geçersiz resume_time"}), 400
            schedule['resume_time'] = data['resume_time']

        if 'days' in data:
            days = data['days']
            if not isinstance(days, list):
                return jsonify({"success": False, "error": "days bir liste olmalı"}), 400
            schedule['days'] = sorted(days)

        if 'label' in data:
            schedule['label'] = data['label']

        if 'enabled' in data:
            schedule['enabled'] = bool(data['enabled'])

        _save_schedules()
        logger.info(f"Schedule updated: #{schedule_id}")

        return jsonify({"success": True, "schedule": schedule})

    except Exception as e:
        logger.error(f"Error updating schedule: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/schedules/<int:schedule_id>', methods=['DELETE'])
def delete_schedule(schedule_id):
    """Zamanlama sil."""
    global _schedules

    before_count = len(_schedules)
    _schedules = [s for s in _schedules if s["id"] != schedule_id]

    if len(_schedules) == before_count:
        return jsonify({"success": False, "error": "Zamanlama bulunamadı"}), 404

    _save_schedules()
    logger.info(f"Schedule deleted: #{schedule_id}")

    return jsonify({"success": True})


# ============================================================
# SETTINGS ENDPOINTS
# ============================================================

@app.route('/settings', methods=['GET'])
def get_settings():
    """Mevcut ayarları döndürür."""
    return jsonify({"success": True, "settings": _settings})


@app.route('/settings', methods=['PUT'])
def update_settings():
    """Ayarları güncelle (partial update)."""
    global _settings

    try:
        data = request.get_json() or {}

        if 'city' in data:
            if not isinstance(data['city'], str) or not data['city'].strip():
                return jsonify({"success": False, "error": "city boş olamaz"}), 400
            _settings['city'] = data['city'].strip().upper()

        if 'launch_on_startup' in data:
            _settings['launch_on_startup'] = bool(data['launch_on_startup'])

        if 'start_minimized_to_tray' in data:
            _settings['start_minimized_to_tray'] = bool(data['start_minimized_to_tray'])

        if 'close_to_tray' in data:
            _settings['close_to_tray'] = bool(data['close_to_tray'])

        # Konum değiştiyse cache'i temizle
        if 'city' in data:
            prayer_times_cache.clear()
            logger.info(f"Prayer cache cleared (settings changed)")

        _save_settings(_settings)
        logger.info(f"Settings updated: {list(data.keys())}")

        return jsonify({"success": True, "settings": _settings})

    except Exception as e:
        logger.error(f"Error updating settings: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================

if __name__ == '__main__':
    import sys
    if '--dev' in sys.argv:
        app.run(debug=True)
    else:
        from waitress import serve
        logger.info("PauseTime backend starting on 127.0.0.1:5000")
        serve(app, host='127.0.0.1', port=5000, threads=4)
