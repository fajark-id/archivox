// Mengambil komponen HTML yang dibutuhkan
const audio = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsList = document.getElementById('results-list');

// --- FUNGSI PEMBERSIH METADATA DENGAN REGEX ---
function bersihkanMetadata(rawTitle, rawCreator) {
    let title = (rawTitle || '').trim();
    let creator = (rawCreator || '').trim();

    // 1. REGEX: Hapus teks junk di dalam kurung siku [...] (contoh: [ MP3 DL. CC ], [320kbps])
    title = title.replace(/\[[^\]]*(mp3|dl|cc|hq|flac|download|free|full|album|lossless|kbps|320k|lyrics?|track)[^\]]*\]/gi, '');
    
    // 2. REGEX: Hapus teks promo di dalam kurung biasa (...) (contoh: (Official Audio), (Visualizer))
    title = title.replace(/\([^)]*(official|video|visualizer|lyric|audio|hq|hd|live|remastered|clean|deluxe|album)[^)]*\)/gi, '');
    
    // Hapus sisa kurung kosong dan rapikan spasi berlebih
    title = title.replace(/\[\s*\]/g, '').replace(/\(\s*\)/g, '');
    title = title.replace(/\s+/g, ' ').trim();

    let finalTitle = title;
    let finalArtist = creator && !creator.includes('Tidak Diketahui') ? creator : 'Artis Tidak Diketahui';

    // 3. LOGIKA PEMISAHAN (Agar Judul Lagu di Atas, Artis di Bawah)
    const separators = [' - ', ' – ', ' : ', ' | '];
    let didSplit = false;

    for (let sep of separators) {
        if (title.includes(sep)) {
            const parts = title.split(sep);
            let p1 = parts[0].trim();
            let p2 = parts[1].trim();

            // Jika bagian pertama (p1) mirip nama creator, berarti formatnya: Artist - Title
            if (creator && p1.toLowerCase().includes(creator.toLowerCase())) {
                finalArtist = p1;
                finalTitle = p2;
            } 
            // Jika bagian kedua (p2) mirip nama creator, berarti formatnya: Title - Artist
            else if (creator && p2.toLowerCase().includes(creator.toLowerCase())) {
                finalArtist = p2;
                finalTitle = p1;
            } 
            // Default jika tidak ada creator tag: Asumsikan standar industri (Artist - Title)
            else {
                finalArtist = p1;
                finalTitle = p2;
            }
            didSplit = true;
            break;
        }
    }

    // Jika title dan creator sama persis (kasus album/koleksi)
    if (!didSplit && creator && title.toLowerCase() === creator.toLowerCase()) {
        finalTitle = title;
        finalArtist = creator;
    }

    // Kasus khusus tanpa strip tapi kata pertama Kapital Penuh (Contoh: "NIKI Every Summertime")
    if (!didSplit && finalArtist === 'Artis Tidak Diketahui') {
        const words = title.split(' ');
        if (words.length > 1 && words[0] === words[0].toUpperCase() && words[0].length > 1) {
            finalArtist = words[0];
            finalTitle = words.slice(1).join(' ');
        }
    }

    // Pembersihan akhir dari simbol sisa di ujung teks
    finalTitle = finalTitle.replace(/^[-:|–\s]+|[-:|–\s]+$/g, '').trim();
    finalArtist = finalArtist.replace(/^[-:|–\s]+|[-:|–\s]+$/g, '').trim();

    // Fallback jika kosong telanjur bersih total
    if (!finalTitle) finalTitle = 'Judul Tidak Diketahui';
    if (!finalArtist) finalArtist = 'Artis Tidak Diketahui';

    return { title: finalTitle, artist: finalArtist };
}

// --- LOGIKA PENCARIAN API DENGAN FILTER FORMAT SEJAK AWAL ---
searchBtn.addEventListener('click', lakukanPencarian);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') lakukanPencarian();
});

async function lakukanPencarian() {
    const query = searchInput.value.trim();
    if (!query) return;

    resultsList.innerHTML = `<p class="status-text">Mencari file lagu valid...</p>`;

    try {
        const targetCollections = '(collection:audio_music OR collection:opensource_audio OR collection:etree OR collection:78rpm OR subject:music)';
        const excludeJunk = 'NOT subject:podcast NOT collection:audio_podcasts NOT subject:headlines NOT "crap from the past"';
        
        // REVOLUSI API: Menambahkan filter (format:MP3 OR format:FLAC) langsung di query pencarian utama
        const url = `https://archive.org/advancedsearch.php?q=mediatype:audio AND (format:MP3 OR format:FLAC) AND (title:(${query}) OR creator:(${query})) AND ${targetCollections} ${excludeJunk}&fl[]=identifier,title,creator&rows=30&output=json`;
        
        const response = await fetch(url);
        const data = await response.json();
        const items = data.response.docs;

        if (items.length === 0) {
            resultsList.innerHTML = `<p class="status-text">Musik dengan format MP3/FLAC tidak ditemukan.<br>Coba kata kunci lain.</p>`;
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

        // Merender Hasil Pencarian Secara Seragam
        items.forEach(item => {
            const meta = bersihkanMetadata(item.title, item.creator);
            
            const itemElement = document.createElement('div');
            itemElement.className = 'track-item';
            itemElement.innerHTML = `
                <div class="item-title" style="font-weight: bold; font-size: 1.05rem; margin-bottom: 3px;">${meta.title}</div>
                <div class="item-subtitle" style="opacity: 0.7; font-size: 0.88rem;">${meta.artist}</div>
            `;
            
            itemElement.addEventListener('click', () => muatDanPutarLagu(item.identifier, meta.title, meta.artist));
            resultsList.appendChild(itemElement);
        });

    } catch (error) {
        resultsList.innerHTML = `<p class="status-text">Gagal terhubung ke archive.org. Periksa koneksi internetmu.</p>`;
        console.error(error);
    }
}

// --- LOGIKA PRIORITAS FORMAT & STREAMING ARSIP ---
async function muatDanPutarLagu(identifier, cleanTitle, cleanArtist) {
    document.getElementById('player-title').innerText = "Memutar lagu...";
    document.getElementById('player-artist').innerText = cleanArtist;
    playBtn.disabled = true;
    playBtn.innerText = 'Play';

    try {
        const metadataUrl = `https://archive.org/metadata/${identifier}`;
        const response = await fetch(metadataUrl);
        const data = await response.json();
        
        let targetFile = null;
        let formatLabel = "";

        // 1. Ambil FLAC jika ada
        const flacFile = data.files.find(file => file.name && file.name.toLowerCase().endsWith('.flac'));
        
        if (flacFile) {
            targetFile = flacFile;
            formatLabel = "HQ - FLAC";
        } else {
            // 2. Ambil MP3 jika FLAC absen
            const mp3File = data.files.find(file => file.name && file.name.toLowerCase().endsWith('.mp3'));
            if (mp3File) {
                targetFile = mp3File;
                formatLabel = "SQ - MP3";
            }
        }

        if (!targetFile) {
            alert("File pemutaran tidak ditemukan pada arsip ini.");
            document.getElementById('player-title').innerText = "Pilih Lagu Lain";
            return;
        }

        const streamUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(targetFile.name)}`;
        
        audio.src = streamUrl;
        audio.play();
        
        // Set info player utama secara seragam: Judul di atas, Artis + Format di bawah
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
