// --- KOLEKSI ELEMEN UI ----
const audio = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsList = document.getElementById('results-list');

let dataHasilPencarianGlobal = [];

// --- FUNGSI MEMBERSIHKAN METADATA ALBUM UTAMA ---
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
            break;
        }
    }

    return {
        title: finalTitle.replace(/^[-:|–\s]+|[-:|–\s]+$/g, '').trim() || 'Judul Tidak Diketahui',
        artist: finalArtist.replace(/^[-:|–\s]+|[-:|–\s]+$/g, '').trim() || 'Artis Tidak Diketahui'
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
            console.warn("Gagal mengambil tren popularitas global.", e);
        }

        const fuseTrenGlobal = new Fuse(daftarPopulerGlobal, {
            keys: ['title'],
            threshold: 0.5
        });

        const targetCollections = '(collection:audio_music OR collection:opensource_audio OR collection:etree OR collection:78rpm OR subject:music)';
        const excludeJunk = 'NOT subject:podcast NOT collection:audio_podcasts NOT subject:headlines NOT "crap from the past"';
        
        const url = `https://archive.org/advancedsearch.php?q=mediatype:audio AND (${query}) AND ${targetCollections} ${excludeJunk}&fl[]=identifier,title,creator,format,downloads&rows=80&output=json`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.response || !data.response.docs) {
            resultsList.innerHTML = `<p class="status-text">Respon server tidak valid.</p>`;
            return;
        }
        
        const items = data.response.docs;
        if (items.length === 0) {
            resultsList.innerHTML = `<p class="status-text">Koleksi tidak ditemukan.</p>`;
            return;
        }

        const itemsValid = items.filter(item => {
            if (!item.format) return false;
            const formats = Array.isArray(item.format) ? item.format.map(f => String(f).toLowerCase()) : [String(item.format).toLowerCase()];
            return formats.some(f => f.includes('mp3') || f.includes('flac') || f.includes('lossless') || f.includes('wav'));
        });

        const itemsDenganBobot = itemsValid.map(item => {
            const bersih = formatMetadataSeragam(item.title, item.creator);
            
            const cocokTren = fuseTrenGlobal.search(formatting => bersih.title);
            let skorGlobal = 0;
            if (cocokTren.length > 0) {
                skorGlobal = 15 - cocokTren[0].refIndex;
            }

            const formats = Array.isArray(item.format) ? item.format.map(f => String(f).toLowerCase()) : [String(item.format).toLowerCase()];
            const punyaFlac = formats.some(f => f.includes('flac') || f.includes('lossless') || f.includes('wav')) ? 1 : 0;

            const jumlahDownloads = parseInt(item.downloads, 10) || 0;

            return {
                dataAsli: item,
                bersih: bersih,
                skorGlobal: skorGlobal,
                punyaFlac: punyaFlac,
                downloads: jumlahDownloads
            };
        });

        itemsDenganBobot.sort((a, b) => {
            if (b.skorGlobal !== a.skorGlobal) return b.skorGlobal - a.skorGlobal;
            if (b.punyaFlac !== a.punyaFlac) return b.punyaFlac - a.punyaFlac;
            return b.downloads - a.downloads;
        });

        dataHasilPencarianGlobal = itemsDenganBobot.map(wrapper => wrapper.dataAsli);
        tampilkanDaftarKoleksi(dataHasilPencarianGlobal, query);

    } catch (error) {
        resultsList.innerHTML = `<p class="status-text">Gagal memproses data penyortiran.</p>`;
        console.error(error);
    }
}

function tampilkanDaftarKoleksi(koleksi, kataKunciAsli = '') {
    resultsList.innerHTML = '';
    
    koleksi.forEach(item => {
        const bersih = formatMetadataSeragam(item.title, item.creator);
        
        const formats = Array.isArray(item.format) ? item.format.map(f => String(f).toLowerCase()) : [String(item.format).toLowerCase()];
        const adakahFlac = formats.some(f => f.includes('flac') || f.includes('lossless') || f.includes('wav'));
        const badgeHiRes = adakahFlac ? `<span style="background: #1db954; color: #000; font-size: 0.7rem; font-weight: bold; padding: 2px 5px; border-radius: 3px; margin-left: 8px;">HI-RES</span>` : '';

        const itemElement = document.createElement('div');
        itemElement.className = 'track-item';
        itemElement.innerHTML = `
            <div class="item-title" style="font-weight: bold; font-size: 1.05rem; margin-bottom: 3px; color: #ffffff;">📁 ${bersih.title} ${badgeHiRes}</div>
            <div class="item-subtitle" style="opacity: 0.65; font-size: 0.88rem; color: #b3b3b3;">Koleksi dari: ${bersih.artist}</div>
        `;
        
        itemElement.addEventListener('click', () => bukaDirektoriLagu(item.identifier, bersih.artist, kataKunciAsli));
        resultsList.appendChild(itemElement);
    });
}

// --- BEDAH DIREKTORI & PENENTUAN HIERARKI AUDIO MULTI-FORMAT ---
async function bukaDirektoriLagu(identifier, namaArtisKoleksi, kataKunciAsli = '') {
    resultsList.innerHTML = `<p class="status-text">Membuka direktori berkas lagu...</p>`;

    try {
        const metadataUrl = `https://archive.org/metadata/${identifier}`;
        const response = await fetch(metadataUrl);
        const data = await response.json();
        
        if (!data.files || data.files.length === 0) {
            alert("Direktori berkas kosong.");
            tampilkanDaftarKoleksi(dataHasilPencarianGlobal, kataKunciAsli);
            return;
        }

        // Filter format audio yang didukung aplikasi
        const berkasAudio = data.files.filter(f => f.name && (
            f.name.toLowerCase().endsWith('.mp3') || 
            f.name.toLowerCase().endsWith('.flac') || 
            f.name.toLowerCase().endsWith('.wav')
        ));

        if (berkasAudio.length === 0) {
            alert("Tidak ditemukan berkas audio valid.");
            tampilkanDaftarKoleksi(dataHasilPencarianGlobal, kataKunciAsli);
            return;
        }

        const petaTrack = {};
        berkasAudio.forEach(file => {
            // PERBAIKAN: Potong nama subfolder jika file berada di dalam sub-direktori (terdeteksi tanda "/")
            let namaBerkasMurni = file.name.substring(file.name.lastIndexOf('/') + 1);
            let judulMurni = file.title || '';
            
            if (!judulMurni) {
                let namaMurni = namaBerkasMurni.replace(/\.(mp3|flac|wav)$/i, '');
                if (namaArtisKoleksi && namaMurni.toLowerCase().startsWith(namaArtisKoleksi.toLowerCase())) {
                    namaMurni = namaMurni.substring(namaArtisKoleksi.length);
                }
                judulMurni = namaMurni.replace(/_/g, ' ').trim();
            }

            let judulTampilanRapi = judulMurni.replace(/^[\d\s.\-_]+/, '').trim();
            let kunciGrup = judulTampilanRapi.toLowerCase()
                                             .replace(/\bdan\b|\byg\b|\byang\b|&/g, '')
                                             .replace(/[^a-z0-9]/g, '');

            if (!petaTrack[kunciGrup]) {
                petaTrack[kunciGrup] = {
                    tampilanJudul: judulTampilanRapi,
                    kandidatBerkas: []
                };
            }
            // Simpan semua format alternatif ke dalam satu grup lagu yang sama
            petaTrack[kunciGrup].kandidatBerkas.push(file);
        });

        resultsList.innerHTML = `
            <button id="back-to-search-btn" style="background: #2b2b2b; color: #fff; border: 1px solid #444; padding: 8px 14px; margin-bottom: 15px; cursor: pointer; border-radius: 4px; font-weight: bold; width: 100%;">
                ← Kembali ke Hasil Pencarian
            </button>
            <div style="font-size: 0.9rem; opacity: 0.6; margin-bottom: 10px;">Isi Direktori untuk: ${namaArtisKoleksi}</div>
        `;

        document.getElementById('back-to-search-btn').addEventListener('click', () => {
            tampilkanDaftarKoleksi(dataHasilPencarianGlobal, kataKunciAsli);
        });

        Object.keys(petaTrack).forEach(kunci => {
            const track = petaTrack[kunci];
            
            // PERBAIKAN UTAMA: Skema matriks poin penentu format audio secara mutlak
            track.kandidatBerkas.sort((a, b) => {
                const hitungSkor = (f) => {
                    const nama = f.name.toLowerCase();
                    const formatTag = String(f.format || '').toLowerCase();
                    
                    if (nama.endsWith('.flac') || nama.endsWith('.wav') || formatTag.includes('lossless')) {
                        return 3; // 1. LOSSLESS (Prioritas Puncak)
                    }
                    if (formatTag.includes('vbr') || nama.includes('vbr') || formatTag.includes('hifi')) {
                        return 2; // 2. HIGH QUALITY MP3
                    }
                    if (nama.endsWith('.mp3')) {
                        return 1; // 3. STANDARD QUALITY MP3
                    }
                    return 0;
                };
                return hitungSkor(b) - hitungSkor(a);
            });

            // Berkas urutan teratas hasil penyortiran skor otomatis diambil
            const fileTerpilih = track.kandidatBerkas[0];
            const namaFileFinal = fileTerpilih.name;
            const ekstensi = namaFileFinal.substring(namaFileFinal.lastIndexOf('.')).toLowerCase();
            
            let labelFormat = "SQ - MP3";
            let badgeFormat = "";
            
            if (ekstensi === '.flac' || ekstensi === '.wav') {
                const namaExt = ekstensi.replace('.', '').toUpperCase();
                labelFormat = `HQ - ${namaExt}`;
                badgeFormat = `<span style="background: #1db954; color: #000; font-size: 0.65rem; font-weight: bold; padding: 1px 4px; border-radius: 2px; margin-left: 5px;">${namaExt}</span>`;
            } else {
                const formatTag = String(fileTerpilih.format || '').toLowerCase();
                if (formatTag.includes('vbr') || namaFileFinal.toLowerCase().includes('vbr')) {
                    labelFormat = "HQ - MP3";
                    badgeFormat = `<span style="background: #ffb703; color: #000; font-size: 0.65rem; font-weight: bold; padding: 1px 4px; border-radius: 2px; margin-left: 5px;">HQ</span>`;
                }
            }

            let judulFinalTampilan = track.tampilanJudul;
            if (fileTerpilih.title) {
                judulFinalTampilan = fileTerpilih.title.replace(/^[\d\s.\-_]+/, '').trim();
            }

            const trackElement = document.createElement('div');
            trackElement.className = 'track-item';
            trackElement.style.borderLeft = '4px solid #1db954';

            trackElement.innerHTML = `
                <div class="item-title" style="font-weight: bold; font-size: 1rem; color: #ffffff;">🎵 ${judulFinalTampilan} ${badgeFormat}</div>
                <div class="item-subtitle" style="opacity: 0.65; font-size: 0.85rem; color: #b3b3b3;">${namaArtisKoleksi} • Klik untuk Streaming</div>
            `;

            trackElement.addEventListener('click', () => eksekusiStreamingLagu(identifier, namaFileFinal, judulFinalTampilan, namaArtisKoleksi, labelFormat));
            resultsList.appendChild(trackElement);
        });

    } catch (error) {
        alert("Gagal membedah isi direktori arsip.");
        tampilkanDaftarKoleksi(dataHasilPencarianGlobal, kataKunciAsli);
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
