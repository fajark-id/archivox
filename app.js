// Mengambil komponen HTML yang dibutuhkan
const audio = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsList = document.getElementById('results-list');

// --- LOGIKA PENCARIAN API ARCHIVE.ORG ---
searchBtn.addEventListener('click', lakukanPencarian);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') lakukanPencarian();
});

async function lakukanPencarian() {
    const query = searchInput.value.trim();
    if (!query) return;

    resultsList.innerHTML = `<p class="status-text">Membuka brankas arsip archive.org...</p>`;

    try {
        // Request ke API Archive.org khusus untuk berkas audio
        const url = `https://archive.org/advancedsearch.php?q=mediatype:audio AND (${query})&fl[]=identifier,title,creator&rows=15&output=json`;
        const response = await fetch(url);
        const data = await response.json();
        const items = data.response.docs;

        if (items.length === 0) {
            resultsList.innerHTML = `<p class="status-text">Audio tidak ditemukan.<br>Coba gunakan kata kunci artis atau keyword lain.</p>`;
            return;
        }

        resultsList.innerHTML = ''; // Bersihkan pesan status pencarian

        // Merender hasil pencarian ke daftar bawah
        items.forEach(item => {
            const title = item.title || 'Judul Tidak Diketahui';
            const creator = item.creator || 'Artis/Kolektor Tidak Diketahui';
            
            const itemElement = document.createElement('div');
            itemElement.className = 'track-item';
            itemElement.innerHTML = `
                <div class="item-title">${title}</div>
                <div class="item-subtitle">${creator}</div>
            `;
            
            // Reaksi saat baris hasil lagu diklik
            itemElement.addEventListener('click', () => muatDanPutarLagu(item.identifier, title, creator));
            resultsList.appendChild(itemElement);
        });

    } catch (error) {
        resultsList.innerHTML = `<p class="status-text">Gagal terhubung ke archive.org. Periksa koneksi internetmu.</p>`;
        console.error(error);
    }
}

// --- LOGIKA MENCARI FORMAT MP3 & STREAMING ---
async function muatDanPutarLagu(identifier, title, artist) {
    document.getElementById('player-title').innerText = "Menghubungkan ke arsip...";
    document.getElementById('player-artist').innerText = artist;
    playBtn.disabled = true;
    playBtn.innerText = 'Play';

    try {
        // Mengambil isi daftar file di dalam item archive.org
        const metadataUrl = `https://archive.org/metadata/${identifier}`;
        const response = await fetch(metadataUrl);
        const data = await response.json();
        
        // Mencari file audio yang memiliki ekstensi .mp3
        const mp3File = data.files.find(file => file.name.endsWith('.mp3'));

        if (!mp3File) {
            alert("Arsip ini tidak memiliki file format .mp3 yang mendukung pemutaran langsung di browser.");
            document.getElementById('player-title').innerText = "Pilih Lagu Lain";
            document.getElementById('player-artist').innerText = "Format tidak didukung";
            return;
        }

        // Menyusun URL streaming langsung
        const streamUrl = `https://archive.org/download/${identifier}/${mp3File.name}`;
        
        // Memasukkan ke tag audio, reload, dan mainkan
        audio.src = streamUrl;
        audio.play();
        
        document.getElementById('player-title').innerText = title;
        playBtn.innerText = 'Pause';
        playBtn.disabled = false;

    } catch (error) {
        alert("Gagal memuat audio dari server archive.org.");
        document.getElementById('player-title').innerText = "Terjadi Kesalahan";
        console.error(error);
    }
}

// --- LOGIKA KONTROL AUDIO & PROGRESS BAR ---
playBtn.addEventListener('click', () => {
    if (audio.paused) {
        audio.play();
        playBtn.innerText = 'Pause';
    } else {
        audio.pause();
        playBtn.innerText = 'Play';
    }
});

audio.addEventListener('timeupdate', () => {
    const progress = (audio.currentTime / audio.duration) * 100;
    progressBar.value = progress || 0;
    currentTimeEl.innerText = formatTime(audio.currentTime);
});

audio.addEventListener('loadedmetadata', () => {
    durationEl.innerText = formatTime(audio.duration);
});

progressBar.addEventListener('input', () => {
    const time = (progressBar.value / 100) * audio.duration;
    audio.currentTime = time;
});

// Helper mengubah detik ke format waktu 0:00
function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}
