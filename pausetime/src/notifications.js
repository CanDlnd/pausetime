/* ============================================
   PauseTime - Bildirim Modülü (DEVRE DIŞI)
   Bildirimler şimdilik kapalı
   ============================================ */

// ============================================
// STUB FONKSİYONLAR (şimdilik hiçbir şey yapmaz)
// ============================================

/**
 * Bildirim sistemini başlat (stub)
 */
export async function initNotifications() {
    console.log('Notifications disabled')
}

/**
 * Pre-pause bildirimi kontrolü (stub)
 */
export function handlePrePause(prePause) {
    // Şimdilik devre dışı
}

/**
 * State değişiminde bildirim kontrolü (stub)
 */
export function handleStateChange(newState, oldState) {
    // Şimdilik devre dışı
}

/**
 * Bildirim ayarlarını al (stub)
 */
export function getNotificationSettings() {
    return { enabled: false, showOnResume: false }
}

/**
 * Bildirim ayarlarını güncelle (stub)
 */
export function updateNotificationSettings(newSettings) {
    // Şimdilik devre dışı
}

/**
 * Guard'ı sıfırla (stub)
 */
export function resetNotificationGuard() {
    // Şimdilik devre dışı
}
