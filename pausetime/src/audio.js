/* ============================================
   PauseTime - Audio Kontrolü
   Tek aktif kaynak kuralı ile yönetim
   ============================================ */

// Aktif kaynak türleri
const AudioSource = {
    NONE: 'none',
    LOCAL: 'local',
    YOUTUBE: 'youtube'
}

// Audio controller sınıfı
class AudioController {
    constructor() {
        this.audioElement = null
        this.youtubePlayer = null
        this.youtubeReady = false
        this.currentState = 'active'
        this.activeSource = AudioSource.NONE

        this.initElements()
        this.initEvents()
    }

    // DOM elementlerini al
    initElements() {
        this.audioElement = document.getElementById('local-audio')
        this.fileInput = document.getElementById('audio-file')
        this.youtubePlayer = document.getElementById('youtube-player')
    }

    // Event listener'ları bağla
    initEvents() {
        this.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e))
    }

    // Kaynak değiştir
    switchSource(newSource) {
        // Önceki kaynağı durdur
        if (this.activeSource === AudioSource.LOCAL) {
            this.audioElement?.pause()
        } else if (this.activeSource === AudioSource.YOUTUBE) {
            this.postYouTubeMessage('pauseVideo')
        }

        this.activeSource = newSource

        // State aktifse yeni kaynağı başlat
        if (this.currentState === 'active') {
            this.playActiveSource()
        }
    }

    // Aktif kaynağı oynat
    playActiveSource() {
        if (this.activeSource === AudioSource.LOCAL && this.audioElement?.src) {
            this.audioElement.play().catch(() => { })
        } else if (this.activeSource === AudioSource.YOUTUBE && this.youtubeReady) {
            this.postYouTubeMessage('playVideo')
        }
    }

    // Aktif kaynağı durdur
    pauseActiveSource() {
        if (this.activeSource === AudioSource.LOCAL) {
            this.audioElement?.pause()
        } else if (this.activeSource === AudioSource.YOUTUBE) {
            this.postYouTubeMessage('pauseVideo')
        }
    }

    // Ses dosyası seçimi
    handleFileSelect(e) {
        const file = e.target.files[0]
        if (!file) return

        const url = URL.createObjectURL(file)
        this.audioElement.src = url
        this.audioElement.load()
        this.switchSource(AudioSource.LOCAL)
    }

    // YouTube video ID çıkar
    extractYouTubeId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
            /^([a-zA-Z0-9_-]{11})$/
        ]
        for (const pattern of patterns) {
            const match = url.match(pattern)
            if (match) return match[1]
        }
        return null
    }

    // YouTube yükle (programatik kullanım için)
    loadYouTube(url) {
        if (!url) return false

        const videoId = this.extractYouTubeId(url)
        if (!videoId) return false

        this.youtubePlayer.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=${this.currentState === 'active' ? 1 : 0}`
        this.youtubePlayer.allow = 'autoplay; encrypted-media'
        this.youtubeReady = true
        this.switchSource(AudioSource.YOUTUBE)
        return true
    }

    // YouTube postMessage
    postYouTubeMessage(action) {
        if (!this.youtubePlayer || !this.youtubeReady) return

        try {
            this.youtubePlayer.contentWindow.postMessage(
                JSON.stringify({ event: 'command', func: action, args: [] }),
                '*'
            )
        } catch (e) { }
    }

    // State değişikliğinde çağrılır
    onStateChange(newState) {
        this.currentState = newState

        if (newState === 'active') {
            this.playActiveSource()
        } else {
            this.pauseActiveSource()
        }
    }
}

// Singleton
let audioController = null

export function initAudio() {
    audioController = new AudioController()
    return audioController
}

export function onAudioStateChange(state) {
    audioController?.onStateChange(state)
}
