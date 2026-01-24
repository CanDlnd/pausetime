/* ============================================
   PauseTime Dashboard - Ana JavaScript
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
  DISABLED: 'disabled'
}

// Durum metinleri
const StateText = {
  [AppState.ACTIVE]: 'Aktif',
  [AppState.PAUSING]: 'Duraklatılıyor',
  [AppState.DISABLED]: 'Devre Dışı'
}

// Türkçe ay isimleri
const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
]

// DOM elementleri
const elements = {
  app: document.getElementById('app'),
  prayerTime: document.getElementById('prayer-time'),
  prayerName: document.getElementById('prayer-name'),
  countdown: document.getElementById('countdown'),
  statusToggle: document.getElementById('status-toggle'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  progressDot: document.getElementById('progress-dot'),
  currentDate: document.getElementById('current-date')
}

// Son geçerli state (hata durumunda korunur)
let lastState = {
  time: '--:--',
  vakit: 'Yükleniyor',
  remaining: '---',
  state: 'ACTIVE'
}

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
    'DISABLED': AppState.DISABLED
  }
  return mapping[backendState] || AppState.ACTIVE
}

// Sistem sesini kontrol et (Tauri native)
async function controlSystemMute(state) {
  // DISABLED state'te hiçbir şey yapma
  if (state === 'DISABLED') return

  const shouldMute = state === 'PAUSING'

  // Aynı komut zaten gönderildiyse tekrar gönderme
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

// UI'yi backend state ile güncelle
function applyState(data) {
  // State class'ını güncelle
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

  // Sistem sesi kontrolü (PAUSING → mute, ACTIVE → unmute)
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
    // Hata durumunda UI'yi bozma, son state kalır
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

    // Toggle sonrası state'i yenile
    await fetchState()
  } catch (error) {
    console.error('Toggle error:', error)
  }
}

// Durum noktası tıklama
function handleDotClick() {
  const isCurrentlyDisabled = lastState.state === 'DISABLED'
  toggleSystem(isCurrentlyDisabled) // Disabled ise enable, değilse disable
}

// Event listener'ları bağla
function initEvents() {
  elements.statusToggle.addEventListener('click', handleDotClick)
}

// Polling başlat (5 saniyede bir)
function startPolling() {
  fetchState() // İlk fetch
  setInterval(fetchState, 5000) // 5 saniye
}

// Tray event dinleyicisi
async function initTrayListener() {
  await listen('tray-toggle', () => {
    // Tray'den toggle tıklandığında
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

