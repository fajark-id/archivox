// Mengambil komponen HTML yang dibutuhkan
const audio = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsList = document.getElementById('results-list');

// --- FUNGSI PEMBERSIH METADATA (ARTIS & JUDUL) ---
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

    // 2. Antisipasi kasus kata pertama KAPITAL PENUH tanpa strip (Contoh: "NIKI Every Summertime")
    if (artist.includes('Tidak Diketahui') || artist === '') {
        const words = title.split(' ');
        if (words.length > 1 && words[0] === words[0].toUpperCase() && words[0].length > 1) {
            artist = words[0];
            title = words.slice(1).join(' ');
        }
    }

    return { title, artist };
}

// --- LOGIKA PENCARIAN API DENGAN FILTER STRICT MUSIK ---
searchBtn.addEventListener('click', lakukanPencarian);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') lakukanPencarian();
});

async function lakukanPencarian() {
    const query = searchInput.value.trim();
    if (!query) return;

    resultsList.innerHTML = `<p class="status-text">Membuka brankas arsip musik...</p>`;

    try {
        const targetCollections = '(collection:audio_music OR collection:opensource_audio OR collection:etree OR collection:78rpm OR subject:music)';
        const excludeJunk = 'NOT subject:podcast NOT collection:audio_podcasts NOT subject:headlines NOT "crap from the past"';
        
        // Mencari field spesifik pada title atau creator agar hasil pencarian akurat
        const url = `https://archive.org/advancedsearch.php?q=mediatype:audio AND (title:(${query}) OR creator:(${query})) AND ${targetCollections} ${excludeJunk}&fl[]=identifier,title,creator&rows=30&output=json`;
        
        const response = await fetch(url);
        const data = await response.json();
        const items = data.response.docs;

        if (items.length === 0) {
            resultsList.innerHTML = `<p class="status-text">Musik tidak ditemukan.<br>Coba gunakan kata kunci lain.</p>`;
            return;
        }

        // --- SISTEM PENILAIAN RELEVANSI ---
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/);

        items.forEach(item => {
            let score = 0;
            const itemTitle = (item.title || '').toLowerCase();
            const itemCreator = (item.creator || '').toLowerCase();

            if (itemTitle.includes(queryLower)) score += 100;
            if (itemCreator.includes(queryLower)) score += 60;

            queryWords.forEach(word => {
                if (word.length > 1) {
                    if (itemTitle.includes(word)) score += 20;
                    if (itemCreator.includes(word)) score += 10;
                    if (itemTitle.startsWith(word)) score += 15;
                }
            });

            item.score = score;
        });

        items.sort((a, b) => b.score - a.score);

        resultsList.innerHTML = '';

        items.forEach(item => {
            const meta = bersihkanMetadata(item.title, item.creator);
            
            const itemElement = document.createElement('div');
            itemElement.className = 'track-item';
            itemElement.innerHTML = `
                <div class="item-title">${meta.title}</div>
                <div class="item-subtitle">${meta.artist}</div>
            `;
            
            itemElement.addEventListener('click', () => muatDanPutarLagu(item.identifier, meta.title, meta.artist));
            resultsList.appendChild(itemElement);
        });

    } catch (error) {
        resultsList.innerHTML = `<p class="status-text">Gagal terhubung ke archive.org. Periksa koneksi internetmu.</p>`;
        console.error(error);
    }
}

// --- LOGIKA PRIORITAS FORMAT (FLAC -> MP3) & STREAMING ---
async function muatDanPutarLagu(identifier, cleanTitle, cleanArtist) {
    document.getElementById('player-title').innerText = "Memeriksa format terbaik...";
    document.getElementById('player-artist').innerText = cleanArtist;
    playBtn.disabled = true;
    playBtn.innerText = 'Play';

    try {
        const metadataUrl = `https://archive.org/metadata/${identifier}`;
        const response = await fetch(metadataUrl);
        const data = await response.json();
        
        let targetFile = null;
        let formatLabel = "";

        // 1. Coba cari file berformat FLAC dulu (Kualitas Tertinggi)
        const flacFile = data.files.find(file => file.name.toLowerCase().endsWith('.flac'));
        
        if (flacFile) {
            targetFile = flacFile;
            formatLabel = "HQ - FLAC";
        } else {
            // 2. Jika tidak ada FLAC, cari file MP3 sebagai cadangan
            const mp3File = data.files.find(file => file.name.toLowerCase().endsWith('.mp3'));
            if (mp3File) {
                targetFile = mp3File;
                formatLabel = "SQ - MP3";
            }
        }

        // Jika dua-duanya tidak ada di dalam folder item tersebut
        if (!targetFile) {
            alert("Arsip ini tidak memiliki format FLAC ataupun MP3 yang bisa diputar.");
            document.getElementById('player-title').innerText = "Pilih Lagu Lain";
            document.getElementById('player-artist').innerText = "Format tidak didukung";
            return;
        }

        // Menyusun URL streaming langsung dari archive.org
        const streamUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(targetFile.name)}`;
        
        // Memasukkan sumber musik ke tag audio dan memutarnya
        audio.src = streamUrl;
        audio.play();
        
        // Tampilkan judul asli dan sematkan label format di nama artis
        document.getElementById('player-title').innerText = cleanTitle;
        document.getElementById('player-artist').innerText = `${cleanArtist} • [${formatLabel}]`;
        playBtn.innerText = 'Pause';
        playBtn.disabled = false;

    } catch (error) {
        alert("Gagal mengambil file audio dari server.");
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
