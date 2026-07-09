// --- KOLEKSI ELEMEN UI ---
const audio = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsList = document.getElementById('results-list');

// --- FUNGSI MEMBERSIHKAN & MENYERAGAMKAN METADATA ---
function formatMetadataSeragam(rawTitle, rawCreator) {
    let title = (rawTitle || '').trim();
    let creator = (rawCreator || '').trim();

    // 1. REGEX: Singkirkan teks sampah di dalam kurung siku [...] atau biasa (...)
    title = title.replace(/\[[^\]]*(mp3|dl|cc|hq|flac|download|free|full|album|lossless|kbps|320k|lyrics?|track)[^\]]*\]/gi, '');
    title = title.replace(/\([^)]*(official|video|visualizer|lyric|audio|hq|hd|live|remastered|clean|deluxe|album)[^)]*\)/gi, '');
    
    // Bersihkan sisa kurung kosong dan spasi ganda
    title = title.replace(/\[\s*\]/g, '').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();

    let finalTitle = title;
    let finalArtist = creator && !creator.includes('Tidak Diketahui') ? creator : 'Artis Tidak Diketahui';

    // 2. STRATEGI MEMBELAH TEKS (Memastikan Judul di Atas, Artis di Bawah)
    const separators = [' - ', ' – ', ' : ', ' | '];
    let terpotong = false;

    for (let sep of separators) {
        if (title.includes(sep)) {
            const bagian = title.split(sep);
            let kiri = bagian[0].trim();
            let kanan = bagian[1].trim();

            if (creator && kiri.toLowerCase().includes(creator.toLowerCase())) {
                finalArtist = kiri;
                finalTitle = kanan;
            } 
            else if (creator && kanan.toLowerCase().includes(creator.toLowerCase())) {
                finalArtist = kanan;
                finalTitle = kiri;
            } 
            else {
                finalArtist = kiri;
                finalTitle = kanan;
            }
            terpotong = true;
            break;
        }
    }

    if (!terpotong && finalArtist === 'Artis Tidak Diketahui') {
        const kata = title.split(' ');
        if (kata.length > 1 && kata[0] === kata[0].toUpperCase() && kata[0].length > 1) {
            finalArtist = kata[0];
            finalTitle = kata.slice(1).join(' ');
        }
    }

    finalTitle = finalTitle.replace(/^[-:|–\s]+|[-:|–\s]+$/g, '').trim();
    finalArtist = finalArtist.replace(/^[-:|–\s]+|[-:|–\s]+$/g, '').trim();

    return {
        title: finalTitle || 'Judul Tidak Diketahui',
        artist: finalArtist || 'Artis Tidak Diketahui'
    };
}

// --- LOGIKA UTAMA PENCARIAN (AKSELERASI CLIENT-SIDE) ---
searchBtn.addEventListener('click', lakukanPencarian);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') lakukanPencarian();
});

async function lakukanPencarian() {
    const query = searchInput.value.trim();
    if (!query) return;

    resultsList.innerHTML = `<p class="status-text">Menyelidiki arsip musik terbaik...</p>`;

    try {
        const targetCollections = '(collection:audio_music OR collection:opensource_audio OR collection:etree OR collection:78rpm OR subject:music)';
        const excludeJunk = 'NOT subject:podcast NOT collection:audio_podcasts NOT subject:headlines NOT "crap from the past"';
        
        // AKSELERASI: Hapus filter format dari pencarian utama (agar server cepat), tapi minta kolom format dikirim lewat fl[]=format
        // Kita naikkan rows ke 60 karena penyaringan dilakukan instan di browser kita
        const url = `https://archive.org/advancedsearch.php?q=mediatype:audio AND (title:(${query}) OR creator:(${query})) AND ${targetCollections} ${excludeJunk}&fl[]=identifier,title,creator,format&rows=60&output=json`;
        
        const response = await fetch(url);
        const data = await response.json();
        const items = data.response.docs;

        if (items.length === 0) {
            resultsList.innerHTML = `<p class="status-text">Musik tidak ditemukan.<br>Coba kata kunci lain.</p>`;
            return;
        }

        // --- PENYARINGAN INSTAN DI SISI CLIENT (ANTI LEMOT) ---
        // Memfilter secara kilat di komputer user, hanya meloloskan item yang punya aset MP3 atau FLAC
        const itemsValid = items.filter(item => {
            if (!item.format) return false;
            // Archive.org kadang mengirim format berbentuk Array atau String tunggal
            const daftarFormat = Array.isArray(item.format) ? item.format.map(f => f.toLowerCase()) : [item.format.toLowerCase()];
            return daftarFormat.some(f => f.includes('mp3') || f.includes('flac'));
        });

        if (itemsValid.length === 0) {
            resultsList.innerHTML = `<p class="status-text">Musik dengan format audio valid tidak ditemukan.</p>`;
            return;
        }

        // --- ENGINES FUSE.JS ---
        const opsiFuse = {
            keys: ['title', 'creator'],
            threshold: 0.5,
            distance: 100
        };
        
        const fuse = new Fuse(itemsValid, opsiFuse);
        const hasilFuse = fuse.search(query);

        const koleksiFinal = hasilFuse.length > 0 ? hasilFuse.map(result => result.item) : itemsValid;

        resultsList.innerHTML = '';

        // Merender hasil
        koleksiFinal.forEach(item => {
            const bersih = formatMetadataSeragam(item.title, item.creator);
            
            const itemElement = document.createElement('div');
            itemElement.className = 'track-item';
            itemElement.innerHTML = `
                <div class="item-title" style="font-weight: bold; font-size: 1.05rem; margin-bottom: 3px; color: #ffffff;">${bersih.title}</div>
                <div class="item-subtitle" style="opacity: 0.65; font-size: 0.88rem; color: #b3b3b3;">${bersih.artist}</div>
            `;
            
            itemElement.addEventListener('click', () => muatDanPutarLagu(item.identifier, bersih.title, bersih.artist));
            resultsList.appendChild(itemElement);
        });

    } catch (error) {
        resultsList.innerHTML = `<p class="status-text">Koneksi ke archive.org terputus. Silakan coba lagi.</p>`;
        console.error(error);
    }
}

// --- LOGIKA ENGINE PLAYER & AUDIO STREAMING ---
async function muatDanPutarLagu(identifier, judulBersih, artisBersih) {
    document.getElementById('player-title').innerText = "Mengamankan sinyal audio...";
    document.getElementById('player-artist').innerText = artisBersih;
    playBtn.disabled = true;
    playBtn.innerText = 'Play';

    try {
        const metadataUrl = `https://archive.org/metadata/${identifier}`;
        const response = await fetch(metadataUrl);
        const data = await response.json();
        
        let fileTerpilih = null;
        let tagFormat = "";

        const fileFlac = data.files.find(f => f.name && f.name.toLowerCase().endsWith('.flac'));
        if (fileFlac) {
            fileTerpilih = fileFlac;
            tagFormat = "HQ - FLAC";
        } else {
            const fileMp3 = data.files.find(f => f.name && f.name.toLowerCase().endsWith('.mp3'));
            if (fileMp3) {
                fileTerpilih = fileMp3;
                tagFormat = "SQ - MP3";
            }
        }

        if (!fileTerpilih) {
            alert("Sistem gagal menemukan file pemutaran .mp3/.flac di dalam item ini.");
            document.getElementById('player-title').innerText = "Pilih Lagu Lain";
            return;
        }

        const streamUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(fileTerpilih.name)}`;
        
        audio.src = streamUrl;
        audio.play();
        
        document.getElementById('player-title').innerText = judulBersih;
        document.getElementById('player-artist').innerText = `${artisBersih} • [${tagFormat}]`;
        playBtn.innerText = 'Pause';
        playBtn.disabled = false;

    } catch (error) {
        alert("Gagal memuat file dari server archive.org.");
        document.getElementById('player-title').innerText = "Terjadi Kesalahan";
        console.error(error);
    }
}

// --- KONTROL TIMING AUDIO & PROGRESS BAR ---
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
