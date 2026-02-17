/* ============================================
   PauseTime Admin Panel - Ana JavaScript
   Backend /state endpoint'i ile senkronize
   ============================================ */

import './style.css'
import { initAudio, onAudioStateChange } from './audio.js'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from '@tauri-apps/plugin-autostart'

// Backend API base URL
const API_BASE = 'http://localhost:5000'

// Uygulama durumları
const AppState = {
  ACTIVE: 'active',
  PAUSING: 'pausing',
  MANUAL_PAUSE: 'manual_pause',
  DISABLED: 'disabled'
}

// Durum metinleri
const StateText = {
  [AppState.ACTIVE]: 'Aktif',
  [AppState.PAUSING]: 'Duraklatılıyor',
  [AppState.MANUAL_PAUSE]: 'Manuel Durduruldu',
  [AppState.DISABLED]: 'Devre Dışı'
}

// Türkçe ay isimleri
const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
]

// Vakit isim eşleştirmeleri
const PRAYER_NAMES = {
  'İmsak': 'Fajr',
  'Öğle': 'Dhuhr',
  'İkindi': 'Asr',
  'Akşam': 'Maghrib',
  'Yatsı': 'Isha'
}

const PRAYER_ORDER = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']
const PRAYER_TR = { Fajr: 'İmsak', Dhuhr: 'Öğle', Asr: 'İkindi', Maghrib: 'Akşam', Isha: 'Yatsı' }

// DOM elementleri
const elements = {
  app: document.getElementById('app'),
  prayerTime: document.getElementById('prayer-time'),
  prayerName: document.getElementById('prayer-name'),
  countdown: document.getElementById('countdown'),
  statusToggle: document.getElementById('status-toggle'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  currentDate: document.getElementById('current-date'),
  pageTitle: document.getElementById('page-title'),
  // State badge
  stateBadge: document.getElementById('state-badge'),
  stateBadgeText: document.getElementById('state-badge-text'),
  // Connection
  connectionBadge: document.getElementById('connection-badge'),
  // Dashboard zamanlama kartı
  manualStatusIndicator: document.getElementById('manual-status-indicator'),
  manualIndicatorText: document.getElementById('manual-indicator-text'),
  // Schedule form elements
  scheduleAddForm: document.getElementById('schedule-add-form'),
  schedPauseTime: document.getElementById('sched-pause-time'),
  schedResumeTime: document.getElementById('sched-resume-time'),
  schedLabel: document.getElementById('sched-label'),
  scheduleList: document.getElementById('schedule-list'),
  scheduleCount: document.getElementById('schedule-count'),
  scheduleCountText: document.getElementById('schedule-count-text'),
  dayBtns: document.querySelectorAll('.day-btn'),
  presetBtns: document.querySelectorAll('.preset-btn'),
  // Schedule form edit mode
  scheduleFormTitle: document.getElementById('schedule-form-title'),
  scheduleSubmitBtn: document.getElementById('schedule-submit-btn'),
  scheduleSubmitText: document.getElementById('schedule-submit-text'),
  scheduleCancelBtn: document.getElementById('schedule-cancel-btn'),
  // Dashboard schedule summary
  dashboardScheduleInfo: document.getElementById('dashboard-schedule-info'),
  dashboardScheduleText: document.getElementById('dashboard-schedule-text'),
  // Timeline
  tlFajr: document.getElementById('tl-fajr'),
  tlDhuhr: document.getElementById('tl-dhuhr'),
  tlAsr: document.getElementById('tl-asr'),
  tlMaghrib: document.getElementById('tl-maghrib'),
  tlIsha: document.getElementById('tl-isha'),
  // Sidebar nav
  navItems: document.querySelectorAll('.nav-item'),
  pages: document.querySelectorAll('.page'),
  // Settings
  settingCity: document.getElementById('setting-city'),
  settingLaunchStartup: document.getElementById('setting-launch-startup'),
  settingStartMinimized: document.getElementById('setting-start-minimized'),
  aboutVersion: document.getElementById('about-version'),
  settingsToast: document.getElementById('settings-toast'),
}

// Son geçerli state (hata durumunda korunur)
let lastState = {
  time: '--:--',
  vakit: 'Yükleniyor',
  remaining: '---',
  state: 'ACTIVE'
}

// Bağlantı durumu
let isConnected = false

// Sistem sesi kontrol state'i (tekrar tekrar komut göndermeyi önler)
let lastSystemMute = null

// Tarihi Türkçe formatla
function formatDateTR() {
  const now = new Date()
  const day = now.getDate()
  const month = MONTHS_TR[now.getMonth()]
  const year = now.getFullYear()
  return `${day} ${month} ${year}`
}

// Backend state'ini UI state'ine çevir
function mapState(backendState) {
  const mapping = {
    'ACTIVE': AppState.ACTIVE,
    'PAUSING': AppState.PAUSING,
    'MANUAL_PAUSE': AppState.MANUAL_PAUSE,
    'DISABLED': AppState.DISABLED
  }
  return mapping[backendState] || AppState.ACTIVE
}

// Sistem sesini kontrol et (Tauri native)
async function controlSystemMute(state) {
  if (state === 'DISABLED') return

  const shouldMute = state === 'PAUSING' || state === 'MANUAL_PAUSE'
  if (lastSystemMute === shouldMute) return

  try {
    await invoke('set_system_mute', { mute: shouldMute })
    lastSystemMute = shouldMute
    console.log(`System mute: ${shouldMute}`)
  } catch (error) {
    console.error('System mute error:', error)
  }
}

// Tray toggle metnini güncelle
async function updateTrayToggleText(isDisabled) {
  try {
    await invoke('update_tray_toggle_text', { isDisabled })
  } catch (error) {
    console.error('Tray text update error:', error)
  }
}

// Bağlantı durumunu güncelle
function updateConnectionBadge(connected) {
  isConnected = connected
  if (connected) {
    elements.connectionBadge.className = 'connection-badge connected'
    elements.connectionBadge.querySelector('.conn-text').textContent = 'Bağlı'
    elements.connectionBadge.title = 'Backend sunucusu çalışıyor (localhost:5000)'
  } else {
    elements.connectionBadge.className = 'connection-badge disconnected'
    elements.connectionBadge.querySelector('.conn-text').textContent = 'Bağlantı Yok'
    elements.connectionBadge.title = 'Backend sunucusuna ulaşılamıyor'
  }
}

// State badge tooltip metinleri
const StateTooltip = {
  [AppState.ACTIVE]: 'Sistem arka planda çalışıyor, vakitler izleniyor',
  [AppState.PAUSING]: 'Ezan vakti — ses otomatik olarak kapatıldı',
  [AppState.MANUAL_PAUSE]: 'Kullanıcı tarafından manuel olarak durduruldu',
  [AppState.DISABLED]: 'Sistem devre dışı — hiçbir işlem yapılmıyor'
}

// State badge güncelle
function updateStateBadge(uiState) {
  elements.stateBadge.className = `state-badge state-${uiState}`
  elements.stateBadgeText.textContent = StateText[uiState]
  elements.stateBadge.title = StateTooltip[uiState] || ''
}

// Dashboard zamanlama kartı badge güncelle
function updateManualCard(isManualPause) {
  if (isManualPause) {
    elements.manualStatusIndicator.className = 'manual-indicator on'
    elements.manualIndicatorText.textContent = 'Aktif'
  } else {
    elements.manualStatusIndicator.className = 'manual-indicator off'
    elements.manualIndicatorText.textContent = 'Kapalı'
  }
}

// Dashboard zamanlama bilgisini güncelle
function updateDashboardScheduleInfo(data) {
  const total = data.schedules_total || 0
  const active = data.schedules_active || 0

  if (total > 0) {
    elements.dashboardScheduleText.textContent = `${active}/${total} zamanlama aktif`
  } else {
    elements.dashboardScheduleText.textContent = 'Zamanlama yok'
  }
}

// UI'yi backend state ile güncelle
function applyState(data) {
  const uiState = mapState(data.state)
  elements.app.className = `state-${uiState}`

  // Vakit bilgilerini güncelle
  elements.prayerTime.textContent = data.time
  elements.prayerName.textContent = data.vakit
  elements.countdown.textContent = data.remaining + ' sonra'

  // Durum metnini güncelle
  elements.statusText.textContent = StateText[uiState]

  // Tarihi güncelle
  elements.currentDate.textContent = formatDateTR()

  // State badge güncelle
  updateStateBadge(uiState)

  // Zamanlama kartı güncelle
  const isManualPause = data.state === 'MANUAL_PAUSE'
  updateManualCard(isManualPause)
  updateDashboardScheduleInfo(data)

  // Bağlantı OK
  updateConnectionBadge(true)

  // Sistem sesi kontrolü
  controlSystemMute(data.state)

  // Tray toggle metnini güncelle
  updateTrayToggleText(data.state === 'DISABLED')

  // Audio state'i bildir
  onAudioStateChange(uiState)

  // Son geçerli state'i kaydet
  lastState = data
}

// Backend'den state fetch et
async function fetchState() {
  try {
    const response = await fetch(`${API_BASE}/state`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = await response.json()
    applyState(data)
  } catch (error) {
    console.error('State fetch error:', error)
    updateConnectionBadge(false)
  }
}

// Vakit saatlerini timeline'a yaz
async function fetchPrayerTimes() {
  try {
    const response = await fetch(`${API_BASE}/state`)
    if (!response.ok) return

    // Vakit saatlerini ayrı endpoint'ten al
    const timesResponse = await fetch(`${API_BASE}/api/prayer-times`)
    if (!timesResponse.ok) return

    const timesData = await timesResponse.json()
    if (timesData && timesData.times) {
      const times = timesData.times
      const isTomorrow = timesData.is_tomorrow || false
      if (elements.tlFajr) elements.tlFajr.textContent = times.Fajr || '--:--'
      if (elements.tlDhuhr) elements.tlDhuhr.textContent = times.Dhuhr || '--:--'
      if (elements.tlAsr) elements.tlAsr.textContent = times.Asr || '--:--'
      if (elements.tlMaghrib) elements.tlMaghrib.textContent = times.Maghrib || '--:--'
      if (elements.tlIsha) elements.tlIsha.textContent = times.Isha || '--:--'
      updateTimelineDots(times, isTomorrow)

      // Aktivite kartı başlığını güncelle
      const activityTitle = document.querySelector('.card-activity .card-title')
      if (activityTitle) {
        activityTitle.textContent = isTomorrow ? 'Yarınki Ezan Vakitleri' : 'Günlük Aktivite'
      }
    }
  } catch (error) {
    console.log('Prayer times fetch skipped:', error.message)
  }
}

// Son bilinen vakit verileri (progress güncelleme döngüsü için)
let lastPrayerTimes = null
let lastIsTomorrow = false
let timelineProgressInterval = null

// Timeline noktalarını ve ilerleme çizgilerini güncelle
function updateTimelineDots(times, isTomorrow = false) {
  if (!times) return

  // Verileri sakla (her saniye güncelleme için)
  lastPrayerTimes = times
  lastIsTomorrow = isTomorrow

  // İlk çizim
  renderTimelineState()

  // Her saniye güncellenen ilerleme döngüsünü başlat
  if (!timelineProgressInterval) {
    timelineProgressInterval = setInterval(renderTimelineState, 1000)
  }
}

function renderTimelineState() {
  const times = lastPrayerTimes
  if (!times) return

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60

  const tlItems = document.querySelectorAll('.timeline-item')
  const prayerKeys = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']

  // Her vakit için dakika değerini hesapla
  const prayerMinutesArr = prayerKeys.map(key => {
    const timeStr = times[key]
    if (!timeStr) return 0
    const [h, m] = timeStr.split(':').map(Number)
    return h * 60 + m
  })

  let nextFound = false
  let lastPassedIndex = -1

  prayerKeys.forEach((key, i) => {
    if (!tlItems[i]) return

    const dot = tlItems[i].querySelector('.tl-dot')
    const status = tlItems[i].querySelector('.tl-status')
    const lineFill = tlItems[i].querySelector('.tl-line-fill')

    // Temizle
    dot.classList.remove('tl-done', 'tl-current')
    tlItems[i].classList.remove('tl-passed', 'tl-next', 'tl-progressing')
    if (status) status.textContent = ''
    if (lineFill) lineFill.style.width = '0%'

    if (lastIsTomorrow) {
      if (!nextFound) {
        dot.classList.add('tl-current')
        tlItems[i].classList.add('tl-next')
        if (status) status.textContent = 'Sırada'
        nextFound = true
      }
    } else {
      if (currentMinutes >= prayerMinutesArr[i]) {
        dot.classList.add('tl-done')
        tlItems[i].classList.add('tl-passed')
        if (status) status.textContent = 'Geçti'
        if (lineFill) lineFill.style.width = '100%'
        lastPassedIndex = i
      } else if (!nextFound) {
        dot.classList.add('tl-current')
        tlItems[i].classList.add('tl-next')
        if (status) status.textContent = 'Sırada'
        nextFound = true
      }
    }
  })

  // İlerleme çizgisini hesapla (son geçen → sıradaki arası)
  if (!lastIsTomorrow && lastPassedIndex >= 0 && lastPassedIndex < prayerKeys.length - 1) {
    const fromMinutes = prayerMinutesArr[lastPassedIndex]
    const toMinutes = prayerMinutesArr[lastPassedIndex + 1]
    const totalSpan = toMinutes - fromMinutes

    if (totalSpan > 0) {
      const elapsed = currentMinutes - fromMinutes
      const progress = Math.min(Math.max(elapsed / totalSpan, 0), 1) * 100

      const progressItem = tlItems[lastPassedIndex]
      const lineFill = progressItem?.querySelector('.tl-line-fill')
      if (lineFill) {
        lineFill.style.width = `${progress}%`
        progressItem.classList.add('tl-progressing')
      }
    }
  }
}

// Toggle endpoint'ini çağır
async function toggleSystem(enabled) {
  try {
    const response = await fetch(`${API_BASE}/state/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    await fetchState()
  } catch (error) {
    console.error('Toggle error:', error)
  }
}

// Durum toggle tıklama
function handleDotClick() {
  const isCurrentlyDisabled = lastState.state === 'DISABLED'
  toggleSystem(isCurrentlyDisabled)
}

// ============================================
// Sayfa Navigasyonu
// ============================================

const PAGE_TITLES = {
  'dashboard': 'Panel',
  'manual-pause': 'Manuel Kontrol',
  'settings': 'Ayarlar'
}

function switchPage(pageId) {
  // Nav butonları güncelle
  elements.navItems.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId)
  })

  // Sayfaları göster/gizle
  elements.pages.forEach(page => {
    const id = page.id.replace('page-', '')
    page.classList.toggle('active', id === pageId)
  })

  // Başlık güncelle
  elements.pageTitle.textContent = PAGE_TITLES[pageId] || 'Panel'
}

// ============================================
// Zamanlama (Schedule) Yönetimi
// ============================================

const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

// Seçili günleri takip et
let selectedDays = new Set()

// Düzenleme modu state
let editingScheduleId = null
let cachedSchedules = []

function toggleDay(dayNum) {
  if (selectedDays.has(dayNum)) {
    selectedDays.delete(dayNum)
  } else {
    selectedDays.add(dayNum)
  }
  updateDayButtons()
}

function updateDayButtons() {
  elements.dayBtns.forEach(btn => {
    const day = parseInt(btn.dataset.day)
    btn.classList.toggle('selected', selectedDays.has(day))
  })
}

function applyDayPreset(preset) {
  switch (preset) {
    case 'weekdays':
      selectedDays = new Set([0, 1, 2, 3, 4])
      break
    case 'weekends':
      selectedDays = new Set([5, 6])
      break
    case 'all':
      selectedDays = new Set([0, 1, 2, 3, 4, 5, 6])
      break
    case 'clear':
      selectedDays = new Set()
      break
  }
  updateDayButtons()
}

// Zamanlamaları backend'den getir ve listele
async function fetchSchedules() {
  try {
    const response = await fetch(`${API_BASE}/api/schedules`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = await response.json()
    renderScheduleList(data.schedules || [])
  } catch (error) {
    console.error('Schedule fetch error:', error)
  }
}

// Zamanlama listesini render et
function renderScheduleList(schedules) {
  const container = elements.scheduleList
  if (!container) return

  // Cache'i güncelle (düzenleme için)
  cachedSchedules = schedules

  // Sayacı güncelle
  if (elements.scheduleCountText) {
    elements.scheduleCountText.textContent = `${schedules.length} zamanlama`
  }
  if (elements.scheduleCount) {
    const hasActive = schedules.some(s => s.is_active_now)
    elements.scheduleCount.className = hasActive ? 'manual-indicator on' : 'manual-indicator off'
  }

  if (schedules.length === 0) {
    container.innerHTML = '<p class="schedule-empty">Henüz zamanlama eklenmedi.</p>'
    return
  }

  container.innerHTML = schedules.map(s => {
    const isActive = s.is_active_now
    const isEnabled = s.enabled
    const isEditing = editingScheduleId === s.id
    const activeClass = isActive ? 'active-now' : ''
    const disabledClass = !isEnabled ? 'disabled' : ''
    const editingClass = isEditing ? 'editing' : ''
    const timeRange = s.resume_time
      ? `${s.pause_time} → ${s.resume_time}`
      : `${s.pause_time} → Süresiz`
    const dayBadges = s.days && s.days.length > 0
      ? s.days.map(d => `<span class="day-badge">${DAY_SHORT[d]}</span>`).join('')
      : '<span class="day-badge">Her gün</span>'

    return `
      <div class="schedule-item ${activeClass} ${disabledClass} ${editingClass}" data-id="${s.id}">
        <div class="schedule-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
        </div>
        <div class="schedule-info">
          <div class="schedule-time-range">${timeRange}</div>
          <div class="schedule-meta">
            ${s.label ? `<span class="schedule-label-text">${s.label}</span>` : ''}
            <div class="schedule-days-badges">${dayBadges}</div>
          </div>
        </div>
        <div class="schedule-actions">
          <button class="sched-edit-btn" data-id="${s.id}" title="Düzenle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button class="sched-toggle-btn ${isEnabled ? 'on' : ''}" data-id="${s.id}" data-enabled="${isEnabled}" title="${isEnabled ? 'Devre dışı bırak' : 'Etkinleştir'}"></button>
          <button class="sched-delete-btn" data-id="${s.id}" title="Sil">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6" />
              <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
            </svg>
          </button>
        </div>
      </div>
    `
  }).join('')

  // Event delegation for edit/toggle/delete buttons
  container.querySelectorAll('.sched-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => startEditSchedule(parseInt(btn.dataset.id)))
  })

  container.querySelectorAll('.sched-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleSchedule(parseInt(btn.dataset.id), btn.dataset.enabled === 'true'))
  })

  container.querySelectorAll('.sched-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteSchedule(parseInt(btn.dataset.id)))
  })
}

// Zamanlama ekle
async function addSchedule(pauseTime, resumeTime, days, label) {
  try {
    const body = { pause_time: pauseTime }
    if (resumeTime) body.resume_time = resumeTime
    if (days.length > 0) body.days = days
    if (label) body.label = label

    const response = await fetch(`${API_BASE}/api/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    await fetchSchedules()
    return true
  } catch (error) {
    console.error('Add schedule error:', error)
    return false
  }
}

// Düzenleme moduna geç
function startEditSchedule(id) {
  const schedule = cachedSchedules.find(s => s.id === id)
  if (!schedule) return

  editingScheduleId = id

  // Formu verilerle doldur
  elements.schedPauseTime.value = schedule.pause_time || ''
  elements.schedResumeTime.value = schedule.resume_time || ''
  elements.schedLabel.value = schedule.label || ''

  // Günleri seç
  selectedDays = new Set(schedule.days || [])
  updateDayButtons()

  // Form görünümünü düzenleme moduna çevir
  elements.scheduleFormTitle.textContent = 'Zamanlama Düzenle'
  elements.scheduleSubmitText.textContent = 'Güncelle'
  elements.scheduleSubmitBtn.classList.remove('btn-pause')
  elements.scheduleSubmitBtn.classList.add('btn-edit')
  elements.scheduleCancelBtn.style.display = ''

  // Düzenlenen item'a vurgu ekle
  document.querySelectorAll('.schedule-item').forEach(el => {
    el.classList.toggle('editing', parseInt(el.dataset.id) === id)
  })

  // Forma scroll yap
  elements.scheduleAddForm.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Düzenleme modunu iptal et
function cancelEditSchedule() {
  editingScheduleId = null

  // Formu sıfırla
  elements.schedPauseTime.value = ''
  elements.schedResumeTime.value = ''
  elements.schedLabel.value = ''
  selectedDays = new Set()
  updateDayButtons()

  // Form görünümünü ekleme moduna çevir
  elements.scheduleFormTitle.textContent = 'Yeni Zamanlama Ekle'
  elements.scheduleSubmitText.textContent = 'Zamanlama Ekle'
  elements.scheduleSubmitBtn.classList.remove('btn-edit')
  elements.scheduleSubmitBtn.classList.add('btn-pause')
  elements.scheduleCancelBtn.style.display = 'none'

  // Düzenleme vurgusunu kaldır
  document.querySelectorAll('.schedule-item.editing').forEach(el => {
    el.classList.remove('editing')
  })
}

// Zamanlamayı güncelle (düzenleme)
async function updateSchedule(id, pauseTime, resumeTime, days, label) {
  try {
    const body = {
      pause_time: pauseTime,
      resume_time: resumeTime || null,
      days: days.length > 0 ? days : [],
      label: label || ''
    }

    const response = await fetch(`${API_BASE}/api/schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    await fetchSchedules()
    await fetchState()
    return true
  } catch (error) {
    console.error('Update schedule error:', error)
    return false
  }
}

// Zamanlama toggle
async function toggleSchedule(id, currentlyEnabled) {
  try {
    const response = await fetch(`${API_BASE}/api/schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !currentlyEnabled })
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    await fetchSchedules()
    await fetchState()
  } catch (error) {
    console.error('Toggle schedule error:', error)
  }
}

// Zamanlama sil
async function deleteSchedule(id) {
  try {
    const response = await fetch(`${API_BASE}/api/schedules/${id}`, {
      method: 'DELETE'
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    await fetchSchedules()
    await fetchState()
  } catch (error) {
    console.error('Delete schedule error:', error)
  }
}

// Zamanlama formu submit (hem ekleme hem düzenleme)
async function submitScheduleForm(e) {
  e.preventDefault()

  const pauseTime = elements.schedPauseTime.value
  if (!pauseTime) return

  const resumeTime = elements.schedResumeTime.value || null
  const days = [...selectedDays].sort()
  const label = elements.schedLabel.value.trim()

  let ok = false

  if (editingScheduleId !== null) {
    // Düzenleme modu: güncelle
    ok = await updateSchedule(editingScheduleId, pauseTime, resumeTime, days, label)
  } else {
    // Ekleme modu: yeni ekle
    ok = await addSchedule(pauseTime, resumeTime, days, label)
  }

  if (ok) {
    cancelEditSchedule()
  }
}

// ============================================
// Event Listener'lar
// ============================================

// ============================================
// Ayarlar (Settings) Yönetimi
// ============================================

let settingsLoaded = false

// OS-level autostart durumunu settings ile senkronize et
async function syncAutostart(shouldEnable) {
  try {
    const currentlyEnabled = await isAutostartEnabled()
    if (shouldEnable && !currentlyEnabled) {
      await enableAutostart()
      console.log('Autostart synced: enabled')
    } else if (!shouldEnable && currentlyEnabled) {
      await disableAutostart()
      console.log('Autostart synced: disabled')
    }
  } catch (error) {
    console.error('Autostart sync error:', error)
  }
}

async function fetchSettings() {
  try {
    const res = await fetch(`${API_BASE}/settings`)
    if (!res.ok) return
    const data = await res.json()
    if (!data.success) return
    const s = data.settings
    elements.settingCity.value = s.city || 'ISTANBUL'
    elements.settingLaunchStartup.checked = !!s.launch_on_startup
    elements.settingStartMinimized.checked = !!s.start_minimized_to_tray
    settingsLoaded = true

    // Uygulama başlangıcında autostart durumunu senkronize et
    await syncAutostart(!!s.launch_on_startup)
  } catch (e) {
    console.error('Settings fetch error:', e)
  }
}

let toastTimeout = null

function showSaveToast() {
  clearTimeout(toastTimeout)
  elements.settingsToast.classList.add('visible')
  toastTimeout = setTimeout(() => {
    elements.settingsToast.classList.remove('visible')
  }, 1500)
}

async function updateSetting(key, value) {
  try {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    })
    if (!res.ok) return
    const data = await res.json()
    if (data.success) {
      showSaveToast()
      if (key === 'city') {
        // Konum değişti, vakit bilgisini yenile
        fetchPrayerTimes()
        fetchState()
      }
    }
  } catch (e) {
    console.error('Settings update error:', e)
  }
}

function initSettingsEvents() {
  // Şehir dropdown
  elements.settingCity.addEventListener('change', () => {
    updateSetting('city', elements.settingCity.value)
  })

  // Toggle'lar
  elements.settingLaunchStartup.addEventListener('change', async () => {
    const enabled = elements.settingLaunchStartup.checked
    updateSetting('launch_on_startup', enabled)
    // OS-level autostart'ı güncelle
    try {
      if (enabled) {
        await enableAutostart()
      } else {
        await disableAutostart()
      }
      console.log(`Autostart ${enabled ? 'enabled' : 'disabled'}`)
    } catch (error) {
      console.error('Autostart update error:', error)
    }
  })
  elements.settingStartMinimized.addEventListener('change', () => {
    updateSetting('start_minimized_to_tray', elements.settingStartMinimized.checked)
  })
}

function initEvents() {
  // Sistem toggle
  elements.statusToggle.addEventListener('click', handleDotClick)

  // Sidebar navigasyon
  elements.navItems.forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page))
  })

  // Zamanlama formu
  elements.scheduleAddForm?.addEventListener('submit', submitScheduleForm)
  elements.scheduleCancelBtn?.addEventListener('click', cancelEditSchedule)

  // Gün seçici butonları
  elements.dayBtns.forEach(btn => {
    btn.addEventListener('click', () => toggleDay(parseInt(btn.dataset.day)))
  })

  // Gün preset butonları
  elements.presetBtns.forEach(btn => {
    btn.addEventListener('click', () => applyDayPreset(btn.dataset.preset))
  })

  // Ayarlar event'leri
  initSettingsEvents()
}

// Polling başlat (5 saniyede bir)
function startPolling() {
  fetchState()
  fetchPrayerTimes()
  fetchSchedules()
  setInterval(fetchState, 5000)
  setInterval(fetchPrayerTimes, 60000) // Vakit saatleri dakikada bir
  setInterval(fetchSchedules, 10000)   // Zamanlamalar 10 saniyede bir
}

// Tray event dinleyicisi
async function initTrayListener() {
  await listen('tray-toggle', () => {
    const isCurrentlyDisabled = lastState.state === 'DISABLED'
    toggleSystem(isCurrentlyDisabled)
  })
}

// Uygulamayı başlat
async function init() {
  // Tarihi hemen göster
  elements.currentDate.textContent = formatDateTR()

  initEvents()
  initAudio()
  fetchSettings()
  startPolling()

  // Tray event dinleyicisi
  await initTrayListener()
}

init()