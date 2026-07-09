// Mengambil komponen HTML yang dibutuhkan
const audio = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsList = document.getElementById('results-list');

// --- HAMPARAN FUNGSI PEMBERSIH METADATA (ARTIS & JUDUL) ---
function bersihkanMetadata(rawTitle, rawCreator) {
    let title = (rawTitle || 'Judul Tidak Diketahui').trim();
    let artist = (rawCreator || 'Artis Tidak Diketahui').trim();

    // 1. Jika judul mengandung pemisah standar seperti " - ", " – ", " : ", atau " | "
    const separators = [' - ', ' – ', ' : ', ' | '];
    for (let sep of separators) {
        if (title.includes(sep)) {
            const parts = title.split(sep);
            artist = parts[0].trim();
            title = parts[1].trim();
            return { title, artist };
        }
    }

    // 2. Kasus khusus tanpa strip, tapi kata pertama KAPITAL PENUH (Contoh: "NIKI Every Summertime")
    if (artist.includes('Tidak Diketahui') || artist === '') {
        const words = title.split(' ');
        if (words.length > 1 && words[0] === words[0].toUpperCase() && words[0].length > 1) {
            artist = words[0];
            title = words.slice(1).join(' ');
        }
    }

    return { title, artist };
}

// --- LOGIKA PENCARIAN API + SORTING RELEVANSI ---
searchBtn.addEventListener('click', lakukanPencarian);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') lakukanPencarian();
});

async function lakukanPencarian() {
    const query = searchInput.value.trim();
    if (!query) return;

    resultsList.innerHTML = `<p class="status-text">Membuka brankas arsip archive.org...</p>`;

    try {
        const url = `https://archive.org/advancedsearch.php?q=mediatype:audio AND (${query})&fl[]=identifier,title,creator&rows=25&output=json`;
        const response = await fetch(url);
        const data = await response.json();
        const items = data.response.docs;

        if (items.length === 0) {
            resultsList.innerHTML = `<p class="status-text">Audio tidak ditemukan.<br>Coba gunakan kata kunci artis atau keyword lain.</p>`;
            return;
        }

        // --- SISTEM PENILAIAN RELEVANSI KATA KUNCI (SORTING) ---
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/);

        items.forEach(item => {
            let score = 0;
            const itemTitle = (item.title || '').toLowerCase();
            const itemCreator = (item.creator || '').toLowerCase();

            // Cocok persis satu kalimat dapat poin besar
            if (itemTitle.includes(queryLower)) score += 100;
            if (itemCreator.includes(queryLower)) score += 60;

            // Cocok per kata kunci
            queryWords.forEach(word => {
                if (word.length > 1) {
                    if (itemTitle.includes(word)) score += 20;
                    if (itemCreator.includes(word)) score += 10;
                    if (itemTitle.startsWith(word)) score += 15; // Prioritas jika judul diawali kata tersebut
                }
            });

            item.score = score;
        });

        // Urutkan hasil dari skor tertinggi ke terendah
        items.sort((a, b) => b.score - a.score);

        resultsList.innerHTML = ''; // Bersihkan pesan status

        // Merender hasil pencarian yang sudah rapi dan terurut
        items.forEach(item => {
            // Bersihkan judul & artis sebelum ditampilkan di daftar
            const meta = bersihkanMetadata(item.title, item.creator);
            
            const itemElement = document.createElement('div');
            itemElement.className = 'track-item';
            itemElement.innerHTML = `
                <div class="item-title">${meta.title}</div>
                <div class="item-subtitle">${meta.artist}</div>
            `;
            
            itemElement.addEventListener('click', () => muatDanPutarLagu(item.identifier, item.title, item.creator));
            resultsList.appendChild(itemElement);
        });

    } catch (error) {
        resultsList.innerHTML = `<p class="status-text">Gagal terhubung ke archive.org. Periksa koneksi internetmu.</p>`;
        console.error(error);
    }
}

// --- LOGIKA MENCARI FORMAT MP3 & STREAMING ---
async function muatDanPutarLagu(identifier, fallbackTitle, fallbackArtist) {
    document.getElementById('player-title').innerText = "Menghubungkan ke arsip...";
    document.getElementById('player-artist').innerText = "Memuat...";
    playBtn.disabled = true;
    playBtn.innerText = 'Play';

    try {
        const metadataUrl = `https://archive.org/metadata/${identifier}`;
        const response = await fetch(metadataUrl);
        const data = await response.json();
        
        const mp3File = data.files.find(file => file.name.endsWith('.mp3'));

        if (!mp3File) {
            alert("Arsip ini tidak memiliki file format .mp3 yang mendukung pemutaran langsung.");
            document.getElementById('player-title').innerText = "Pilih Lagu Lain";
            document.getElementById('player-artist').innerText = "Format tidak didukung";
            return;
        }

        const streamUrl = `https://archive.org/download/${identifier}/${mp3File.name}`;
        
        // Coba deteksi metadata internal (ID3 Tag) bawaan file jika tersedia di archive.org
        let fileTitle = mp3File.title || data.metadata.title || fallbackTitle;
        let fileArtist = mp3File.artist || data.metadata.creator || fallbackArtist;

        // Bersihkan sekali lagi agar tampilan player sempurna
        const metaFinal = bersihkanMetadata(fileTitle, fileArtist);

        audio.src = streamUrl;
        audio.play();
        
        document.getElementById('player-title').innerText = metaFinal.title;
        document.getElementById('player-artist').innerText = metaFinal.artist;
        playBtn.innerText = 'Pause';
        playBtn.disabled = false;

    } catch (error) {
        alert("Gagal memuat audio dari server.");
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

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}
