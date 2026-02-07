# PauseTime

Ezan vakitlerinde ve kullanıcı tanımlı zamanlama aralıklarında sistem sesini otomatik olarak kapatan masaüstü uygulaması.

## Mimari

- **Backend:** Python Flask (localhost:5000) — vakit hesaplama, zamanlama yönetimi, state engine
- **Frontend:** Tauri + Vite (vanilla JS) — admin panel UI
- **Sistem Kontrolü:** Tauri native — OS seviyesinde ses mute/unmute

## Kurulum

### Backend

```bash
pip install -r requirements.txt
python app.py
```

### Frontend (Tauri)

```bash
cd pausetime
npm install
npm run tauri dev
```

## API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/state` | Ana state polling (5s) |
| POST | `/state/toggle` | Sistemi aç/kapat |
| GET | `/api/prayer-times` | Günlük vakit saatleri |
| GET | `/api/schedules` | Zamanlama listesi |
| POST | `/api/schedules` | Zamanlama ekle |
| PUT | `/api/schedules/<id>` | Zamanlama güncelle |
| DELETE | `/api/schedules/<id>` | Zamanlama sil |

## State Modeli

| State | Anlam |
|-------|-------|
| `ACTIVE` | Sistem çalışıyor, ses açık |
| `PAUSING` | Ezan vakti — ses otomatik kapatıldı (3.5 dk) |
| `MANUAL_PAUSE` | Zamanlama aktif — ses kapatıldı |
| `DISABLED` | Sistem devre dışı |
