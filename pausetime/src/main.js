/* ============================================
   PauseTime Admin Panel - Ana JavaScript
   Backend /state endpoint'i ile senkronize
   ============================================ */

import './style.css'
import { initAudio, onAudioStateChange } from './audio.js'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

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
  // Manual control card
  menuManualPause: document.getElementById('menu-manual-pause'),
  menuCancelManual: document.getElementById('menu-cancel-manual'),
  manualStatusIndicator: document.getElementById('manual-status-indicator'),
  manualIndicatorText: document.getElementById('manual-indicator-text'),
  // Quick pause buttons
  quickPause30: document.getElementById('quick-pause-30'),
  quickPause60: document.getElementById('quick-pause-60'),
  quickPause120: document.getElementById('quick-pause-120'),
  // Modal elements
  manualPauseModal: document.getElementById('manual-pause-modal'),
  manualPauseForm: document.getElementById('manual-pause-form'),
  pauseTimeInput: document.getElementById('pause-time'),
  resumeTimeInput: document.getElementById('resume-time'),
  modalCancel: document.getElementById('modal-cancel'),
  // Manual page elements
  manualPauseFormPage: document.getElementById('manual-pause-form-page'),
  pauseTimePageInput: document.getElementById('pause-time-page'),
  resumeTimePageInput: document.getElementById('resume-time-page'),
  cancelManualPage: document.getElementById('cancel-manual-page'),
  instantPauseIndicator: document.getElementById('instant-pause-indicator'),
  instantPauseText: document.getElementById('instant-pause-text'),
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
  // Overflow menu (compat - hidden)
  overflowBtn: null,
  overflowMenu: document.getElementById('overflow-menu'),
  menuSettings: document.getElementById('menu-settings')
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
  } else {
    elements.connectionBadge.className = 'connection-badge disconnected'
    elements.connectionBadge.querySelector('.conn-text').textContent = 'Bağlantı Yok'
  }
}

// State badge güncelle
function updateStateBadge(uiState) {
  // Badge class
  elements.stateBadge.className = `state-badge state-${uiState}`
  elements.stateBadgeText.textContent = StateText[uiState]
}

// Manuel kontrol kartı durumunu güncelle
function updateManualCard(isManualPause) {
  if (isManualPause) {
    elements.menuManualPause.classList.add('hidden')
    elements.menuCancelManual.classList.remove('hidden')
    elements.manualStatusIndicator.className = 'manual-indicator on'
    elements.manualIndicatorText.textContent = 'Aktif'
    // Quick butonları gizle
    document.querySelector('.quick-actions')?.classList.add('hidden')
  } else {
    elements.menuManualPause.classList.remove('hidden')
    elements.menuCancelManual.classList.add('hidden')
    elements.manualStatusIndicator.className = 'manual-indicator off'
    elements.manualIndicatorText.textContent = 'Kapalı'
    document.querySelector('.quick-actions')?.classList.remove('hidden')
  }
}

// Manuel sayfa durumunu güncelle
function updateManualPage(isManualPause) {
  if (isManualPause) {
    elements.cancelManualPage?.classList.remove('hidden')
    elements.instantPauseIndicator.className = 'manual-indicator on'
    elements.instantPauseText.textContent = 'Aktif'
  } else {
    elements.cancelManualPage?.classList.add('hidden')
    elements.instantPauseIndicator.className = 'manual-indicator off'
    elements.instantPauseText.textContent = 'Kapalı'
  }
}

// Dashboard zamanlama bilgisini güncelle
function updateDashboardScheduleInfo(data) {
  const total = data.schedules_total || 0
  const active = data.schedules_active || 0

  if (total > 0) {
    elements.dashboardScheduleInfo?.classList.remove('hidden')
    elements.dashboardScheduleText.textContent = `${active}/${total} zamanlama aktif`
  } else {
    elements.dashboardScheduleInfo?.classList.add('hidden')
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

  // Manuel kontrol güncelle
  const isManualPause = data.state === 'MANUAL_PAUSE'
  updateManualCard(isManualPause)
  updateManualPage(isManualPause)

  // Dashboard zamanlama bilgisi
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
      if (elements.tlFajr) elements.tlFajr.textContent = times.Fajr || '--:--'
      if (elements.tlDhuhr) elements.tlDhuhr.textContent = times.Dhuhr || '--:--'
      if (elements.tlAsr) elements.tlAsr.textContent = times.Asr || '--:--'
      if (elements.tlMaghrib) elements.tlMaghrib.textContent = times.Maghrib || '--:--'
      if (elements.tlIsha) elements.tlIsha.textContent = times.Isha || '--:--'
      updateTimelineDots(times)
    }
  } catch (error) {
    console.log('Prayer times fetch skipped:', error.message)
  }
}

// Timeline noktalarını güncelle (geçen vakitler yeşil)
function updateTimelineDots(times) {
  if (!times) return

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const tlDots = document.querySelectorAll('.timeline-item .tl-dot')
  const prayerKeys = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']

  let nextFound = false
  prayerKeys.forEach((key, i) => {
    const timeStr = times[key]
    if (!timeStr || !tlDots[i]) return

    const [h, m] = timeStr.split(':').map(Number)
    const prayerMinutes = h * 60 + m

    tlDots[i].classList.remove('tl-done', 'tl-current')

    if (currentMinutes >= prayerMinutes) {
      tlDots[i].classList.add('tl-done')
    } else if (!nextFound) {
      tlDots[i].classList.add('tl-current')
      nextFound = true
    }
  })
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
// Modal Logic
// ============================================

function openManualPauseModal() {
  const now = new Date()
  now.setMinutes(now.getMinutes() + 5)
  const defaultTime = now.toTimeString().slice(0, 5)
  elements.pauseTimeInput.value = defaultTime
  elements.resumeTimeInput.value = ''
  elements.manualPauseModal.classList.remove('hidden')
}

function closeManualPauseModal() {
  elements.manualPauseModal.classList.add('hidden')
}

function handleModalClick(e) {
  if (e.target === elements.manualPauseModal) {
    closeManualPauseModal()
  }
}

// ============================================
// Zamanlama (Schedule) Yönetimi
// ============================================

const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

// Seçili günleri takip et
let selectedDays = new Set()

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
    const activeClass = isActive ? 'active-now' : ''
    const disabledClass = !isEnabled ? 'disabled' : ''
    const timeRange = s.resume_time
      ? `${s.pause_time} → ${s.resume_time}`
      : `${s.pause_time} → Süresiz`
    const dayBadges = s.days && s.days.length > 0
      ? s.days.map(d => `<span class="day-badge">${DAY_SHORT[d]}</span>`).join('')
      : '<span class="day-badge">Her gün</span>'

    return `
      <div class="schedule-item ${activeClass} ${disabledClass}" data-id="${s.id}">
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

  // Event delegation for toggle/delete buttons
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

// Zamanlama formu submit
async function submitScheduleForm(e) {
  e.preventDefault()

  const pauseTime = elements.schedPauseTime.value
  if (!pauseTime) return

  const resumeTime = elements.schedResumeTime.value || null
  const days = [...selectedDays].sort()
  const label = elements.schedLabel.value.trim()

  const ok = await addSchedule(pauseTime, resumeTime, days, label)
  if (ok) {
    // Formu sıfırla
    elements.schedPauseTime.value = ''
    elements.schedResumeTime.value = ''
    elements.schedLabel.value = ''
    selectedDays = new Set()
    updateDayButtons()
  }
}

// ============================================
// Manuel Pause API
// ============================================

// Manuel pause POST (genel)
async function postManualPause(pauseTime, resumeTime) {
  const body = { pause_time: pauseTime }
  if (resumeTime) {
    body.resume_time = resumeTime
  }

  try {
    const response = await fetch(`${API_BASE}/state/manual-pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    await fetchState()
    return true
  } catch (error) {
    console.error('Manual pause error:', error)
    return false
  }
}

// Modal form submit
async function submitManualPause(e) {
  e.preventDefault()

  const pauseTime = elements.pauseTimeInput.value
  if (!pauseTime) return

  const resumeTime = elements.resumeTimeInput.value || null

  const ok = await postManualPause(pauseTime, resumeTime)
  if (ok) closeManualPauseModal()
}

// Manuel sayfa form submit
async function submitManualPausePage(e) {
  e.preventDefault()

  const pauseTime = elements.pauseTimePageInput.value
  if (!pauseTime) return

  const resumeTime = elements.resumeTimePageInput.value || null
  await postManualPause(pauseTime, resumeTime)
}

// Quick pause (dakika bazlı)
async function quickPause(minutes) {
  const now = new Date()
  const pauseTime = now.toTimeString().slice(0, 5)

  now.setMinutes(now.getMinutes() + minutes)
  const resumeTime = now.toTimeString().slice(0, 5)

  await postManualPause(pauseTime, resumeTime)
}

// Manuel pause'u kaldır
async function cancelManualPause() {
  try {
    const response = await fetch(`${API_BASE}/state/manual-pause`, {
      method: 'DELETE'
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    await fetchState()
  } catch (error) {
    console.error('Cancel manual pause error:', error)
  }
}

// ============================================
// Event Listener'lar
// ============================================

function initEvents() {
  // Sistem toggle
  elements.statusToggle.addEventListener('click', handleDotClick)

  // Sidebar navigasyon
  elements.navItems.forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page))
  })

  // Quick pause butonları
  elements.quickPause30?.addEventListener('click', () => quickPause(30))
  elements.quickPause60?.addEventListener('click', () => quickPause(60))
  elements.quickPause120?.addEventListener('click', () => quickPause(120))

  // Manuel pause (dashboard kart — özel buton)
  elements.menuManualPause.addEventListener('click', openManualPauseModal)

  // Manuel pause kaldır (dashboard kart)
  elements.menuCancelManual.addEventListener('click', cancelManualPause)

  // Manuel sayfa kaldır butonu
  elements.cancelManualPage?.addEventListener('click', cancelManualPause)

  // Modal events
  elements.modalCancel.addEventListener('click', closeManualPauseModal)
  elements.manualPauseModal.addEventListener('click', handleModalClick)
  elements.manualPauseForm.addEventListener('submit', submitManualPause)

  // Manuel sayfa form (anlık durdurma)
  elements.manualPauseFormPage?.addEventListener('submit', submitManualPausePage)

  // Zamanlama formu
  elements.scheduleAddForm?.addEventListener('submit', submitScheduleForm)

  // Gün seçici butonları
  elements.dayBtns.forEach(btn => {
    btn.addEventListener('click', () => toggleDay(parseInt(btn.dataset.day)))
  })

  // Gün preset butonları
  elements.presetBtns.forEach(btn => {
    btn.addEventListener('click', () => applyDayPreset(btn.dataset.preset))
  })

  // ESC tuşu ile kapat
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeManualPauseModal()
    }
  })
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
  startPolling()

  // Tray event dinleyicisi
  await initTrayListener()
}

init()