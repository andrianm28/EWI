'use strict';
// Konten modul statis EliteMentor (simulasi) untuk kode course di seed demo ELGOS. Data sintetis.
// quiz: [pertanyaan, pilihan, indeks benar]
const MODULES = {
  'SD-B1': {
    name: 'Root Cause Analysis', level: 'Basic', where: 'Online · dipelajari kapan saja bersama EliteMentor',
    intro: 'Kita akan belajar Root Cause Analysis: menelusuri akar masalah insiden dengan 5 Whys dan diagram tulang ikan. Mulai dari video interaktif atau bahan bacaan?',
    video: 'Video menampilkan satu insiden P2 yang ditelusuri dengan 5 Whys. Poin utama: berhenti bertanya "mengapa" saat sampai pada penyebab yang bisa ditindaklanjuti, bukan pada orang.',
    read: 'Bahan bacaan (PDF, 5 halaman) membahas 5 Whys, diagram tulang ikan (manusia, metode, alat, lingkungan), dan cara menulis tindakan perbaikan.',
    qa: [['5 why', '5 Whys adalah bertanya "mengapa" berulang sampai menemukan penyebab yang bisa diperbaiki. Jumlahnya tidak harus tepat lima.'],
      ['tulang ikan', 'Diagram tulang ikan mengelompokkan kemungkinan penyebab: manusia, metode, alat, dan lingkungan.'],
      ['eskalasi', 'Lakukan RCA singkat sebelum eskalasi agar tim L2 menerima hipotesis penyebab, bukan hanya gejala.']],
    chips: ['Apa itu 5 Whys?', 'Kapan memakai diagram tulang ikan?'],
    quiz: [['Kapan berhenti bertanya "mengapa" pada 5 Whys?', ['Saat penyebab bisa ditindaklanjuti', 'Tepat setelah lima kali', 'Saat menemukan orang yang salah'], 0],
      ['Apa fungsi diagram tulang ikan?', ['Mengelompokkan kemungkinan penyebab', 'Menghitung SLA', 'Membuat jadwal shift'], 0],
      ['Apa yang dikirim ke L2 saat eskalasi?', ['Hipotesis penyebab dan bukti', 'Hanya nomor tiket', 'Tidak perlu apa pun'], 0]],
  },
  'SD-I1': {
    name: 'ITIL Foundation', level: 'Intermediate', where: 'Online · dipelajari kapan saja bersama EliteMentor',
    intro: 'Kita akan belajar dasar ITIL 4: siklus layanan serta praktik Incident dan Problem Management. Mulai dari video atau bahan bacaan?',
    video: 'Video menjelaskan beda insiden dan problem: insiden dipulihkan secepatnya, problem dicari akar masalahnya agar tidak berulang.',
    read: 'Bahan bacaan (PDF, 6 halaman) membahas service value chain, prioritas insiden, dan known error database.',
    qa: [['problem', 'Problem adalah penyebab dari satu atau lebih insiden. Problem Management mencari dan menghilangkan penyebab itu.'],
      ['prioritas', 'Prioritas insiden = dampak × urgensi. Prioritas menentukan target respons SLA.']],
    chips: ['Apa beda insiden dan problem?', 'Bagaimana menentukan prioritas?'],
    quiz: [['Tujuan utama Incident Management?', ['Memulihkan layanan secepatnya', 'Mencari pelaku', 'Menunda tiket'], 0],
      ['Prioritas insiden ditentukan oleh?', ['Dampak dan urgensi', 'Urutan masuk saja', 'Jabatan pelapor'], 0],
      ['Known error database berisi?', ['Problem yang sudah diketahui beserta solusi sementara', 'Daftar karyawan', 'Log absensi'], 0]],
  },
  'IAC-1512': {
    name: 'Workshop Automation & Infrastructure as Code', level: 'Intermediate', offline: true,
    where: 'Workshop offline · Kantor Elitery, Jakarta · Mahaka Institute',
    intro: 'Anda mengikuti workshop Automation & IaC hari ini. Untuk memulai ujian, masukkan kode sesi dari instruktur.',
    qa: [], chips: [],
    quiz: [['Apa keuntungan utama Infrastructure as Code?', ['Konfigurasi konsisten dan bisa diulang', 'Tidak perlu backup', 'Server otomatis lebih murah'], 0],
      ['Mengapa skrip otomasi disimpan di version control?', ['Perubahan terlacak dan bisa di-rollback', 'Agar file lebih kecil', 'Agar tidak perlu review'], 0],
      ['Manakah yang termasuk alat IaC?', ['Terraform', 'Notepad', 'Spreadsheet'], 0]],
  },
};

const GENERIC = {
  level: 'Basic', where: 'Online · dipelajari kapan saja bersama EliteMentor',
  intro: 'Kita akan mempelajari modul ini bersama. Mulai dari video interaktif atau bahan bacaan?',
  video: 'Video merangkum konsep utama modul dan satu contoh penerapan di tim layanan.',
  read: 'Bahan bacaan (PDF) merangkum konsep, contoh kasus, dan daftar periksa penerapan.',
  qa: [], chips: ['Apa poin utama modul ini?'],
  quiz: [['Apa langkah pertama setelah mempelajari modul?', ['Menerapkannya pada satu kasus nyata', 'Melupakannya', 'Menunggu atasan'], 0],
    ['Mengapa hasil penerapan dicatat?', ['Agar bisa dievaluasi dan diperbaiki', 'Tidak perlu dicatat', 'Untuk menambah pekerjaan'], 0],
    ['Siapa yang dikonfirmasi saat pekerjaan selesai?', ['Pemangku kepentingan terkait', 'Tidak ada', 'Vendor lain'], 0]],
};

function moduleFor(code, { offline, title } = {}) {
  const m = MODULES[String(code).toUpperCase()];
  if (m) return m;
  return { ...GENERIC, name: title || code, offline: Boolean(offline),
    where: offline ? 'Pelatihan offline' : GENERIC.where,
    intro: offline ? 'Untuk memulai ujian pelatihan offline ini, masukkan kode sesi dari instruktur.' : GENERIC.intro };
}

module.exports = { MODULES, moduleFor };
