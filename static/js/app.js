// Güncel saat ve tarih güncelleme fonksiyonu
function updateCurrentTime() {
    const now = new Date();
    const timeElement = document.getElementById('currentTime');
    const dateElement = document.getElementById('currentDate');
    
    // Saat formatı: HH:mm:ss
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    timeElement.textContent = `${hours}:${minutes}:${seconds}`;
    
    // Tarih formatı: DD Ay YYYY Gün
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    
    const day = now.getDate();
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    const weekDay = days[now.getDay()];
    
    dateElement.textContent = `${day} ${month} ${year} ${weekDay}`;
}

// Her saniye güncelle
setInterval(updateCurrentTime, 1000);
updateCurrentTime(); // İlk yükleme

// Sayfa bölümlerini yönetme ve menü işlevselliği
document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.nav-item');
    const sections = {
        'home': document.querySelector('.header'),
        'prayer-times': document.querySelector('.prayer-times'),
        'city-selection': document.querySelector('.city-selector'),
        'music-player': document.querySelector('.music-player'),
        'settings': document.querySelector('.alarm-control-card')
    };
    
    // Tüm section'lara section-highlight class'ı ekle
    Object.values(sections).forEach(section => {
        if (section) {
            section.classList.add('section-highlight');
        }
    });

    // İlk section'ı aktif yap
    if (sections['home']) {
        sections['home'].classList.add('active');
    }
    
    // Mobil menü toggle işlevi
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    navToggle?.addEventListener('click', () => {
        navMenu?.classList.toggle('active');
    });

    // Sayfa dışı tıklamada menüyü kapat
    document.addEventListener('click', (e) => {
        if (navMenu?.classList.contains('active') && 
            !e.target.closest('.nav-menu') && 
            !e.target.closest('.nav-toggle')) {
            navMenu.classList.remove('active');
        }
    });
    
    // Menü link tıklama işlevleri
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Aktif link stilini güncelle
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
            // Mobil menüyü kapat
            navMenu?.classList.remove('active');
            
            // Hedef bölüme scroll yap
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = sections[targetId];
            
            if (targetElement) {
                // Aktif bölüm vurgusunu güncelle
                Object.values(sections).forEach(section => {
                    if (section) {
                        section.classList.remove('active');
                    }
                });
                targetElement.classList.add('active');

                // Smooth scroll
                const navHeight = document.querySelector('.main-nav')?.offsetHeight || 0;
                const targetPosition = targetElement.offsetTop - navHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Scroll olayında aktif bölümü güncelle
    function updateActiveSection() {
        const scrollPosition = window.scrollY + window.innerHeight / 3;
        
        let closestSection = null;
        let closestDistance = Infinity;
        
        Object.entries(sections).forEach(([id, section]) => {
            if (section) {
                const distance = Math.abs(section.offsetTop - scrollPosition);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestSection = { id, element: section };
                }
            }
        });
        
        if (closestSection) {
            // Aktif menü öğesini güncelle
            navLinks.forEach(link => {
                link.classList.toggle('active', 
                    link.getAttribute('href') === `#${closestSection.id}`);
            });
            
            // Aktif bölüm vurgusunu güncelle
            Object.values(sections).forEach(section => {
                if (section) {
                    section.classList.remove('active');
                }
            });
            closestSection.element.classList.add('active');
        }
    }

    // Sayfa yüklendiğinde ve scroll olayında aktif bölümü güncelle
    updateActiveSection();
    
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        scrollTimeout = setTimeout(updateActiveSection, 100);
    });
});
