# Miles Music Player

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Miles terutama dibuat untuk satu pengguna pribadi yang mendengarkan koleksi musiknya di desktop Windows. Pengguna ingin memainkan file audio lokal dan musik dari link YouTube tanpa berpindah aplikasi, login, atau mengelola kredensial layanan eksternal.

## Product Purpose

Miles menyatukan file musik lokal dan sumber YouTube dalam satu library, playlist, antrean, dan pengalaman pemutaran desktop. Keberhasilan berarti pengguna dapat menambahkan musik, memulai playback, berpindah lagu, dan mengelola playlist dengan cepat tanpa kehilangan karakter compact hi-fi player.

## Positioning

Miles menggabungkan pemutar file lokal, impor video atau playlist YouTube secara on-demand, dan antarmuka turntable/vinyl yang tetap hidup dalam tiga ukuran widget desktop. Integrasi YouTube menggunakan resolver lokal di backend Tauri dan tidak memerlukan API key, login, atau cookies pengguna.

## Operating Context

- Digunakan sebagai aplikasi desktop Windows berbasis Tauri.
- Dapat tetap berada di atas aplikasi lain dan diposisikan di sudut layar.
- Memiliki tiga mode: control bar dengan laci musik, vinyl widget, dan micro bubble.
- Musik dapat ditambahkan melalui drag-and-drop file lokal atau paste link YouTube.
- Playlist lokal dan YouTube dapat hidup bersama di library dan playback queue.

## Capabilities and Constraints

- Mendukung file audio lokal serta video dan playlist YouTube publik.
- Impor playlist dibatasi pada 100 entri pertama.
- Playlist YouTube diimpor secara atomic; kegagalan tidak boleh membuat playlist setengah jadi.
- Impor ulang menyinkronkan berdasarkan `videoId` dan hanya menambahkan lagu baru.
- Live stream dan upcoming stream tidak didukung; Live VOD dengan durasi tetap tetap didukung.
- Item unavailable, private, deleted, age-restricted, region-blocked, live, atau upcoming dapat dilewati dan harus dilaporkan.
- Impor memiliki timeout 15 detik per percobaan, satu automatic retry, cancel action, dan manual retry setelah kegagalan akhir.
- Import tetap berjalan jika music drawer ditutup dan hasilnya diumumkan melalui notifikasi.
- Direct audio stream URL hanya berada di volatile runtime memory dan tidak dipersistensikan.
- Tidak menggunakan login, cookies privat, API key Google, atau FFmpeg.
- Playback YouTube menggunakan best-effort pre-resolution dengan satu `HTMLAudioElement`; buffering jaringan tetap dapat menimbulkan jeda.
- UI Mode 1 memiliki ruang utama sekitar 440 px dan penambahan fitur tidak boleh mengganggu kontrol playback atau vinyl.

## Brand Commitments

- Nama produk: Miles Music Player.
- Karakter produk: compact, tactile, personal, hi-fi, dan tidak terasa seperti dashboard generik.
- Motif yang harus dipertahankan: vinyl record, tonearm, CD/music drawer, lampu status, panel gelap, serta aksen amber yang terkontrol.
- Bahasa antarmuka utama adalah Bahasa Indonesia, dengan istilah teknis yang ringkas bila diperlukan.
- Tiga mode widget dan perilaku desktop yang sudah ada harus tetap dikenali.

## Evidence on Hand

- Implementasi React/Tailwind dan komponen Tauri yang sudah berjalan berada di `src/`.
- Kontrak backend dan roadmap integrasi YouTube berada di `YOUTUBE_INTEGRATION_IMPLEMENTATION_PLAN.md` dan `PROJECT_PLAN.md`.
- Implementasi visual incumbent berada terutama di `src/components/ControlBar.tsx`, `src/components/MusicDrawer.tsx`, dan `src/index.css`.
- Tidak ada testimonial, benchmark komersial, atau klaim afiliasi resmi dengan YouTube; pekerjaan mendatang tidak boleh membuatnya.

## Product Principles

1. Musik harus bisa dimulai dengan sedikit langkah dan feedback status yang selalu jelas.
2. Aktivitas jaringan tidak boleh membekukan kontrol playback atau menghalangi koleksi lokal.
3. Integrasi YouTube harus menjaga privasi lokal dan tidak menyimpan URL stream sementara.
4. Kegagalan parsial harus dapat dipahami dan dipulihkan tanpa merusak library.
5. Fitur baru harus terasa sebagai bagian dari perangkat hi-fi Miles, bukan panel web yang ditempelkan.

## Accessibility & Inclusion

- Semua aksi utama harus dapat digunakan dengan keyboard dan memiliki focus state yang terlihat.
- Status asynchronous tidak hanya dibedakan melalui warna; label dan pesan harus menjelaskan keadaan.
- Motion harus menghormati `prefers-reduced-motion`.
- Teks status dan kontrol harus mempertahankan kontras yang layak pada panel gelap.
