// Global değişkenler
let player;
let audioPlayer;
let playButton;
let muteButton;
let loopButton;
let volumeSlider;
let playerOverlay;
let audioOverlay;
let resumeButton;
let resumeAudioButton;
let isEzanPlaying = false;
let currentPrayer = null;
let prayerTimes = {};
let currentCity = 'ISTANBUL';
let lastCheckedTime = '';
let lastMusicState = {
    wasPlaying: false,
    videoId: null,
    position: 0,
    audioSrc: null,
    audioTime: 0
};
let isLooping = false;
let waitingForEzanEnd = false;
let statusMessageTimeout = null;
let currentPlayerState = null;
let currentMusicSource = 'youtube';
let lastVolume = 1;

// Alarm sistemi için global değişkenler
let alarms = [];
let alarmCheckInterval;
let activeAlarm = null;
let isAlarmActive = false;

// LocalStorage için alarm anahtarı
const ALARMS_STORAGE_KEY = 'musicAlarms';

// Ezan durumu için localStorage anahtarları
const EZAN_START_TIME_KEY = 'ezanStartTime';
const EZAN_PRAYER_KEY = 'ezanPrayer';
const EZAN_DURATION = 270000; // 4.5 dakika (milisaniye cinsinden)

// Progress bar ve zaman göstergeleri için değişkenler
let youtubeProgress;
let youtubeCurrentTime;
let youtubeDuration;
let localProgress;
let localCurrentTime;
let localDuration;
let progressUpdateInterval;
let volumeIndicator;
let volumeTimeout;

// Keyboard shortcuts
const KEYBOARD_SHORTCUTS = {
    ' ': 'Oynat/Duraklat',
    'm': 'Sessiz',
    'l': 'Döngü',
    'ArrowUp': 'Sesi Artır',
    'ArrowDown': 'Sesi Azalt',
    'ArrowLeft': '10sn Geri',
    'ArrowRight': '10sn İleri'
};

// YouTube API'sini yükle
function loadYouTubeAPI() {
    return new Promise((resolve, reject) => {
        if (window.YT && window.YT.Player) {
            resolve(window.YT);
            return;
        }

        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = function() {
            resolve(window.YT);
        };

        // 10 saniye sonra hala yüklenmemişse hata ver
        setTimeout(() => {
            reject(new Error('YouTube API yüklenemedi'));
        }, 10000);
    });
}

// YouTube API'si hazır olduğunda çağrılır
async function initializeYouTubePlayer() {
    try {
        await loadYouTubeAPI();
        console.log("YouTube API Yüklendi!");
        
        player = new YT.Player('youtube-player', {
            height: '360',
            width: '640',
            videoId: '',
            playerVars: {
                'playsinline': 1,
                'controls': 1,
                'disablekb': 0,
                'enablejsapi': 1,
                'fs': 1,
                'modestbranding': 1,
                'rel': 0,
                'showinfo': 1,
                'iv_load_policy': 3,
                'color': 'white',
                'theme': 'dark',
                'autohide': 0,
                'cc_load_policy': 1,
                'origin': window.location.origin
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onError': onPlayerError,
                'onPlaybackQualityChange': onPlaybackQualityChange
            }
        });
    } catch (error) {
        console.error('YouTube player başlatılamadı:', error);
        // YouTube player başlatılamazsa local audio'ya geç
        switchMusicSource('local');
    }
}

// Oyuncu hazır olduğunda çağrılır
function onPlayerReady(event) {
    console.log("YouTube Player Hazır!");
}

// Oyuncu durumu değiştiğinde çağrılır
function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        updatePlayButtonState(1);
        if (audioPlayer) {
            audioPlayer.pause();
        }
        startProgressUpdates();
    } else if (event.data === YT.PlayerState.PAUSED) {
        updatePlayButtonState(0);
    } else if (event.data === YT.PlayerState.ENDED) {
        if (isLooping) {
            player.seekTo(0);
            player.playVideo();
        } else {
            updatePlayButtonState(0);
        }
    }
    // Disable play button during ezan
    if (isEzanPlaying) {
        playButton.disabled = true;
    } else {
        playButton.disabled = false;
    }
}

// Oyuncu hatası oluştuğunda çağrılır
function onPlayerError(event) {
    console.error("YouTube Player Hatası:", event.data);
}

// Video kalitesi değiştiğinde çağrılır
function onPlaybackQualityChange(event) {
    const quality = event.data;
    console.log('Video kalitesi değişti:', quality);
    updateStatusMessage(`Video Kalitesi: ${getQualityLabel(quality)}`, true);
}

// Video kalitesi etiketlerini döndür
function getQualityLabel(quality) {
    const qualities = {
        'small': '240p',
        'medium': '360p',
        'large': '480p',
        'hd720': '720p HD',
        'hd1080': '1080p Full HD',
        'highres': '1440p+ Ultra HD'
    };
    return qualities[quality] || quality;
}

// Progress bar ve zaman göstergelerini güncelle
// Zamanı saat:dakika:saniye formatına dönüştüren fonksiyon
function formatTimeHMS(seconds) {
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    // Saat varsa "hh:mm:ss" yoksa "mm:ss" formatında döndür
    return h > 0
        ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Progress bar ve zaman göstergelerini güncelle
function updateProgress() {
    try {
        if (currentMusicSource === 'youtube' && player && player.getPlayerState) {
            const state = player.getPlayerState();
            if (state !== YT.PlayerState.UNSTARTED) {
                const currentTime = player.getCurrentTime() || 0;
                const duration = player.getDuration() || 0;
                if (duration > 0) {
                    const percentage = (currentTime / duration) * 100;

                    const progressFill = document.querySelector('.progress-fill');
                    if (progressFill) {
                        progressFill.style.width = `${percentage}%`;
                    }

                    const currentTimeDisplay = document.querySelector('.current-time');
                    const durationDisplay = document.querySelector('.duration');

                    if (currentTimeDisplay) {
                        currentTimeDisplay.textContent = formatTimeHMS(currentTime);
                    }
                    if (durationDisplay) {
                        durationDisplay.textContent = formatTimeHMS(duration);
                    }
                }
            }
        } else if (currentMusicSource === 'local' && audioPlayer) {
            const currentTime = audioPlayer.currentTime;
            const duration = audioPlayer.duration;
            if (duration && !isNaN(duration)) {
                const percentage = (currentTime / duration) * 100;

                const progressFill = document.querySelector('.progress-fill');
                if (progressFill) {
                    progressFill.style.width = `${percentage}%`;
                }

                const currentTimeDisplay = document.querySelector('.current-time');
                const durationDisplay = document.querySelector('.duration');

                if (currentTimeDisplay) {
                    currentTimeDisplay.textContent = formatTimeHMS(currentTime);
                }
                if (durationDisplay) {
                    durationDisplay.textContent = formatTimeHMS(duration);
                }
            }
        }
    } catch (error) {
        console.error('Progress güncellenirken hata:', error);
    }
}

// Progress bar tıklama olayını işle
function handleProgressClick(e) {
    const progressBar = e.currentTarget;
    if (!progressBar) return;

    const rect = progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;

    if (currentMusicSource === 'youtube' && player && player.getPlayerState) {
        const duration = player.getDuration();
        if (duration) {
            const newTime = duration * percentage;
            player.seekTo(newTime, true);
            updateProgress();
        }
    } else if (currentMusicSource === 'local' && audioPlayer) {
        const duration = audioPlayer.duration;
        if (duration && !isNaN(duration)) {
            audioPlayer.currentTime = duration * percentage;
            updateProgress();
        }
    }
}

// Progress güncellemelerini başlat
function startProgressUpdates() {
    if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval);
    }
    progressUpdateInterval = setInterval(updateProgress, 500); // Daha sık güncelleme için 500ms
}

// Progress güncellemelerini durdur
function stopProgressUpdates() {
    if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval);
        progressUpdateInterval = null;
    }
}

// Müzik kontrollerini ayarla
function setupMusicControls() {
    // Audio elementlerini seç
    audioPlayer = document.getElementById('local-audio');
    const audioFileInput = document.getElementById('audioFile');
    const selectedFileName = document.querySelector('.selected-file');

    if (!audioPlayer || !audioFileInput) {
        console.error('Audio elementleri bulunamadı');
        return;
    }

    // Progress bar için event listener'ları ekle
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
        progressBar.addEventListener('click', handleProgressClick);
    }

    // Audio player olaylarını dinle
    audioPlayer.addEventListener('loadedmetadata', () => {
        updateProgress();
        startProgressUpdates();
    });

    audioPlayer.addEventListener('play', () => {
        startProgressUpdates();
        updatePlayButtonState(1);
    });

    audioPlayer.addEventListener('pause', () => {
        updatePlayButtonState(0);
    });

    audioPlayer.addEventListener('ended', () => {
        if (isLooping) {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
        } else {
            updatePlayButtonState(0);
            stopProgressUpdates();
        }
    });

    // Yerel müzik dosyası seçimi
    audioFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (selectedFileName) {
                selectedFileName.textContent = file.name;
            }
            const url = URL.createObjectURL(file);
            audioPlayer.src = url;
            updateStatusMessage('Müzik dosyası yüklendi: ' + file.name, true);
            audioPlayer.play()
                .then(() => {
                    updatePlayButtonState(1);
                    startProgressUpdates();
                })
                .catch(error => {
                    console.error('Müzik başlatılırken hata:', error);
                    updateStatusMessage('Müzik başlatılırken bir hata oluştu', true);
                });
        }
    });
}

// Video URL'sinden ID çıkarma
function extractVideoID(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : false;
}

// Yeni video yükleme
function loadVideo() {
    // Ezan veya saygı duruşu süresi kontrolü
    const storedStartTime = localStorage.getItem(EZAN_START_TIME_KEY);
    if (storedStartTime) {
        const startTime = parseInt(storedStartTime);
        const currentTime = new Date().getTime();
        const elapsedTime = currentTime - startTime;
        
        if (elapsedTime < EZAN_DURATION) {
            updateStatusMessage('Ezan okunurken oynatıcı başlatılamaz!', true);
            return;
        }
    }

    const urlInput = document.getElementById('video-url');
    const url = urlInput.value;
    const videoId = extractVideoID(url);

    if (videoId) {
        updateStatusMessage('Video yükleniyor...', true);
        player.loadVideoById({
            videoId: videoId,
            startSeconds: 0,
            suggestedQuality: 'default'
        });
        urlInput.value = '';
    } else {
        updateStatusMessage('Geçersiz YouTube URL\'si!', true);
    }
}

// Müzik kaynağını değiştir
async function switchMusicSource(source) {
    const storedStartTime = localStorage.getItem(EZAN_START_TIME_KEY);
    if (storedStartTime) {
        const startTime = parseInt(storedStartTime);
        const currentTime = new Date().getTime();
        const elapsedTime = currentTime - startTime;
        
        if (elapsedTime < EZAN_DURATION) {
            updateStatusMessage('Ezan okunurken veya sonrasındaki saygı duruşu süresince kaynak değiştirilemez!', true);
            return;
        }
    }

    // Mevcut müziği durdur
    if (currentMusicSource === 'youtube' && player) {
        player.stopVideo();
    } else if (currentMusicSource === 'local' && audioPlayer) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }

    const youtubeContainer = document.getElementById('youtube-container');
    const localContainer = document.getElementById('local-container');
    const sourceButtons = document.querySelectorAll('.source-btn');

    // Aktif butonları güncelle
    sourceButtons.forEach(btn => {
        if (btn.getAttribute('data-source') === source) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Mevcut kaynağı belirle
    const currentContainer = source === 'youtube' ? youtubeContainer : localContainer;
    const otherContainer = source === 'youtube' ? localContainer : youtubeContainer;

    // Animasyonlu geçiş
    otherContainer.style.animation = 'slideOut 0.5s ease-out forwards';

    await new Promise(resolve => setTimeout(resolve, 500));

    otherContainer.classList.add('hidden');
    otherContainer.style.animation = '';

    currentContainer.classList.remove('hidden');
    currentContainer.style.animation = 'slideIn 0.5s ease-out forwards';

    await new Promise(resolve => setTimeout(resolve, 500));

    currentContainer.style.animation = '';

    currentMusicSource = source;
    updateStatusMessage(`${source === 'youtube' ? 'YouTube' : 'Yerel müzik'} kaynağına geçildi`, true);
}

// Oynat/Duraklat
function togglePlay() {
    const storedStartTime = localStorage.getItem(EZAN_START_TIME_KEY);
    if (storedStartTime) {
        const startTime = parseInt(storedStartTime);
        const currentTime = new Date().getTime();
        const elapsedTime = currentTime - startTime;
        
        if (elapsedTime < EZAN_DURATION) {
            updateStatusMessage('Ezan okunurken veya sonrasındaki saygı duruşu süresince müzik çalınamaz!', true);
            return;
        }
    }

    if (currentMusicSource === 'youtube') {
        const state = player.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            player.pauseVideo();
        } else {
            player.playVideo();
        }
    } else {
        if (audioPlayer.paused) {
            if (audioPlayer.src) {
                audioPlayer.play();
            } else {
                updateStatusMessage('Lütfen önce bir müzik dosyası seçin', true);
            }
        } else {
            audioPlayer.pause();
        }
    }
}

// Ses aç/kapat
function toggleMute() {
    if (!volumeSlider) return;

    if (currentMusicSource === 'youtube' && player) {
        if (player.isMuted()) {
            player.unMute();
            const volume = player.getVolume();
            muteButton.innerHTML = '<i class="fas fa-volume-up"></i>';
            volumeSlider.value = volume;
            showVolumeIndicator(volume);
        } else {
            player.mute();
            muteButton.innerHTML = '<i class="fas fa-volume-mute"></i>';
            volumeSlider.value = 0;
            showVolumeIndicator(0);
        }
    } else if (audioPlayer) {
        if (audioPlayer.volume === 0) {
            audioPlayer.volume = lastVolume || 1;
            muteButton.innerHTML = '<i class="fas fa-volume-up"></i>';
            volumeSlider.value = audioPlayer.volume * 100;
            showVolumeIndicator(audioPlayer.volume * 100);
        } else {
            lastVolume = audioPlayer.volume;
            audioPlayer.volume = 0;
            muteButton.innerHTML = '<i class="fas fa-volume-mute"></i>';
            volumeSlider.value = 0;
            showVolumeIndicator(0);
        }
    }
}

// Ses seviyesini göstermek için fonksiyon
function showVolumeIndicator(volume) {
    const volumeIndicator = document.getElementById('volume-indicator');

    if (!volumeIndicator) return;

    volumeIndicator.textContent = `Ses: ${volume}%`;
    volumeIndicator.style.opacity = 1;

    clearTimeout(showVolumeIndicator.timeout);
    showVolumeIndicator.timeout = setTimeout(() => {
        volumeIndicator.style.opacity = 0;
    }, 1500);
}

// Sonsuz döngü durumunu değiştir
function toggleLoop() {
    if (isEzanPlaying || waitingForEzanEnd) {
        updateStatusMessage('Ezan sırasında döngü durumu değiştirilemez', true);
        return;
    }

    isLooping = !isLooping;
    updateLoopButtonState();

    if (isLooping) {
        updateStatusMessage('Sonsuz döngü açıldı', true);
        if (currentMusicSource === 'youtube' && player.getPlayerState() === YT.PlayerState.ENDED) {
            player.seekTo(0);
            player.playVideo();
        } else if (currentMusicSource === 'local' && audioPlayer.ended) {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
        }
    } else {
        updateStatusMessage('Sonsuz döngü kapatıldı', true);
    }
}

// Sonsuz döngü butonunun görünümünü güncelle
function updateLoopButtonState() {
    if (loopButton) {
        if (isLooping) {
            loopButton.classList.add('active');
            loopButton.innerHTML = '<i class="fas fa-sync fa-spin"></i>';
        } else {
            loopButton.classList.remove('active');
            loopButton.innerHTML = '<i class="fas fa-sync"></i>';
        }
    }
}

// Ezan başlat
function startEzan(prayer) {
    if (!isEzanPlaying) {
        isEzanPlaying = true;
        currentPrayer = prayer;

        // Bildirim göster
        showPrayerAlert(prayer);

        // Ezan başlangıç zamanını kaydet
        saveEzanStatus(prayer);

        // Mevcut müzik durumunu kaydet
        if (currentMusicSource === 'youtube' && player) {
            lastMusicState.wasPlaying = player.getPlayerState() === YT.PlayerState.PLAYING;
            lastMusicState.videoId = player.getVideoData().video_id;
            lastMusicState.position = player.getCurrentTime();
            player.pauseVideo();
        } else if (currentMusicSource === 'local' && audioPlayer) {
            lastMusicState.wasPlaying = !audioPlayer.paused;
            lastMusicState.audioSrc = audioPlayer.src;
            lastMusicState.audioTime = audioPlayer.currentTime;
            audioPlayer.pause();
        }

        // Overlay'i göster
        togglePlayerOverlay(true);
        toggleAudioOverlay(true);
        updateOverlayMessage(`${getPrayerName(prayer)} Ezanı Okunuyor...`);

        // Kontrolleri devre dışı bırak
        playButton.disabled = true;
        if (resumeButton) resumeButton.classList.add('hidden');
        if (resumeAudioButton) resumeAudioButton.classList.add('hidden');

        // Durum mesajını güncelle
        updateStatusMessage(`${getPrayerName(prayer)} Ezanı Okunuyor`, true);

        // Ezan süresince bekle ve sonra bitir
        setTimeout(() => {
            endEzan();
        }, EZAN_DURATION);
    }
}

// Ezan bitir
function endEzan() {
    if (isEzanPlaying) {
        isEzanPlaying = false;
        currentPrayer = null;

        // localStorage'dan ezan durumunu temizle
        clearEzanStatus();

        // Müziği otomatik olarak devam ettir
        if (lastMusicState.wasPlaying) {
            if (currentMusicSource === 'youtube' && player && lastMusicState.videoId) {
                player.seekTo(lastMusicState.position);
                player.playVideo();
                togglePlayerOverlay(false);
            } else if (currentMusicSource === 'local' && audioPlayer && lastMusicState.audioSrc) {
                audioPlayer.currentTime = lastMusicState.audioTime;
                audioPlayer.play();
                toggleAudioOverlay(false);
            }
            updateStatusMessage('Müzik otomatik olarak devam ediyor...', true);
        } else {
            // Müzik çalmıyorsa overlay'i kaldır
            togglePlayerOverlay(false);
            toggleAudioOverlay(false);
            updateStatusMessage('Ezan bitti.', true);
        }

        // "Devam Et" butonlarını gizle çünkü otomatik devam edecek
        if (resumeButton) {
            resumeButton.classList.add('hidden');
        }
        if (resumeAudioButton) {
            resumeAudioButton.classList.add('hidden');
        }
    }
}

// Overlay kontrolü
function togglePlayerOverlay(show) {
    if (playerOverlay) {
        playerOverlay.style.display = show ? 'flex' : 'none';
    }
}

function toggleAudioOverlay(show) {
    if (audioOverlay) {
        audioOverlay.style.display = show ? 'flex' : 'none';
    }
}

function updateOverlayMessage(message) {
    if (playerOverlay) {
        playerOverlay.querySelector('span').textContent = message;
    }
    if (audioOverlay) {
        audioOverlay.querySelector('span').textContent = message;
    }
}

// Ezan vakitlerini al
async function getPrayerTimes() {
    try {
        const response = await fetch(`/get_prayer_times?city=${currentCity}`);
        const data = await response.json();
        if (data.success) {
            prayerTimes = data.prayer_times;

            updatePrayerTimesDisplay();
            updateStatusMessage('Ezan vakitleri güncellendi.');
        } else {
            console.error('Ezan vakitleri alınamadı:', data.error);
            updateStatusMessage('Ezan vakitleri alınamadı.');
        }
    } catch (error) {
        console.error('Ezan vakitleri alınamadı:', error);
        updateStatusMessage('Ezan vakitleri alınamadı.');
    }
}

function togglePlay() {
    if (isEzanPlaying) return; // Prevent toggling play during ezan
    if (waitingForEzanEnd) {
        updateStatusMessage('Lütfen ezan bitiş süresinin dolmasını bekleyin...', true);
        return;
    }

    if (currentMusicSource === 'youtube') {
        const state = player.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            player.pauseVideo();
        } else {
            player.playVideo();
        }
    } else {
        if (audioPlayer.paused) {
            if (audioPlayer.src) {
                audioPlayer.play();
            } else {
                updateStatusMessage('Lütfen önce bir müzik dosyası seçin', true);
            }
        } else {
            audioPlayer.pause();
        }
    }
}

// Ezan vakitlerini kontrol et
function checkPrayerTimes() {
    if (!prayerTimes || isEzanPlaying) return;

    const now = new Date();
    const currentTime = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    // Son kontrol edilen saat ile aynıysa tekrar kontrol etme
    if (currentTime === lastCheckedTime) return;
    lastCheckedTime = currentTime;

    for (const [prayer, time] of Object.entries(prayerTimes)) {
        if (time === currentTime && !isEzanPlaying) {
            startEzan(prayer);
            break;
        }
    }
}

// Ezan vakti ismini al
function getPrayerName(prayer) {
    const prayerNames = {
        Fajr: 'Sabah',
        Dhuhr: 'Öğle',
        Asr: 'İkindi',
        Maghrib: 'Akşam',
        Isha: 'Yatsı'
    };
    return prayerNames[prayer] || prayer;
}

// Uyarı kontrolü
function showPrayerAlert(prayer) {
    const prayerAlert = document.getElementById('prayer-alert');
    const alertTitle = document.getElementById('alert-title');
    const alertMessage = document.getElementById('alert-message');
    const alertSound = document.getElementById('alert-sound');
    const closeAlert = document.getElementById('close-alert');

    if (!prayerAlert || !alertTitle || !alertMessage || !alertSound || !closeAlert) {
        console.error('Uyarı elementleri bulunamadı');
        return;
    }

    const prayerNames = {
        Fajr: 'Sabah',
        Dhuhr: 'Öğle',
        Asr: 'İkindi',
        Maghrib: 'Akşam',
        Isha: 'Yatsı'
    };

    const prayerName = prayerNames[prayer] || prayer;

    // Uyarıyı göster
    alertTitle.textContent = 'Ezan Vakti';
    alertMessage.textContent = `${prayerName} ezanı okunuyor...`;
    prayerAlert.classList.add('show');

    // Kapatma düğmesi kontrolü
    closeAlert.onclick = function () {
        closePrayerAlert();
    };

    // Ses çal
    try {
        alertSound.currentTime = 0;
        alertSound.play().catch(error => {
            console.error('Uyarı sesi çalınamadı:', error);
        });
    } catch (error) {
        console.error('Uyarı sesi çalınamadı:', error);
    }

    // 10 saniye sonra otomatik kapat
    setTimeout(() => {
        closePrayerAlert();
    }, 10000);
}

// Uyarıyı kapat
function closePrayerAlert() {
    const prayerAlert = document.getElementById('prayer-alert');
    const alertSound = document.getElementById('alert-sound');

    if (prayerAlert) {
        prayerAlert.classList.remove('show');
    }

    if (alertSound) {
        alertSound.pause();
        alertSound.currentTime = 0;
    }
}

// Geri sayım
function startCountdown(minutes) {
    const countdownTimer = document.getElementById('countdown-timer');
    const countdownText = document.getElementById('countdown-text');
    const statusMessage = document.getElementById('status-message');

    if (!countdownTimer || !countdownText || !statusMessage) {
        console.error('Sayaç elementleri bulunamadı');
        return;
    }

    countdownTimer.classList.add('show');
    let totalSeconds = minutes * 60;

    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    countdownInterval = setInterval(() => {
        const minutesLeft = Math.floor(totalSeconds / 60);
        const secondsLeft = totalSeconds % 60;
        const timeText = `${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}`;

        countdownText.textContent = `Müzik otomatik başlayacak: ${timeText}`;
        statusMessage.textContent = `Müziğin otomatik başlamasına ${timeText} kaldı`;

        if (totalSeconds <= 0) {
            clearInterval(countdownInterval);
            countdownTimer.classList.remove('show');
            isEzanPlaying = false;
        } else {
            totalSeconds--;
        }
    }, 1000);
}

// Ezan vakitlerini ekranda göster ve geri sayımı başlat
function updatePrayerTimesDisplay() {
    if (!prayerTimes) {
        console.error('Ezan vakitleri bulunamadı');
        return;
    }

    const prayerMapping = {
        'Fajr': { id: 'fajr-time', name: 'Sabah' },
        'Dhuhr': { id: 'dhuhr-time', name: 'Öğle' },
        'Asr': { id: 'asr-time', name: 'İkindi' },
        'Maghrib': { id: 'maghrib-time', name: 'Akşam' },
        'Isha': { id: 'isha-time', name: 'Yatsı' }
    };

    for (const [prayer, time] of Object.entries(prayerTimes)) {
        const prayerInfo = prayerMapping[prayer];
        if (!prayerInfo) continue;

        const timeElement = document.getElementById(prayerInfo.id);
        const prayerItem = document.querySelector(`[data-prayer="${prayerInfo.id.split('-')[0]}"]`);

        if (timeElement) {
            timeElement.textContent = time;
        }

        if (prayerItem) {
            const countdownElement = prayerItem.querySelector('.countdown');
            if (countdownElement) {
                updateCountdown(prayer, time, countdownElement);
            }
        }
    }
}

// Geri sayım hesaplama ve güncelleme
function updateCountdown(prayer, prayerTime, element) {
    const [hours, minutes] = prayerTime.split(':').map(Number);
    const now = new Date();
    const prayerDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);

    if (prayerDate < now) {
        prayerDate.setDate(prayerDate.getDate() + 1);
    }

    const diff = prayerDate - now;
    const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
    const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hoursLeft === 0 && minutesLeft < 30) {
        element.parentElement.classList.add('upcoming');
    } else {
        element.parentElement.classList.remove('upcoming');
    }

    element.textContent = `${hoursLeft} saat ${minutesLeft} dakika kaldı`;
}

// Geri sayımı her dakika güncelle
function updateAllCountdowns() {
    if (Object.keys(prayerTimes).length > 0) {
        updatePrayerTimesDisplay();
        updateStatusMessage(); // Status message'ı da güncelle
    }
    setTimeout(updateAllCountdowns, 60000);
}

// Durum mesajını güncelle
function updateStatusMessage(message, type = 'info', temporary = false) {
    const statusElement = document.getElementById('status-message');
    if (statusElement) {
        // Tüm mevcut sınıfları temizle
        statusElement.className = 'status-message';
        
        // Yeni sınıfları ekle
        statusElement.classList.add(type, 'show');

        // İkon ve mesaj içeriğini ayarla
        let icon = '';
        switch (type) {
            case 'success':
                icon = '<i class="fas fa-check-circle"></i>';
                break;
            case 'error':
                icon = '<i class="fas fa-exclamation-circle"></i>';
                break;
            case 'warning':
                icon = '<i class="fas fa-exclamation-triangle"></i>';
                break;
            case 'loading':
                icon = '<i class="fas fa-spinner fa-spin"></i>';
                break;
            default: // info
                icon = '<i class="fas fa-info-circle"></i>';
        }
        
        statusElement.innerHTML = `${icon} ${message}`;

        // Önceki zamanlayıcıyı temizle
        if (statusMessageTimeout) {
            clearTimeout(statusMessageTimeout);
        }

        // Eğer geçici mesajsa, 3 saniye sonra mevcut duruma göre güncelle
        if (temporary) {
            statusMessageTimeout = setTimeout(() => {
                statusElement.classList.add('fade-out');
                setTimeout(() => {
                    updateCurrentStatusMessage();
                }, 300);
            }, 3000);
        }
    }
}

function updateCurrentStatusMessage() {
    if (isEzanPlaying) {
        updateStatusMessage('Ezan okunuyor...', 'info');
        return;
    }

    if (waitingForEzanEnd) {
        updateStatusMessage('Saygı duruşu süresi...', 'warning');
        return;
    }

    if (!player) {
        updateStatusMessage('Video oynatıcı hazırlanıyor...', 'loading');
        return;
    }

    const state = player.getPlayerState();
    const loopStatus = isLooping ? ' (Sonsuz döngü açık)' : '';

    if (state === undefined) {
        updateStatusMessage('Video durumu alınamıyor.', 'error');
        return;
    }

    switch (state) {
        case YT.PlayerState.PLAYING:
            updateStatusMessage('Video oynatılıyor' + loopStatus, 'success');
            break;
        case YT.PlayerState.PAUSED:
            updateStatusMessage('Video duraklatıldı' + loopStatus, 'info');
            break;
        case YT.PlayerState.ENDED:
            updateStatusMessage('Video bitti' + loopStatus, 'info');
            break;
        case YT.PlayerState.BUFFERING:
            updateStatusMessage('Video yükleniyor...' + loopStatus, 'loading');
            break;
        case YT.PlayerState.CUED:
            updateStatusMessage('Video hazır' + loopStatus, 'success');
            break;
        default:
            updateStatusMessage('Video oynatıcı hazır', 'info');
    }
}

// Play/Pause butonunun durumunu güncelle
function updatePlayButtonState(playerState) {
    const playButton = document.getElementById('playButton');
    const playIcon = playButton.querySelector('i');

    if (playerState === YT.PlayerState.PLAYING) {
        playIcon.className = 'fas fa-pause';
    } else {
        playIcon.className = 'fas fa-play';
    }
}

// Tam ekran modunu aç/kapat
function toggleFullscreen() {
    const videoContainer = document.querySelector('.youtube-container');
    const fullscreenButton = document.getElementById('fullscreenButton');
    const icon = fullscreenButton.querySelector('i');

    if (!document.fullscreenElement && 
        !document.mozFullScreenElement && 
        !document.webkitFullscreenElement && 
        !document.msFullscreenElement) {
        // Tam ekran moduna geç
        if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen();
        } else if (videoContainer.mozRequestFullScreen) {
            videoContainer.mozRequestFullScreen();
        } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen();
        } else if (videoContainer.msRequestFullscreen) {
            videoContainer.msRequestFullscreen();
        }
        icon.classList.remove('fa-expand');
        icon.classList.add('fa-compress');
    } else {
        // Tam ekran modundan çık
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        icon.classList.remove('fa-compress');
        icon.classList.add('fa-expand');
    }
}

// Tam ekran değişikliğini dinle
document.addEventListener('fullscreenchange', updateFullscreenButtonIcon);
document.addEventListener('mozfullscreenchange', updateFullscreenButtonIcon);
document.addEventListener('webkitfullscreenchange', updateFullscreenButtonIcon);
document.addEventListener('MSFullscreenChange', updateFullscreenButtonIcon);

// Tam ekran butonunun ikonunu güncelle
function updateFullscreenButtonIcon() {
    const fullscreenButton = document.getElementById('fullscreenButton');
    const icon = fullscreenButton.querySelector('i');
    
    if (document.fullscreenElement || 
        document.mozFullScreenElement || 
        document.webkitFullscreenElement || 
        document.msFullscreenElement) {
        icon.classList.remove('fa-expand');
        icon.classList.add('fa-compress');
    } else {
        icon.classList.remove('fa-compress');
        icon.classList.add('fa-expand');
    }
}

// DOM yüklendikten sonra çalışacak kodlar
document.addEventListener('DOMContentLoaded', function () {
    // Global değişkenleri başlat
    playButton = document.getElementById('playButton');
    muteButton = document.getElementById('muteButton');
    loopButton = document.getElementById('loopButton');
    volumeSlider = document.getElementById('volume-slider');
    playerOverlay = document.getElementById('player-overlay');
    audioOverlay = document.getElementById('audio-overlay');
    resumeButton = document.getElementById('resumeButton');
    resumeAudioButton = document.getElementById('resumeAudioButton');
    audioPlayer = document.getElementById('local-audio');

    // Alarm kontrollerini başlat
    setupAlarmControls();
    loadAlarms();
    startAlarmCheck();

    // Overlay'leri başlangıçta gizle
    if (playerOverlay) playerOverlay.style.display = 'none';
    if (audioOverlay) audioOverlay.style.display = 'none';

    // YouTube API'sini yükle
    initializeYouTubePlayer().catch(error => {
        console.error('YouTube player yüklenirken hata:', error);
    });

    // Şehir seçimi değiştiğinde ezan vakitlerini güncelle
    const citySelect = document.getElementById('city-select');
    const updateCityButton = document.getElementById('updateCityButton');

    if (citySelect && updateCityButton) {
        updateCityButton.addEventListener('click', function () {
            currentCity = citySelect.value;
            document.getElementById('selectedCity').textContent = `Seçili Şehir: ${citySelect.options[citySelect.selectedIndex].text}`;
            getPrayerTimes();
        });
    }

    // Sayfa yüklendiğinde ezan vakitlerini al
    getPrayerTimes();

    // Her dakika ezan vakitlerini kontrol et
    setInterval(checkPrayerTimes, 1000);

    // Her dakika geri sayımları güncelle
    updateAllCountdowns();
    // Müzik kontrollerini ayarla
    setupMusicControls();

    // Kaynak seçimi butonlarını ayarla
    const sourceButtons = document.querySelectorAll('.source-btn');
    sourceButtons.forEach(button => {
        button.addEventListener('click', () => {
            const source = button.getAttribute('data-source');
            switchMusicSource(source);
        });
    });

    // Resume butonları için event listener'ları ekle
    if (resumeButton) {
        resumeButton.addEventListener('click', function() {
            if (currentMusicSource === 'youtube' && player && lastMusicState.videoId) {
                player.seekTo(lastMusicState.position);
                player.playVideo();
                resumeButton.classList.add('hidden');
                togglePlayerOverlay(false);
            }
        });
    }

    if (resumeAudioButton) {
        resumeAudioButton.addEventListener('click', function() {
            if (currentMusicSource === 'local' && audioPlayer && lastMusicState.audioSrc) {
                audioPlayer.currentTime = lastMusicState.audioTime;
                audioPlayer.play();
                resumeAudioButton.classList.add('hidden');
                toggleAudioOverlay(false);
            }
        });
    }

    // Sayfa yüklendiğinde ezan durumunu kontrol et
    checkEzanStatus();

    // Saat ve dakika seçicilerini hazırla
    initializeTimePickers();
});

document.addEventListener("DOMContentLoaded", function () {
    const volumeSlider = document.getElementById("volume-slider");
    const muteButton = document.getElementById("muteButton");

    if (!volumeSlider || !muteButton) return;

    // Ses seviyesini değiştirme fonksiyonu
    volumeSlider.addEventListener("input", function () {
        const volume = volumeSlider.value;

        if (currentMusicSource === "youtube" && player) {
            player.setVolume(volume);
            if (volume == 0) {
                player.mute();
                muteButton.innerHTML = '<i class="fas fa-volume-mute"></i>';
            } else {
                player.unMute();
                muteButton.innerHTML = '<i class="fas fa-volume-up"></i>';
            }
        } else if (audioPlayer) {
            audioPlayer.volume = volume / 100;
            if (volume == 0) {
                muteButton.innerHTML = '<i class="fas fa-volume-mute"></i>';
            } else {
                muteButton.innerHTML = '<i class="fas fa-volume-up"></i>';
            }
        }
        showVolumeIndicator(volume);
    });
});

// Alarm sistemi fonksiyonları
function setupAlarmControls() {
    const setAlarmButton = document.getElementById('setAlarm');
    const hourSelect = document.getElementById('hourSelect');
    const minuteSelect = document.getElementById('minuteSelect');
    const alarmAction = document.getElementById('alarmAction');

    // Alarm ekle
    setAlarmButton.addEventListener('click', () => {
        const hour = hourSelect.value;
        const minute = minuteSelect.value;
        const action = alarmAction.value;

        if (!hour || !minute || !action) {
            updateStatusMessage('Lütfen saat, dakika ve işlem seçin', 'warning', true);
            return;
        }

        const time = `${hour}:${minute}`;
        addAlarm(time, action);
        
        // Formu varsayılan değerlere sıfırla
        hourSelect.value = '00';
        minuteSelect.value = '00';
        alarmAction.value = '';
        
        updateStatusMessage(`Alarm eklendi: ${time} - ${action === 'start' ? 'Başlat' : 'Durdur'}`, 'success', true);
    });
}

function addAlarm(time, action) {
    const alarm = {
        id: Date.now(),
        time,
        action
    };

    alarms.push(alarm);
    saveAlarms();
    renderAlarms();
}

function deleteAlarm(id) {
    if (confirm('Bu alarmı silmek istediğinize emin misiniz?')) {
        alarms = alarms.filter(alarm => alarm.id !== id);
        saveAlarms();
        renderAlarms();
    }
}

function editAlarm(id) {
    const alarm = alarms.find(a => a.id === id);
    if (!alarm) return;
    
    const [hours, minutes] = alarm.time.split(':');
    
    // Form alanlarını doldur
    document.getElementById('hourSelect').value = hours;
    document.getElementById('minuteSelect').value = minutes;
    document.getElementById('alarmAction').value = alarm.action;
    
    // Düzenleme moduna geç
    const setAlarmButton = document.getElementById('setAlarm');
    setAlarmButton.textContent = 'Alarmı Güncelle';
    setAlarmButton.dataset.editMode = 'true';
    setAlarmButton.dataset.editId = id.toString();
}

function setAlarm() {
    const hourSelect = document.getElementById('hourSelect');
    const minuteSelect = document.getElementById('minuteSelect');
    const actionInput = document.getElementById('alarmAction');
    const setAlarmButton = document.getElementById('setAlarm');

    if (!hourSelect || !minuteSelect || !actionInput) {
        console.error('Alarm form elemanları bulunamadı');
        return;
    }

    if (!hourSelect.value || !minuteSelect.value || !actionInput.value) {
        alert('Lütfen saat, dakika ve işlem seçin!');
        return;
    }

    const time = `${hourSelect.value}:${minuteSelect.value}`;
    const editId = setAlarmButton.dataset.editId;
    
    // Aynı saatte herhangi bir alarm var mı kontrolü
    const existingAlarm = alarms.find(a => 
        a.time === time && 
        (!editId || a.id !== parseInt(editId))
    );
    
    if (existingAlarm) {
        alert('Bu saatte zaten bir alarm var! Lütfen farklı bir saat seçin.');
        return;
    }

    // Düzenleme modunda eski alarmı sil
    if (editId) {
        alarms = alarms.filter(a => a.id !== parseInt(editId));
    }

    const alarm = {
        id: editId ? parseInt(editId) : Date.now(),
        time: time,
        action: actionInput.value
    };

    alarms.push(alarm);
    saveAlarms();
    renderAlarms();

    // Formu sıfırla
    hourSelect.value = '00';
    minuteSelect.value = '00';
    actionInput.value = '';
    
    // Düzenleme modundan çık
    setAlarmButton.textContent = 'Alarm Ekle';
    delete setAlarmButton.dataset.editMode;
    delete setAlarmButton.dataset.editId;
}

function saveAlarms() {
    localStorage.setItem(ALARMS_STORAGE_KEY, JSON.stringify(alarms));
}

function loadAlarms() {
    const savedAlarms = localStorage.getItem(ALARMS_STORAGE_KEY);
    if (savedAlarms) {
        alarms = JSON.parse(savedAlarms);
        renderAlarms();
    }
}

function renderAlarms() {
    const activeAlarms = document.getElementById('activeAlarms');
    const alarmCount = document.getElementById('alarmCount');
    
    if (!activeAlarms) return;
    
    activeAlarms.innerHTML = '';
    
    if (alarms.length === 0) {
        activeAlarms.innerHTML = '<div class="no-alarms">Henüz alarm eklenmemiş</div>';
        alarmCount.textContent = '0';
        return;
    }
    
    alarmCount.textContent = alarms.length.toString();
    
    alarms.forEach(alarm => {
        const alarmItem = document.createElement('div');
        alarmItem.className = 'alarm-item';
        
        const actionText = alarm.action === 'start' ? 'Başlatılacak' : 'Durdurulacak';
        const actionIcon = alarm.action === 'start' ? 'fa-play' : 'fa-stop';
        
        alarmItem.innerHTML = `
            <div class="alarm-info">
                <i class="fas ${actionIcon}"></i>
                <div class="alarm-details">
                    <div class="alarm-time">${alarm.time}</div>
                    <div class="alarm-action-text">${actionText}</div>
                </div>
            </div>
            <button class="alarm-delete" onclick="deleteAlarm(${alarm.id})">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        activeAlarms.appendChild(alarmItem);
    });
}

function checkAlarms() {
    const now = new Date();
    const currentHours = now.getHours().toString().padStart(2, '0');
    const currentMinutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${currentHours}:${currentMinutes}`;

    // Aktif alarmları kontrol et
    alarms.forEach(alarm => {
        if (alarm.time === currentTime && !isAlarmActive) {
            handleAlarmTrigger(alarm);
        }
    });
}

function handleAlarmTrigger(alarm) {
    isAlarmActive = true;
    activeAlarm = alarm;

    // Alarm bildirimini göster
    const prayerAlert = document.getElementById('prayer-alert');
    if (prayerAlert) {
        const alertContent = prayerAlert.querySelector('.alert-content');
        if (alertContent) {
            alertContent.innerHTML = `
                <h3><i class="fas ${alarm.action === 'start' ? 'fa-play' : 'fa-stop'}"></i> Müzik Alarmı</h3>
                <p>Saat ${alarm.time} - Müzik ${alarm.action === 'start' ? 'başlatılıyor' : 'durduruluyor'}</p>
                <button onclick="closeAlarmAlert()" class="btn-primary">
                    <i class="fas fa-check"></i> Tamam
                </button>
            `;
            prayerAlert.classList.remove('hidden');

            // 10 saniye sonra otomatik kapat
            setTimeout(() => {
                closeAlarmAlert();
            }, 10000);
        }
    }

    if (alarm.action === 'stop') {
        // Mevcut durumu kaydet
        if (currentMusicSource === 'youtube' && player) {
            lastMusicState.wasPlaying = player.getPlayerState() === YT.PlayerState.PLAYING;
            lastMusicState.position = player.getCurrentTime();
            player.pauseVideo();
        } else if (currentMusicSource === 'local' && audioPlayer) {
            lastMusicState.wasPlaying = !audioPlayer.paused;
            lastMusicState.position = audioPlayer.currentTime;
            audioPlayer.pause();
        }

        // Kontrolleri devre dışı bırak ve overlay'i göster
        togglePlayerOverlay(true);
        toggleAudioOverlay(true);
        updateOverlayMessage('Alarm: Müzik duraklatıldı');

    } else if (alarm.action === 'start') {
        // Kontrolleri etkinleştir ve overlay'i gizle
        togglePlayerOverlay(false);
        toggleAudioOverlay(false);
        
        if (currentMusicSource === 'youtube' && player) {
            player.playVideo();
        } else if (currentMusicSource === 'local' && audioPlayer) {
            audioPlayer.play();
        }
    }

    // 5 saniye sonra alarmı sıfırla ve sil
    setTimeout(() => {
        isAlarmActive = false;
        activeAlarm = null;
        
        // Alarmı listeden sil
        alarms = alarms.filter(a => a.id !== alarm.id);
        saveAlarms();
        renderAlarms();
    }, 5000);
}

function closeAlarmAlert() {
    const prayerAlert = document.getElementById('prayer-alert');
    const alertSound = document.getElementById('alert-sound');

    if (prayerAlert) {
        prayerAlert.classList.add('hidden');
    }

    if (alertSound) {
        alertSound.pause();
        alertSound.currentTime = 0;
    }
}

function startAlarmCheck() {
    // Her saniye alarmları kontrol et
    alarmCheckInterval = setInterval(checkAlarms, 1000);
    // Sayfa yüklendiğinde hemen kontrol et
    checkAlarms();
}

// Klavye kısayollarını işle
function handleKeyboardShortcuts(event) {
    // Eğer bir input veya textarea elementi aktifse, kısayolları devre dışı bırak
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }

    // Ezan çalarken kısayolları devre dışı bırak
    if (isEzanPlaying) {
        return;
    }

    const key = event.key;
    const action = KEYBOARD_SHORTCUTS[key];

    if (action) {
        event.preventDefault(); // Varsayılan tarayıcı davranışını engelle

        switch (key) {
            case ' ': // Oynat/Duraklat
                togglePlay();
                updateStatusMessage('Oynat/Duraklat', true);
                break;

            case 'm': // Sessiz
                toggleMute();
                const isMuted = player.isMuted();
                updateStatusMessage(isMuted ? 'Ses Kapatıldı' : 'Ses Açıldı', true);
                break;

            case 'l': // Döngü
                toggleLoop();
                updateStatusMessage(isLooping ? 'Döngü Açık' : 'Döngü Kapalı', true);
                break;

            case 'ArrowUp': // Sesi Artır
                const currentVolume = player.getVolume();
                const newVolume = Math.min(currentVolume + 10, 100);
                player.setVolume(newVolume);
                volumeSlider.value = newVolume;
                showVolumeIndicator(newVolume);
                updateStatusMessage(`Ses: ${newVolume}%`, true);
                break;

            case 'ArrowDown': // Sesi Azalt
                const currentVol = player.getVolume();
                const newVol = Math.max(currentVol - 10, 0);
                player.setVolume(newVol);
                volumeSlider.value = newVol;
                showVolumeIndicator(newVol);
                updateStatusMessage(`Ses: ${newVol}%`, true);
                break;

            case 'ArrowLeft': // 10sn Geri
                const currentTime = player.getCurrentTime();
                player.seekTo(Math.max(currentTime - 10, 0), true);
                updateStatusMessage('10 Saniye Geri', true);
                break;

            case 'ArrowRight': // 10sn İleri
                const curTime = player.getCurrentTime();
                const duration = player.getDuration();
                player.seekTo(Math.min(curTime + 10, duration), true);
                updateStatusMessage('10 Saniye İleri', true);
                break;
        }
    }
}

// Klavye kısayollarını aktif et
document.addEventListener('keydown', handleKeyboardShortcuts);

// Ses göstergesi fonksiyonu
function showVolumeIndicator(volume) {
    const volumeIndicator = document.getElementById("volume-indicator");

    if (!volumeIndicator) return;

    volumeIndicator.textContent = `Ses: ${volume}%`;
    volumeIndicator.style.opacity = 1;

    clearTimeout(showVolumeIndicator.timeout);
    showVolumeIndicator.timeout = setTimeout(() => {
        volumeIndicator.style.opacity = 0;
    }, 1500);
}

// Sayfa yüklendiğinde ezan durumunu kontrol et
function checkEzanStatus() {
    const storedStartTime = localStorage.getItem(EZAN_START_TIME_KEY);
    const storedPrayer = localStorage.getItem(EZAN_PRAYER_KEY);
    
    if (storedStartTime && storedPrayer) {
        const startTime = parseInt(storedStartTime);
        const currentTime = new Date().getTime();
        const elapsedTime = currentTime - startTime;
        
        if (elapsedTime < EZAN_DURATION) {
            // Ezan süresi hala devam ediyor
            const remainingTime = EZAN_DURATION - elapsedTime;
            isEzanPlaying = true;
            currentPrayer = storedPrayer;
            
            // Müziği durdur ve overlay'i göster
            if (currentMusicSource === 'youtube' && player && typeof player.pauseVideo === 'function') {
                try {
                    player.pauseVideo();
                } catch (error) {
                    console.error('YouTube player durdurulamadı:', error);
                }
            } else if (currentMusicSource === 'local' && audioPlayer) {
                audioPlayer.pause();
            }
            
            togglePlayerOverlay(true);
            toggleAudioOverlay(true);
            updateOverlayMessage(`${getPrayerName(storedPrayer)} Ezanı Okunuyor...`);
            playButton.disabled = true;
            
            // Kalan süre sonunda ezanı bitir
            setTimeout(() => {
                endEzan();
            }, remainingTime);
            
            // Kalan süreyi dakika ve saniye olarak göster
            const remainingMinutes = Math.floor(remainingTime / 60000);
            const remainingSeconds = Math.ceil((remainingTime % 60000) / 1000);
            updateStatusMessage(
                `${getPrayerName(storedPrayer)} Ezanı devam ediyor. Kalan süre: ${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}`,
                true
            );
        } else {
            // Ezan süresi dolmuş, localStorage'ı temizle
            clearEzanStatus();
        }
    }
}

// Ezan durumunu localStorage'a kaydet
function saveEzanStatus(prayer) {
    localStorage.setItem(EZAN_START_TIME_KEY, new Date().getTime().toString());
    localStorage.setItem(EZAN_PRAYER_KEY, prayer);
}

// Ezan durumunu localStorage'dan temizle
function clearEzanStatus() {
    localStorage.removeItem(EZAN_START_TIME_KEY);
    localStorage.removeItem(EZAN_PRAYER_KEY);
}

// Haftalık namaz vakitlerini getir
async function getWeeklyPrayerTimes() {
    try {
        const response = await fetch(`/api/weekly-prayer-times?city=${currentCity}`);
        const data = await response.json();
        
        if (data.success) {
            return data.data;
        } else {
            console.error('Haftalık namaz vakitleri alınamadı:', data.error);
            return null;
        }
    } catch (error) {
        console.error('Haftalık namaz vakitleri alınırken hata oluştu:', error);
        return null;
    }
}

// Haftalık görünümü güncelle
async function updateWeeklyView() {
    const container = document.getElementById('weekly-prayer-container');
    if (!container) return;

    const weeklyTimes = await getWeeklyPrayerTimes();
    if (!weeklyTimes) {
        container.innerHTML = '<div class="error-message">Haftalık namaz vakitleri yüklenirken bir hata oluştu.</div>';
        return;
    }

    // Türkçe ay ve gün isimleri
    const turkishMonths = {
        'January': 'Ocak', 'February': 'Şubat', 'March': 'Mart', 'April': 'Nisan',
        'May': 'Mayıs', 'June': 'Haziran', 'July': 'Temmuz', 'August': 'Ağustos',
        'September': 'Eylül', 'October': 'Ekim', 'November': 'Kasım', 'December': 'Aralık'
    };
    
    const turkishDays = {
        'Monday': 'Pazartesi', 'Tuesday': 'Salı', 'Wednesday': 'Çarşamba',
        'Thursday': 'Perşembe', 'Friday': 'Cuma', 'Saturday': 'Cumartesi',
        'Sunday': 'Pazar'
    };

    // Bugünün tarihini Türkçe olarak al
    const now = new Date();
    const todayStr = `${now.getDate()} ${turkishMonths[now.toLocaleString('en-US', { month: 'long' })]} ${turkishDays[now.toLocaleString('en-US', { weekday: 'long' })]}`;

    let html = '';

    weeklyTimes.forEach(dayData => {
        const isToday = dayData.date === todayStr;
        html += `
            <div class="weekly-prayer-day ${isToday ? 'today' : ''}">
                <div class="day-header">
                    <i class="fas fa-calendar-day"></i>
                    <span>${dayData.date}</span>
                    ${isToday ? '<span class="today-badge">(Bugün)</span>' : ''}
                </div>
                <div class="prayer-times-grid">
                    <div class="weekly-prayer-time">
                        <i class="fas fa-sun"></i>
                        <span class="time-label">Sabah</span>
                        <span class="time-value">${dayData.times.Fajr}</span>
                    </div>
                    <div class="weekly-prayer-time">
                        <i class="fas fa-sun"></i>
                        <span class="time-label">Öğle</span>
                        <span class="time-value">${dayData.times.Dhuhr}</span>
                    </div>
                    <div class="weekly-prayer-time">
                        <i class="fas fa-sun"></i>
                        <span class="time-label">İkindi</span>
                        <span class="time-value">${dayData.times.Asr}</span>
                    </div>
                    <div class="weekly-prayer-time">
                        <i class="fas fa-moon"></i>
                        <span class="time-label">Akşam</span>
                        <span class="time-value">${dayData.times.Maghrib}</span>
                    </div>
                    <div class="weekly-prayer-time">
                        <i class="fas fa-moon"></i>
                        <span class="time-label">Yatsı</span>
                        <span class="time-value">${dayData.times.Isha}</span>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Görünüm değiştirme işlevini ekle
function setupViewToggle() {
    const viewButtons = document.querySelectorAll('.view-btn');
    const views = document.querySelectorAll('.prayer-view');
    
    viewButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetView = button.getAttribute('data-view');
            
            // Butonları güncelle
            viewButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Görünümleri güncelle
            views.forEach(view => {
                if (view.id === `${targetView}-view`) {
                    view.classList.add('active');
                    if (targetView === 'weekly') {
                        updateWeeklyView();
                    }
                } else {
                    view.classList.remove('active');
                }
            });
        });
    });
}

// Şehir değiştiğinde haftalık görünümü güncelle
document.addEventListener('DOMContentLoaded', function() {
    // ...
    
    // Görünüm değiştirme işlevini başlat
    setupViewToggle();
    
    // Şehir değiştiğinde her iki görünümü de güncelle
    document.getElementById('updateCityButton').addEventListener('click', async function() {
        const selectedCity = document.getElementById('city-select').value;
        if (selectedCity !== currentCity) {
            currentCity = selectedCity;
            document.getElementById('selectedCity').textContent = `Seçili Şehir: ${selectedCity}`;
            
            // Günlük ve haftalık görünümleri güncelle
            getPrayerTimes();
            if (document.getElementById('weekly-view').classList.contains('active')) {
                updateWeeklyView();
            }
            
            updateStatusMessage(`${selectedCity} için namaz vakitleri güncellendi`, true);
        }
    });
});

// Dijital saat ve tarih güncelleme
let clockInterval;

function updateClock() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    
    const clockElement = document.getElementById('digitalClock');
    if (clockElement) {
        clockElement.textContent = `${hours}:${minutes}:${seconds}`;
    }
    
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateElement.textContent = now.toLocaleDateString('tr-TR', options);
    }
}

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
    // Önceki interval'i temizle
    if (clockInterval) {
        clearInterval(clockInterval);
    }
    
    // Dijital saati başlat
    updateClock();
    clockInterval = setInterval(updateClock, 1000);

    // Diğer başlangıç işlemleri...
});

// Sayfa kapatıldığında interval'i temizle
window.addEventListener('beforeunload', function() {
    if (clockInterval) {
        clearInterval(clockInterval);
    }
});

// Saat ve dakika seçicilerini doldur
function initializeTimePickers() {
    const hourSelect = document.getElementById('hourSelect');
    const minuteSelect = document.getElementById('minuteSelect');

    // Saatleri ekle (00-23)
    for (let i = 0; i < 24; i++) {
        const option = document.createElement('option');
        option.value = i.toString().padStart(2, '0');
        option.textContent = i.toString().padStart(2, '0');
        hourSelect.appendChild(option);
    }

    // Dakikaları ekle (00-59)
    for (let i = 0; i < 60; i++) {
        const option = document.createElement('option');
        option.value = i.toString().padStart(2, '0');
        option.textContent = i.toString().padStart(2, '0');
        minuteSelect.appendChild(option);
    }

    // Varsayılan değerleri ayarla
    hourSelect.value = '00';
    minuteSelect.value = '00';
}

function setAlarm() {
    const hourSelect = document.getElementById('hourSelect');
    const minuteSelect = document.getElementById('minuteSelect');
    const actionInput = document.getElementById('alarmAction');

    if (!hourSelect || !minuteSelect || !actionInput) {
        console.error('Alarm form elemanları bulunamadı');
        return;
    }

    if (!hourSelect.value || !minuteSelect.value || !actionInput.value) {
        alert('Lütfen saat, dakika ve işlem seçin!');
        return;
    }

    const time = `${hourSelect.value}:${minuteSelect.value}`;
    const alarm = {
        id: Date.now(),
        time: time,
        action: actionInput.value
    };

    alarms.push(alarm);
    saveAlarms();
    renderAlarms();

    // Formu sıfırla
    hourSelect.value = '00';
    minuteSelect.value = '00';
    actionInput.value = '';
}
