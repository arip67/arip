// Scan muka: deteksi wajah dari kamera, lalu isi status otomatis "Hadir".
const video = document.getElementById('video-scan');
const kanvas = document.getElementById('canvas-scan');
const placeholder = document.getElementById('scan-placeholder');
const btnKamera = document.getElementById('btn-kamera');
const btnDeteksi = document.getElementById('btn-deteksi');
const kotakPesan = document.getElementById('scan-pesan');
const pilihStatus = document.getElementById('status');

const ctx = kanvas.getContext('2d');

let stream = null;
let modelSiap = false;
let sedangDeteksi = false;
let opsiDeteksi = null;
let sudahScan = false;

function ubahPesan(teks, jenis) {
    kotakPesan.textContent = teks;
    kotakPesan.className = 'scan-pesan ' + jenis;
}

async function muatModel() {
    if (typeof faceapi === 'undefined') {
        ubahPesan('Pustaka face-api.js tidak ditemukan. Periksa folder vendor/.', 'error');
        return;
    }

    ubahPesan('Memuat model deteksi wajah...', 'idle');
    try {
        // tfjs harus memilih backend (webgl/cpu) sebelum model boleh dimuat.
        await faceapi.tf.ready();
        await faceapi.nets.tinyFaceDetector.loadFromUri('models');
        opsiDeteksi = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
        modelSiap = true;
        ubahPesan('Model siap. Tekan Buka Kamera untuk mulai scan.', 'idle');
    } catch (e) {
        console.error('Gagal memuat model deteksi wajah:', e);
        ubahPesan('Model gagal dimuat. Pastikan folder models/ masih ada.', 'error');
    }
}

function hapusKotak() {
    ctx.clearRect(0, 0, kanvas.width, kanvas.height);
}

// Ukuran canvas disamakan dengan piksel asli video agar koordinat hasil deteksi langsung cocok.
function siapkanKanvas() {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
        kanvas.width = video.videoWidth;
        kanvas.height = video.videoHeight;
        return true;
    }
    return false;
}

function tutupKamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    video.pause();
    video.srcObject = null;
    hapusKotak();
    placeholder.hidden = false;
    btnKamera.textContent = 'Buka Kamera';
    btnDeteksi.disabled = true;
}

function tungguMetadata() {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        return Promise.resolve();
    }
    return new Promise(resolve => video.addEventListener('loadedmetadata', resolve, { once: true }));
}

async function bukaKamera() {
    if (stream) {
        tutupKamera();
        ubahPesan('Kamera ditutup.', 'idle');
        return;
    }

    if (!window.isSecureContext) {
        ubahPesan('Kamera butuh alamat aman. Buka lewat http://localhost/... bukan IP jaringan.', 'error');
        return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        ubahPesan('Browser ini tidak mendukung akses kamera.', 'error');
        return;
    }

    ubahPesan('Menunggu izin kamera...', 'idle');
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
        });
        video.srcObject = stream;
        await video.play();
        await tungguMetadata();

        if (!siapkanKanvas()) {
            throw new Error('Video kamera tidak memiliki ukuran yang valid.');
        }

        placeholder.hidden = true;
        btnKamera.textContent = 'Tutup Kamera';
        btnDeteksi.disabled = false;
        ubahPesan('Kamera aktif. Arahkan wajah ke layar lalu tekan Deteksi Wajah.', 'ok');
    } catch (err) {
        console.error('Kamera gagal dinyalakan:', err);
        tutupKamera();
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            ubahPesan('Izin kamera ditolak. Aktifkan izin kamera di browser lalu coba lagi.', 'error');
        } else if (err.name === 'NotFoundError') {
            ubahPesan('Kamera tidak ditemukan di perangkat ini.', 'error');
        } else if (err.name === 'NotReadableError') {
            ubahPesan('Kamera sedang dipakai aplikasi lain.', 'error');
        } else {
            ubahPesan('Kamera gagal dinyalakan: ' + err.message, 'error');
        }
    }
}

async function deteksiWajah() {
    if (sedangDeteksi) return;

    if (!modelSiap) {
        ubahPesan('Model belum selesai dimuat, tunggu sebentar lalu coba lagi.', 'error');
        return;
    }

    sedangDeteksi = true;
    btnDeteksi.disabled = true;
    ubahPesan('Menganalisis wajah...', 'idle');

    try {
        const hasil = await faceapi.detectSingleFace(video, opsiDeteksi);
        hapusKotak();

        if (hasil) {
            ctx.strokeStyle = '#16a34a';
            ctx.lineWidth = 4;
            ctx.strokeRect(hasil.box.x, hasil.box.y, hasil.box.width, hasil.box.height);

            sudahScan = true;
            pilihStatus.value = 'Hadir';
            pilihStatus.dispatchEvent(new Event('change'));
            ubahPesan('Wajah terdeteksi (' + Math.round(hasil.score * 100) + '%). Status otomatis Hadir, tekan Simpan Absensi.', 'ok');
        } else {
            ubahPesan('Wajah tidak terdeteksi. Perbaiki cahaya atau posisikan wajah lebih dekat, lalu ulangi.', 'error');
        }
    } catch (e) {
        console.error('Deteksi wajah gagal:', e);
        ubahPesan('Deteksi gagal: ' + e.message, 'error');
    } finally {
        sedangDeteksi = false;
        btnDeteksi.disabled = !stream;
    }
}

// Status Hadir hanya sah bila wajah terdeteksi pada scan terbaru, jadi flag disetel ulang tiap status diganti.
pilihStatus.addEventListener('change', () => {
    if (pilihStatus.value !== 'Hadir') {
        sudahScan = false;
    } else if (!stream) {
        bukaKamera();
    }
});

pilihStatus.form.addEventListener('submit', (e) => {
    if (pilihStatus.value === 'Hadir' && !sudahScan) {
        e.preventDefault();
        ubahPesan('Status Hadir wajib scan wajah. Tekan Deteksi Wajah sampai wajah terdeteksi, lalu simpan lagi.', 'error');
        if (!stream) bukaKamera();
        document.querySelector('.scan-box').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

btnKamera.addEventListener('click', bukaKamera);
btnDeteksi.addEventListener('click', deteksiWajah);
window.addEventListener('pagehide', () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
});
muatModel();