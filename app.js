// --- KOLEKSI ELEMEN UI ---
const audio = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsList = document.getElementById('results-list');

let dataHasilPencarianGlobal = [];

// --- FUNGSI MEMBERSIHKAN METADATA ---
function formatMetadataSeragam(rawTitle, rawCreator) {
    let title = Array.isArray(rawTitle) ? rawTitle[0] : rawTitle;
    let creator = Array.isArray(rawCreator) ? rawCreator[0] : rawCreator;

    title = String(title || '').trim();
    creator = String(creator || '').trim();

    title = title.replace(/\[[^\]]*(mp3|dl|cc|hq|flac|download|free|full|album|lossless|kbps|320k|lyrics?|track)[^\]]*\]/gi, '');
    title = title.replace(/\([^)]*(official|video|visualizer|lyric|audio|hq|hd|live|remastered|clean|deluxe|album)[^)]*\)/gi, '');
    title = title.replace(/\[\s*\]/g, '').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();

    let finalTitle = title;
    let finalArtist = creator && !creator.includes('Tidak Diketahui') ? creator : 'Artis Tidak Diketahui';

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
            } else if (creator && kanan.toLowerCase().includes(creator.toLowerCase())) {
                finalArtist = kanan;
                finalTitle = kiri;
            } else {
                finalArtist = kiri;
                finalTitle = kanan;
            }
            terpotong = true;
            break;
        }
    }

    finalTitle = finalTitle.replace(/^[-:|–\s]+|[-:|–\s]+$/g, '').trim();
    finalArtist = finalArtist.replace(/^[-:|–\s]+|[-:|–\s]+$/g, '').trim();

    return {
        title: finalTitle || 'Judul Tidak Diketahui',
        artist: finalArtist || 'Artis Tidak Diketahui'
    };
}

// --- LOGIKA UTAMA PENCARIAN & METODE SORTIR 3 TINGKAT ---
searchBtn.addEventListener('click', lakukanPencarian);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') lakukanPencarian();
});

async function lakukanPencarian() {
    const query = searchInput.value.trim();
    if (!query) return;

    resultsList.innerHTML = `<p class="status-text">Menganalisis tren internet & memetakan lagu...</p>`;

    try {
        // --- TINGKAT 1: AMBIL DATA POPULARITAS INTERNET GLOBAL VIA ITUNES ---
        let daftarPopulerGlobal = [];
        try {
            const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicTrack&limit=15`;
            const itunesResponse = await fetch(itunesUrl);
            const itunesData = await itunesResponse.json();
            if (itunesData.results) {
                daftarPopulerGlobal = itunesData.results.map(track => ({
                    title: track.trackName,
                    artist: track.artistName
                }));
            }
        } catch (e) {
            console.warn("Gagal mengambil tren popularitas global, beralih ke sortir standar.", e);
        }

        // Siapkan pencari Fuse untuk data popularitas global iTunes
        const fuseTrenGlobal = new Fuse(daftarPopulerGlobal, {
            keys: ['title'],
            threshold: 0.5
        });

        // --- AMBIL DATA DARI ARCHIVE.ORG ---
        const targetCollections = '(collection:audio_music OR collection:opensource_audio OR collection:etree OR collection:78rpm OR subject:music)';
        const excludeJunk = 'NOT subject:podcast NOT collection:audio_podcasts NOT subject:headlines NOT "crap from the past"';
        
        // Kita tambahkan parameter 'downloads' ke fl[] untuk acuan TINGKAT 3
        const url = `https://archive.org/advancedsearch.php?q=mediatype:audio AND (title:(${query}) OR creator:(${query})) AND ${targetCollections} ${excludeJunk}&fl[]=identifier,title,creator,format,downloads&rows=80&output=json`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.response || !data.response.docs) {
            resultsList.innerHTML = `<p class="status-text">Respon server archive.org tidak valid.</p>`;
            return;
        }
        
        const items = data.response.docs;
        if (items.length === 0) {
            resultsList.innerHTML = `<p class="status-text">Koleksi tidak ditemukan.<br>Coba kata kunci lain.</p>`;
            return;
        }

        // Validasi format file dasar
        const itemsValid = items.filter(item => {
            if (!item.format) return false;
            const formats = Array.isArray(item.format) ? item.format.map(f => String(f).toLowerCase()) : [String(item.format).toLowerCase()];
            return formats.some(f => f.includes('mp3') || f.includes('flac'));
        });

        // --- PROSES PEMBOBOTAN DATA UNTUK ALGORITMA SORTIR ---
        const itemsDenganBobot = itemsValid.map(item => {
            const bersih = formatMetadataSeragam(item.title, item.creator);
            
            // 1. Hitung Nilai Tren Global (Poin maksimal jika masuk top 15 tangga lagu internet)
            const cocokTren = fuseTrenGlobal.search(bersih.title);
            let skorGlobal = 0;
            if (cocokTren.length > 0) {
                // Semakin tinggi posisi lagunya di iTunes, skornya semakin besar (15 down to 1)
                skorGlobal = 15 - cocokTren[0].refIndex;
            }

            // 2. Deteksi Ketersediaan Format Hi-Res (FLAC)
            const formats = Array.isArray(item.format) ? item.format.map(f => String(f).toLowerCase()) : [String(item.format).toLowerCase()];
            const punyaFlac = formats.some(f => f.includes('flac')) ? 1 : 0;

            // 3. Ambil Angka Total Unduhan Archive.org
            const jumlahDownloads = parseInt(item.downloads, 10) || 0;

            return {
                dataAsli: item,
                bersih: bersih,
                skorGlobal: skorGlobal,
                punyaFlac: punyaFlac,
                downloads: jumlahDownloads
            };
        });

        // --- EKSEKUSI PENYORTIRAN 3 TINGKAT MATRIKS ---
        itemsDenganBobot.sort((a, b) => {
            // TINGKAT 1: Bandingkan Popularitas Tren Musik Internet Global dahulu
            if (b.skorGlobal !== a.skorGlobal) {
                return b.skorGlobal - a.skorGlobal;
            }
            // TINGKAT 2: Jika sama-sama populer, taruh yang punya berkas kualitas tinggi (FLAC) di atas
            if (b.punyaFlac !== a.punyaFlac) {
                return b.punyaFlac - a.punyaFlac;
            }
            // TINGKAT 3: Jika sama-sama FLAC/MP3, urutkan berdasarkan statistik unduhan terbanyak
            return b.downloads - a.downloads;
        });

        // Kembalikan ke struktur data normal
        dataHasilPencarianGlobal = itemsDenganBobot.map(wrapper => wrapper.dataAsli);

        tampilkanDaftarKoleksi(dataHasilPencarianGlobal);

    } catch (error) {
        resultsList.innerHTML = `<p class="status-text">Terjadi kesalahan saat memproses data penyortiran.</p>`;
        console.error(error);
    }
}

// Menampilkan daftar utama koleksi/album terurut
function tampilkanDaftarKoleksi(koleksi) {
    resultsList.innerHTML = '';
    
    koleksi.forEach(item => {
        const bersih = formatMetadataSeragam(item.title, item.creator);
        
        // Deteksi berkas untuk kebutuhan visual label tanda HQ
        const formats = Array.isArray(item.format) ? item.format.map(f => String(f).toLowerCase()) : [String(item.format).toLowerCase()];
        const adakahFlac = formats.some(f => f.includes('flac'));
        const badgeHiRes = adakahFlac ? `<span style="background: #1db954; color: #000; font-size: 0.7rem; font-weight: bold; padding: 2px 5px; border-radius: 3px; margin-left: 8px;">HI-RES</span>` : '';

        const itemElement = document.createElement('div');
        itemElement.className = 'track-item';
        itemElement.innerHTML = `
            <div class="item-title" style="font-weight: bold; font-size: 1.05rem; margin-bottom: 3px; color: #ffffff;">📁 ${bersih.title} ${badgeHiRes}</div>
            <div class="item-subtitle" style="opacity: 0.65; font-size: 0.88rem; color: #b3b3b3;">Koleksi/Album dari: ${bersih.artist}</div>
        `;
        
        itemElement.addEventListener('click', () => bukaDirektoriLagu(item.identifier, bersih.artist));
        resultsList.appendChild(itemElement);
    });
}

// --- FUNGSI MEMBEDAH DIREKTORI BERKAS DI DALAM ALBUM ---
async function bukaDirektoriLagu(identifier, namaArtisKoleksi) {
    resultsList.innerHTML = `<p class="status-text">Membuka direktori berkas lagu...</p>`;

    try {
        const metadataUrl = `https://archive.org/metadata/${identifier}`;
        const response = await fetch(metadataUrl);
        const data = await response.json();
        
        if (!data.files || data.files.length === 0) {
            alert("Direktori berkas kosong atau tidak publik.");
            tampilkanDaftarKoleksi(dataHasilPencarianGlobal);
            return;
        }

        const berkasAudio = data.files.filter(f => f.name && (f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.flac')));

        if (berkasAudio.length === 0) {
            alert("Tidak ditemukan berkas track audio valid di dalam direktori ini.");
            tampilkanDaftarKoleksi(dataHasilPencarianGlobal);
            return;
        }

        const petaTrack = {};
        berkasAudio.forEach(file => {
            const namaMurniLagu = file.name.replace(/\.(mp3|flac)$/i, '');
            
            if (!petaTrack[namaMurniLagu]) {
                petaTrack[namaMurniLagu] = {
                    tampilanJudul: namaMurniLagu.replace(/_/g, ' '),
                    berkasMp3: file.name.toLowerCase().endsWith('.mp3') ? file.name : null,
                    berkasFlac: file.name.toLowerCase().endsWith('.flac') ? file.name : null
                };
            } else {
                if (file.name.toLowerCase().endsWith('.mp3')) petaTrack[namaMurniLagu].berkasMp3 = file.name;
                if (file.name.toLowerCase().endsWith('.flac')) petaTrack[namaMurniLagu].berkasFlac = file.name;
            }
        });

        resultsList.innerHTML = `
            <button id="back-to-search-btn" style="background: #2b2b2b; color: #fff; border: 1px solid #444; padding: 8px 14px; margin-bottom: 15px; cursor: pointer; border-radius: 4px; font-weight: bold; width: 100%;">
                ← Kembali ke Hasil Pencarian
            </button>
            <div style="font-size: 0.9rem; opacity: 0.6; margin-bottom: 10px;">Isi Direktori untuk: ${namaArtisKoleksi}</div>
        `;

        document.getElementById('back-to-search-btn').addEventListener('click', () => {
            tampilkanDaftarKoleksi(dataHasilPencarianGlobal);
        });

        Object.keys(petaTrack).forEach(kunci => {
            const track = petaTrack[kunci];
            
            const trackElement = document.createElement('div');
            trackElement.className = 'track-item';
            trackElement.style.borderLeft = '4px solid #1db954';
            
            const labelFormat = track.berkasFlac ? "HQ - FLAC" : "SQ - MP3";
            const badgeFormat = track.berkasFlac ? `<span style="background: #1db954; color: #000; font-size: 0.65rem; font-weight: bold; padding: 1px 4px; border-radius: 2px; margin-left: 5px;">FLAC</span>` : '';

            trackElement.innerHTML = `
                <div class="item-title" style="font-weight: bold; font-size: 1rem; color: #ffffff;">🎵 ${track.tampilanJudul} ${badgeFormat}</div>
                <div class="item-subtitle" style="opacity: 0.65; font-size: 0.85rem; color: #b3b3b3;">${namaArtisKoleksi} • Klik untuk Mendengarkan</div>
            `;

            const fileFinalDipilih = track.berkasFlac ? track.berkasFlac : track.berkasMp3;

            trackElement.addEventListener('click', () => eksekusiStreamingLagu(identifier, fileFinalDipilih, track.tampilanJudul, namaArtisKoleksi, labelFormat));
            resultsList.appendChild(trackElement);
        });

    } catch (error) {
        alert("Gagal membedah isi direktori arsip.");
        tampilkanDaftarKoleksi(dataHasilPencarianGlobal);
        console.error(error);
    }
}

// --- FUNGSI EKSEKUSI PEMUTARAN AUDIO ---
function eksekusiStreamingLagu(identifier, namaFile, judulLagu, namaArtis, formatLabel) {
    document.getElementById('player-title').innerText = "Menghubungkan ke direktori berkas...";
    document.getElementById('player-artist').innerText = namaArtis;
    playBtn.disabled = true;
    playBtn.innerText = 'Play';

    const streamUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(namaFile)}`;
    
    audio.src = streamUrl;
    audio.play();
    
    document.getElementById('player-title').innerText = judulLagu;
    document.getElementById('player-artist').innerText = `${namaArtis} • [${formatLabel}]`;
    playBtn.innerText = 'Pause';
    playBtn.disabled = false;
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
