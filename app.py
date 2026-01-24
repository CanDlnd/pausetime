from flask import Flask, render_template, jsonify, request, redirect, session, url_for, make_response, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import requests
import json
import logging
from datetime import datetime, timedelta
import pytz
from cachetools import TTLCache
import os

#--------------------------------------------Sitemap.xml--------------------------------------------
from flask import Flask, Response, request
import textwrap

app = Flask(__name__)

@app.route('/sitemap.xml', methods=['GET'])
def sitemap():
    sitemap_content = textwrap.dedent(f"""\
        <?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url>
                <loc>{request.host_url}</loc>
                <priority>1.0</priority>
            </url>
        </urlset>
    """)
    return Response(sitemap_content, mimetype='application/xml')

#--------------------------------------------Robots.txt--------------------------------------------

@app.route('/robots.txt')
def robots_txt():
    robots_content = "User-agent: *\nDisallow:\nSitemap: https://ezan-vakti.onrender.com/sitemap.xml"
    return Response(robots_content, mimetype="text/plain")

#--------------------------------------------------------------------------------------------------

app.secret_key = os.urandom(24)
CORS(app)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

prayer_times_cache = TTLCache(maxsize=100, ttl=3600)

# Türkiye'nin 81 ili (alfabetik sıralı)
TURKEY_CITIES = sorted([
    "ADANA", "ADIYAMAN", "AFYONKARAHİSARr", "AĞRI", "AKSARAY", "AMASYA", "ANKARA", "ANTALYA", "ARDAHAN", "ARTVİN",
    "AYDIN", "BALIKESİR", "BARTIN", "BATMAN", "BAYBURT", "BİLECİK", "BİNGÖL", "BİTLİS", "BOLU", "BURDUR",
    "BURSA", "ÇANAKKALE", "ÇANKIRI", "ÇORUM", "DENİZLİ", "DİYARBAKIR", "DÜZCE", "EDİRNE", "ELAZIĞ", "ERZİNCAN",
    "ERZURUM", "ESKİŞEHİR", "GAZİANTEP", "GİRESUN", "GÜMÜŞHANE", "HAKKARİ", "HATAY", "IĞDIR", "ISPARTA", "İSTANBUL",
    "İZMİR", "KAHRAMANMARAŞ", "KARABÜK", "KARAMAN", "KARS", "KASTAMONU", "KAYSERİ", "KİLİS", "KIRIKKALE", "KIRKLARELİ",
    "KIRŞEHİR", "KOCAELİ", "KONYA", "KÜTAHYA", "MALATYA", "MANİSA", "MARDİN", "MERSİN", "MUĞLA", "MUŞ",
    "NEVŞEHİR", "NİĞDE", "ORDU", "OSMANİYE", "RİZE", "SAKARYA", "SAMSUN", "ŞANLIURFA", "SİİRT", "SİNOP",
    "ŞIRNAK", "SİVAS", "TEKİRDAĞ", "TOKAT", "TRABZON", "TUNCELİ", "UŞAK", "VAN", "YALOVA", "YOZGAT", "ZONGULDAK"
])

def get_prayer_times(city="ISTANBUL", district=None):
    cache_key = f"{city.upper()}_{district.upper() if district else ''}_{datetime.now(pytz.timezone('Europe/Istanbul')).strftime('%Y-%m-%d')}"
    if cache_key in prayer_times_cache:
        logger.info(f"Cache hit for {city}, {district}")
        return prayer_times_cache[cache_key]

    url = "https://api.aladhan.com/v1/timingsByCity"
    params = {
        "city": city.capitalize(),
        "country": "Turkey",
        "method": 13
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data['code'] == 200:
            timings = data['data']['timings']
            result = {
                "Fajr": timings['Fajr'],
                "Dhuhr": timings['Dhuhr'],
                "Asr":  timings['Asr'],
                "Maghrib": timings['Maghrib'],
                "Isha": timings['Isha']
            }
            prayer_times_cache[cache_key] = result
            logger.info(f"Successfully fetched prayer times for {city}, {district}")
            return result
        else:
            logger.error(f"API error for {city}, {district}: {data.get('status')}")
            return get_default_times()
    except requests.RequestException as e:
        logger.error(f"Request error for {city}, {district}: {str(e)}")
        return get_default_times()
    except Exception as e:
        logger.error(f"Unexpected error for {city}, {district}: {str(e)}")
        return get_default_times()

def get_default_times():
    return {
        "Fajr": "06:00",
        "Dhuhr": "13:00",
        "Asr": "16:00",
        "Maghrib": "19:00",
        "Isha": "20:30"
    }

def get_weekly_prayer_times(city, district=None):
    weekly_times = []
    today = datetime.now()
    
    # Türkçe ay ve gün isimleri
    turkish_months = {
        1: 'Ocak', 2: 'Şubat', 3: 'Mart', 4: 'Nisan', 5: 'Mayıs', 6: 'Haziran',
        7: 'Temmuz', 8: 'Ağustos', 9: 'Eylül', 10: 'Ekim', 11: 'Kasım', 12: 'Aralık'
    }
    
    turkish_days = {
        'Monday': 'Pazartesi', 'Tuesday': 'Salı', 'Wednesday': 'Çarşamba',
        'Thursday': 'Perşembe', 'Friday': 'Cuma', 'Saturday': 'Cumartesi',
        'Sunday': 'Pazar'
    }
    
    for i in range(7):  # 7 günlük veri
        current_date = today + timedelta(days=i)
        date_str = current_date.strftime('%d-%m-%Y')
        
        try:
            url = f"https://api.aladhan.com/v1/timingsByCity/{date_str}?city={city}&country=Turkey&method=13"
            response = requests.get(url)
            data = response.json()
            
            if response.status_code == 200 and data['code'] == 200:
                timings = data['data']['timings']
                
                # Türkçe tarih formatı
                eng_day_name = current_date.strftime('%A')
                day_name = turkish_days[eng_day_name]
                month_name = turkish_months[current_date.month]
                formatted_date = f"{current_date.day} {month_name} {day_name}"
                
                day_info = {
                    'date': formatted_date,
                    'times': {
                        'Fajr': timings['Fajr'],
                        'Dhuhr': timings['Dhuhr'],
                        'Asr': timings['Asr'],
                        'Maghrib': timings['Maghrib'],
                        'Isha': timings['Isha']
                    }
                }
                weekly_times.append(day_info)
            else:
                logger.error(f"API error for {city} on {date_str}: {data.get('status')}")
                return None
                
        except Exception as e:
            logger.error(f"Error fetching prayer times for {city} on {date_str}: {str(e)}")
            return None
            
    return weekly_times

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_prayer_times')
@limiter.limit("30 per minute")
def prayer_times():
    try:
        city = request.args.get('city', 'ISTANBUL')
        district = request.args.get('district', None)
        times = get_prayer_times(city, district)
        return jsonify({
            'success': True,
            'prayer_times': times
        })
    except Exception as e:
        logger.error(f"Error in prayer_times route: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@app.route('/api/weekly-prayer-times')
def api_weekly_prayer_times():
    city = request.args.get('city', 'ISTANBUL')
    district = request.args.get('district')
    
    weekly_times = get_weekly_prayer_times(city, district)
    if weekly_times:
        return jsonify({'success': True, 'data': weekly_times})
    else:
        return jsonify({'success': False, 'error': 'Failed to fetch weekly prayer times'})

@app.route('/api/cities')
def get_cities():
    return jsonify({
        'success': True,
        'cities': TURKEY_CITIES  # Artık sıralı olduğu için tekrar sıralamaya gerek yok
    })

@app.route('/static/sw.js')
def service_worker():
    response = make_response(send_from_directory('static', 'sw.js'))
    response.headers['Content-Type'] = 'application/javascript'
    response.headers['Service-Worker-Allowed'] = '/'
    return response

# ============================================================
# STATE ENDPOINT - UI için tek state üretici
# ============================================================

VAKIT_NAMES = {
    "Fajr": "İmsak",
    "Dhuhr": "Öğle", 
    "Asr": "İkindi",
    "Maghrib": "Akşam",
    "Isha": "Yatsı"
}

VAKIT_ORDER = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]

# TEST: Manuel vakit override - None = API'den gelen değer kullanılır
# Örnek: TEST_OVERRIDE_FAJR = "05:15" → İmsak vaktini 05:15 yapar
TEST_OVERRIDE_FAJR = "05:46"  # Production: API'den gelen değer

# Global state yönetimi
_system_enabled = True  # Kullanıcı toggle durumu
_last_known_state = {
    "time": "--:--",
    "vakit": "Bilinmiyor",
    "remaining": "---",
    "state": "ACTIVE"
}

# Pause window sabitleri
PAUSE_DURATION_SECONDS = 10  # 4.5 dakika (production)

def _apply_test_overrides(prayer_times):
    """Test için vakit override'larını uygula"""
    if TEST_OVERRIDE_FAJR:
        prayer_times["Fajr"] = TEST_OVERRIDE_FAJR
    return prayer_times

def _parse_time(time_str):
    """HH:MM formatını datetime.time objesine çevirir"""
    h, m = map(int, time_str.split(':'))
    return h * 60 + m  # dakika cinsinden

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
    Döner: (vakit_adı, kalan_süre_str, state)
    
    State mantığı:
    - Ezan vakti geldi ve 4.5 dakika içindeyiz → PAUSING
    - Aksi halde → ACTIVE
    """
    tz = pytz.timezone('Europe/Istanbul')
    now = datetime.now(tz)
    current_minutes = now.hour * 60 + now.minute
    current_seconds = now.hour * 3600 + now.minute * 60 + now.second
    
    # Vakitleri saniyeye çevir (daha hassas hesap için)
    times_in_seconds = []
    for key in VAKIT_ORDER:
        t = prayer_times.get(key, "00:00")
        h, m = map(int, t.split(':'))
        times_in_seconds.append((key, h * 3600 + m * 60))
    
    # PAUSING kontrolü: Herhangi bir vakit şu an pause window içinde mi?
    state = "ACTIVE"
    for vakit_key, vakit_seconds in times_in_seconds:
        pause_window_end = vakit_seconds + PAUSE_DURATION_SECONDS
        
        # Gece yarısı geçişi kontrolü (Yatsı için)
        if vakit_seconds <= current_seconds < pause_window_end:
            state = "PAUSING"
            break
        # Gece yarısını geçen pause window (örn: 23:58 vakti, 00:02'ye kadar)
        if pause_window_end > 24 * 3600:
            adjusted_end = pause_window_end - 24 * 3600
            if current_seconds >= vakit_seconds or current_seconds < adjusted_end:
                state = "PAUSING"
                break
    
    # Bir sonraki vakti bul (şu andan SONRA gelen ilk vakit)
    next_vakit = None
    remaining_minutes = 0
    
    for vakit_key, vakit_seconds in times_in_seconds:
        vakit_minutes = vakit_seconds // 60
        if vakit_minutes > current_minutes:
            next_vakit = vakit_key
            remaining_minutes = vakit_minutes - current_minutes
            break
    
    # Eğer bugün kalan vakit yoksa → yarının İmsak vakti
    if next_vakit is None:
        next_vakit = "Fajr"
        fajr_minutes = times_in_seconds[0][1] // 60
        remaining_minutes = (24 * 60 - current_minutes) + fajr_minutes
    
    vakit_display = VAKIT_NAMES.get(next_vakit, next_vakit)
    remaining_str = _format_remaining(remaining_minutes)
    
    return vakit_display, remaining_str, state

@app.route('/state')
def get_state():
    """
    UI için tek state endpoint'i.
    
    State modeli:
    - ACTIVE: Normal çalışma
    - PAUSING: Ezan vakti geldi, 4.5 dakikalık pause penceresi içinde
    - DISABLED: Kullanıcı sistemi bilinçli olarak kapattı
    
    Hata durumları state değiştirmez, son geçerli state döner.
    """
    global _last_known_state, _system_enabled
    
    # Kullanıcı sistemi kapattıysa → DISABLED
    if not _system_enabled:
        return jsonify({
            "time": _last_known_state["time"],
            "vakit": _last_known_state["vakit"],
            "remaining": _last_known_state["remaining"],
            "state": "DISABLED"
        })
    
    try:
        city = request.args.get('city', 'ISTANBUL')
        district = request.args.get('district', None)
        
        # Mevcut fonksiyonu kullan
        prayer_times = get_prayer_times(city, district)
        
        # Şu anki zamanı al
        tz = pytz.timezone('Europe/Istanbul')
        now = datetime.now(tz)
        current_time = now.strftime('%H:%M')
        
   # TEST: Vakit override'larını uygula
        prayer_times = _apply_test_overrides(prayer_times)

        # State hesapla
        vakit, remaining, state = _get_current_state(prayer_times)
        
        # Başarılı sonucu kaydet
        _last_known_state = {
            "time": current_time,
            "vakit": vakit,
            "remaining": remaining,
            "state": state
        }
        
        return jsonify(_last_known_state)
        
    except Exception as e:
        # Hata durumunda: log'a yaz, son geçerli state'i döndür
        logger.error(f"Error in get_state: {str(e)}")
        return jsonify(_last_known_state)

@app.route('/state/toggle', methods=['POST'])
def toggle_state():
    """
    Sistemi açıp kapatmak için endpoint.
    Body: {"enabled": true/false}
    """
    global _system_enabled
    
    try:
        data = request.get_json() or {}
        if 'enabled' in data:
            _system_enabled = bool(data['enabled'])
            logger.info(f"System toggled: {'enabled' if _system_enabled else 'disabled'}")
        
        return jsonify({
            "success": True,
            "enabled": _system_enabled
        })
    except Exception as e:
        logger.error(f"Error in toggle_state: {str(e)}")
        return jsonify({
            "success": False,
            "enabled": _system_enabled
        })

@app.route('/state/status')
def get_system_status():
    """Sistem toggle durumunu döndürür"""
    return jsonify({"enabled": _system_enabled})

# ============================================================

if __name__ == '__main__':
    app.run(debug=True)
