# Ezan Vakti Uygulaması

Bu web uygulaması, Diyanet İşleri Başkanlığı'nın API'sini kullanarak Türkiye'deki şehirlerin ezan vakitlerini gösteren ve bu vakitlerde müzik kontrolü sağlayan bir sistemdir.

## Özellikler

- Diyanet İşleri Başkanlığı API'si üzerinden gerçek zamanlı ezan vakitleri
- Türkiye'deki tüm şehirler için ezan vakti desteği
- Ezan vakti geldiğinde müziği otomatik durdurma
- 10 dakika sonra müziği otomatik başlatma
- Responsive ve kullanıcı dostu arayüz
- Anlık saat ve tarih gösterimi
- Sitemap.xml desteği

## Teknolojiler

- Backend: Python Flask
- Frontend: HTML, CSS, JavaScript
- API: Diyanet İşleri Başkanlığı (aladhan.com)
- Sitemap.xml desteği

## Kurulum

1. Projeyi klonlayın:
```bash
git clone [proje-url]
cd ezan-vakti-uygulamasi
```

2. Gerekli Python paketlerini yükleyin:
```bash
pip install -r requirements.txt
```

3. Uygulamayı başlatın:
```bash
python app.py
```

4. Tarayıcınızda uygulamayı açın:
```
http://localhost:5000
```

## Kullanım

1. Ana sayfada varsayılan olarak İstanbul ezan vakitleri gösterilir
2. Şehir seçimi yaparak istediğiniz şehrin ezan vakitlerini görüntüleyebilirsiniz
3. "Çal" butonuna basarak müziği başlatabilirsiniz
4. Ezan vakti geldiğinde müzik otomatik olarak duracak ve 10 dakika sonra devam edecektir
5. "Durdur" butonu ile müziği manuel olarak kontrol edebilirsiniz

## Önemli Notlar

- Müzik dosyasını `static/music/` klasörü altına yerleştirmeniz gerekmektedir
- İnternet bağlantısı olmadığında veya API'ye erişilemediğinde varsayılan ezan vakitleri kullanılır
- Uygulama, tarayıcı sekmesi açık olduğu sürece çalışır

## Katkıda Bulunma

1. Bu projeyi fork edin
2. Yeni bir branch oluşturun (`git checkout -b feature/yeniOzellik`)
3. Değişikliklerinizi commit edin (`git commit -am 'Yeni özellik eklendi'`)
4. Branch'inizi push edin (`git push origin feature/yeniOzellik`)
5. Pull Request oluşturun
# pausetime
# pausetime
