# ELGOS

ELGOS (Elite Learning & Growth Operating System) membantu HR menemukan kebutuhan belajar karyawan dari gap kompetensi dan target kerja, lalu memisahkannya dari masalah yang bukan soal pelatihan.

## Language

### Training Needs (TNA)

**Gap**:
Selisih antara yang diharapkan dan yang tercapai pada satu kompetensi jabatan (skor asesmen di bawah target Job Competency Model) atau pada satu target kerja OKR/KPI/SLA dalam satu periode.
_Avoid_: masalah, kekurangan, isu

**Gap kompetensi**:
Gap terhadap satu kompetensi jabatan yang sudah disahkan HR; hanya dihitung untuk karyawan yang posisinya memakai kompetensi itu.
_Avoid_: gap skill

**Gap OKR**:
Gap terhadap satu target kerja (OKR, KPI, atau SLA) pada satu periode, di luar toleransi target itu.
_Avoid_: gap kinerja, target merah

**Penugasan wawancara**:
Permintaan HR atau atasan agar karyawan yang terdampak satu gap menjalani wawancara akar masalah sebelum tenggat tertentu.
_Avoid_: undangan, jadwal TNA

**Wawancara akar masalah**:
Wawancara AI dengan satu karyawan untuk mencari penyebab sebuah gap dan membedakan penyebab yang bisa diatasi pelatihan dari yang tidak.
_Avoid_: interview TNA, asesmen

**Ringkasan temuan**:
Daftar temuan wawancara yang diperiksa karyawan sendiri sebelum dikirim ke HR; yang dikirim menjadi bahan tinjauan HR.
_Avoid_: hasil analisis, laporan wawancara

**Training Needs**:
Temuan yang penyebabnya pengetahuan atau keterampilan, sehingga bisa diatasi dengan pelatihan.
_Avoid_: kebutuhan training (di teks bebas boleh), TNA (TNA adalah submodulnya)

**Improvement Needs**:
Temuan yang penyebabnya di luar pelatihan, misalnya SOP, tools, sistem, akses, beban kerja, atau koordinasi.
_Avoid_: non-training needs, temuan non-pelatihan (istilah teknis lama)

**Perlu ditinjau HR**:
Keadaan gap yang sudah diwawancarai tetapi temuannya belum disetujui HR atau berisi Training Needs dan Improvement Needs sekaligus.
_Avoid_: pending review

**Ditahan**:
Keadaan satu temuan yang HR tandai "Perlu ditinjau HR" di layar tinjauan: temuan tetap belum disetujui dan belum terlihat di luar antrean. Berbeda dari keadaan gap **Perlu ditinjau HR**.
_Avoid_: pending, hold (di teks bebas)

**Belum diwawancarai**:
Keadaan gap yang belum punya wawancara selesai maupun temuan apa pun.
_Avoid_: pending, belum dianalisis

### Platform

**Tenant**:
Satu perusahaan klien beserta seluruh datanya di ELGOS; data satu tenant tidak pernah terlihat oleh tenant lain.
_Avoid_: organisasi (di teks UI boleh), klien, org

**Super Admin**:
Orang tim ETA yang mengelola semua tenant dari konsol platform: membuat tenant, menyalakan modul, dan mengatur konfigurasi platform. Tidak melihat isi jawaban wawancara karyawan.
_Avoid_: Admin ETA (nama lama di kode: `eta_admin`), superuser

**Admin Tenant**:
Orang di perusahaan klien yang menyiapkan tenantnya sendiri: pengguna dan peran, jabatan, dan impor data.
_Avoid_: admin HR, admin klien

**Modul tenant**:
Satu dari delapan modul ELGOS (misalnya Training Needs) yang dinyalakan atau dimatikan Super Admin untuk satu tenant.
_Avoid_: fitur, submodul (submodul adalah istilah lama untuk CCA/DNA/TNA/INA)

**Konfigurasi platform**:
Kebijakan yang berlaku untuk semua tenant, misalnya batas waktu sesi dan target kesepakatan AI–HR.
_Avoid_: pengaturan tenant (itu milik satu tenant)

**Kesepakatan AI–HR**:
Persentase temuan AI yang disetujui HR tanpa diubah saat tinjauan; dipantau harian sebagai angka pendamping, bukan angka akurasi resmi (PM-2).
_Avoid_: akurasi AI

**Log audit platform**:
Catatan tindakan Super Admin yang tidak milik satu tenant atau menyentuh tenant lain, misalnya membuat tenant, menyalakan modul tenant, dan mengubah konfigurasi platform.
_Avoid_: log platform, audit tenant (itu catatan per tenant)

**Hitungan percobaan**:
Jumlah percobaan masuk per jam ke tenant atau akun yang tidak dikenal, tanpa identitas siapa pun.
_Avoid_: log percobaan, log login

### Privasi karyawan

**Tarik persetujuan**:
Permintaan karyawan untuk menghentikan wawancara akar masalah yang sudah atau akan ia setujui; datanya tetap tersimpan sampai HR menghapusnya.
_Avoid_: cabut consent, hapus wawancara

**Permintaan data**:
Permintaan karyawan atas datanya sendiri yang harus ditindaklanjuti HR: tarik persetujuan atau hapus data.
_Avoid_: tiket privasi, request DSR

### Integrasi EliteMentor (LTI)

**Tool LTI**:
Aplikasi belajar yang diluncurkan dari ELGOS lewat LTI 1.3, saat ini EliteMentor; terdaftar per tenant dengan client_id dan deployment_id.
_Avoid_: plugin, app eksternal

**Resource link**:
Satu modul EliteMentor yang ditugaskan ke karyawan (dari rencana belajar) atau ke peserta pelatihan offline; dibuat saat HR menekan "Tugaskan di EliteMentor".
_Avoid_: enrollment, penugasan REST

**Tiket peluncuran**:
Bukti sekali pakai berumur 5 menit yang mengikat karyawan, resource link, dan tool selama perpindahan browser ke EliteMentor.
_Avoid_: token login, SSO

**AGS**:
Layanan nilai LTI (Assignment and Grade Services) tempat tool mengirim progres dan skor kembali ke ELGOS.
_Avoid_: webhook nilai, sync back
