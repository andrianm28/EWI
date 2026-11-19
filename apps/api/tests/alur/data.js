'use strict';
// B18: data fiktif bersama untuk test alur lintas paket dan QA malam (spek 3.2, 5.3).
// Tidak ada nama, email, atau angka karyawan sungguhan. String KENARI dipakai untuk mendeteksi kebocoran:
// bila muncul di payload ke penyedia AI atau di keluaran AI untuk karyawan lain, ada data yang bocor.

const JABATAN = {
  name: 'Agen Layanan L1',
  levels: [{ name: 'Junior', programTier: 'basic' }, { name: 'Senior', programTier: 'intermediate' }],
};

const KOMPETENSI = [
  { kind: 'job', name: 'Menangani eskalasi tiket', source: 'hr_rule', requiredScore: 3 },
  { kind: 'job', name: 'Pengetahuan produk layanan', source: 'hr_rule', requiredScore: 3 },
  { kind: 'core', name: 'Komunikasi pelanggan' },
];

/** Karyawan lain di tenant yang sama. Datanya tidak boleh sampai ke wawancara karyawan yang diuji (PM-10). */
const KARYAWAN_LAIN = {
  nama: 'Bayu Kenari-Lain',
  email: 'bayu.kenari-lain@contoh.test',
  employeeId: 'E-LAIN-01',
  kpi: { name: 'Retensi pelanggan KENARI-LAIN-91C2', target: 90, actual: 70 },
};

/** Tenant lain. Tidak boleh terlihat sama sekali dari tenant yang diuji. */
const TENANT_LAIN = {
  nama: 'PT Kenari Lain',
  karyawan: { nama: 'Dewi Kenari-Tenant', email: 'dewi.kenari-tenant@lain.test', employeeId: 'E-TL-01' },
  kpi: { name: 'Penjualan KENARI-TENANT-4B7E', target: 100, actual: 40 },
};

const PERIODE = '2026-11';

/** Tanggal kalender WIB (YYYY-MM-DD) `geser` hari dari hari ini; sama dengan cara modul LD menghitung "hari ini". */
const ZONA_WIB_MS = 7 * 3600e3;
const tanggalWib = (geser = 0) => new Date(Date.now() + ZONA_WIB_MS + geser * 86400e3).toISOString().slice(0, 10);

/** Semua string yang tidak boleh muncul di payload atau keluaran AI untuk karyawan yang diuji. */
const TERLARANG = {
  kenari: [KARYAWAN_LAIN.kpi.name, TENANT_LAIN.kpi.name],
  nama: [KARYAWAN_LAIN.nama, TENANT_LAIN.karyawan.nama],
  email: [KARYAWAN_LAIN.email, TENANT_LAIN.karyawan.email],
};

module.exports = { JABATAN, KOMPETENSI, KARYAWAN_LAIN, TENANT_LAIN, PERIODE, TERLARANG, tanggalWib };
