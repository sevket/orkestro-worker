# Orkestro Worker Node Kurulum Rehberi

*Bunu [İngilizce](README.md) okuyun*

Bu rehber, arkaplanda çalışacak "başıboş" (headless) Orkestro worker (işçi) makinelerinin nasıl kurulacağını anlatır.
Worker makineleri, ana sunucudaki Orkestro Master'a WebSocket ve BullMQ üzerinden bağlanır ve Kanban board'daki taskları yakalayıp bağımsız olarak çözmeye başlar.

## 1. Ön Gereksinimler
- **Node.js**: v18 veya üstü
- **Git**
- **NPM**

### Gereksinimlerin Kontrolü ve Yüklenmesi
Worker yapılandırmasına geçmeden önce paketlerin doğru sürümde kurulu olup olmadığını kontrol edin:
```bash
node -v   # v18.0.0 veya daha yüksek bir sürüm çıktısı vermelidir
npm -v    # NPM sürümünüzü göstermelidir
git --version
```

Eğer bu paketler sisteminizde eksikse kurmanız gereklidir. Örneğin **Ubuntu/Debian** tabanlı bir sunucuda şu komutları kullanabilirsiniz:
```bash
sudo apt update
sudo apt install -y nodejs npm git
```

## 2. Agent (Ajan) CLI Araçlarının Kurulması
Worker'ın işlem yapabilmesi için çalıştırmasını istediğiniz Ajanların (Claude, Gemini, vb.) komut satırı eklentilerinin kurulu olması gerekir.
Worker başlatıldığında otomatik olarak mevcut araçları tarar ve Master'a kendi yeteneklerini bildirir.

### Yetkilendirme Seçenekleri (Authentication)

Ajanları kurup kullanmaya başlamadan önce iki farklı yöntemden birini seçerek yetkilendirme yapabilirsiniz.

**Seçenek A: Tarayıcı ile OAuth Girişi (Masaüstü/Arayüzlü Sunucular İçin Önerilir)**
Eğer worker makinenizde bir arayüz varsa veya terminalde verilen linkleri kendi tarayıcınızda açabiliyorsanız:
```bash
# Ajanları global olarak kurun
npm install -g @anthropic-ai/claude-cli @google/gemini-cli opencode

# Tarayıcı üzerinden interaktif giriş yapın
claude auth
gemini login
opencode login
```

**Seçenek B: API Anahtarları (Başıboş/Uzak Sunucular İçin Önerilir)**
Eğer worker'ınız arayüzsüz bir uzak sunucuysa, sağlayıcıların panellerinden direkt API key alıp tanımlamanız gerekir:
- **Anthropic (Claude)**: [console.anthropic.com](https://console.anthropic.com/) adresinden "Create Key" butonuna tıklayarak alın.
- **Google Gemini**: [Google AI Studio](https://aistudio.google.com/app/apikey) sayfasından "Create API Key" butonu ile oluşturun.
- **OpenAI**: [platform.openai.com](https://platform.openai.com/api-keys) ekranından yeni bir secret key yaratın.

```bash
# API Key'lerinizi Profil (örn: ~/.bashrc) dosyanıza ekleyin
export ANTHROPIC_API_KEY="sk-ant..."
export GEMINI_API_KEY="AIza..."
export OPENAI_API_KEY="sk-proj..."

# Ajanları global olarak kurun
npm install -g @anthropic-ai/claude-cli @google/gemini-cli opencode
```

## 3. Ortam Değişkenleri (.env) Ayarı
`orkestro-worker` reposunu Worker makinenize klonladıktan sonra dizin kökünde bulunan `.env.example` dosyasını `.env` olarak kopyalayın ve içerisindeki ayarları girin:
```bash
git clone https://github.com/sevket/orkestro-worker.git
cd orkestro-worker
cp .env.example .env
```
`.env` dosyanızın örnek içeriği:
```dotenv
# Opsiyonel: Makineye özel bir isim atayın (yoksa otomatik UUID atanır)
WORKER_ID=sunucu-kiralik-1

# ZORUNLU: Ana makinenizin (Master) Orkestro IP ve portunu yazın
MASTER_URL=ws://ANA_MAKINENIZIN_IP_ADRESI:8787

# ZORUNLU: Ana makinenizdeki Redis veritabanının adresi
REDIS_URL=redis://ANA_MAKINENIZIN_IP_ADRESI:6379

# Makine donanımınıza göre aynı anda çalışabilecek Ajan sınırı (Standart 4'tür)
WORKER_CAPACITY=4

# Tanımlı roller
WORKER_ROLES=["coder", "planner", "reviewer"]
```

## 4. Pratik Kurulum Dosyası 
Eğer manuel pm2 komutları ile uğraşmak istemiyorsanız, repodaki kurulum betiğini çalıştırabilirsiniz:
```bash
./worker-setup.sh
```

## 5. Arka Planda (Background) Kesintisiz Çalıştırma
Worker'ı sunucuda sürekli ve arka planda çalıştırmanın en sağlıklı yolu PM2 kullanmaktır.

```bash
# Eğer kurulu değilse pm2'yi kurun
npm install -g pm2

# Bağlı paketleri kurun
npm install

# Worker'ı Orkestro dizini içerisinde başlatın
pm2 start npm --name "orkestro-worker" -- run start

# Sunucu yeniden başladığında tekrar çalışması için
pm2 startup
pm2 save

# Logları takip etmek için
pm2 logs orkestro-worker
```

Worker başarıyla bağlanıp ayağa kalktığında Ana makinenize (Master) spesifik bir "Echo" logu bastırır. 
Ana makine konsolunda `Worker {ID} is alive and ready to process jobs!` yazısını görebilir ve eş zamanlı olarak arayüzde (FE) yer alan **Fleet** menüsünde bağlanan bu makineyi canlı olarak izleyebilirsiniz!
