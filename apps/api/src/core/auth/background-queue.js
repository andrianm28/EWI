'use strict';
// Audit 24 Nov (8-11): pekerjaan yang hanya terjadi untuk akun terdaftar (cek batas, simpan link, kirim email,
// audit) dijalankan setelah jawaban dikirim, supaya waktu jawab tidak membedakan email terdaftar dan tidak.
// Pekerjaan dengan kunci sama berjalan berurutan (batas 3 link per 15 menit tetap dihitung benar).

/** onError(e) dipanggil untuk pekerjaan yang gagal; antrean tidak pernah melempar. */
function createBackgroundQueue({ onError = () => {} } = {}) {
  const chains = new Map();
  const pending = new Set();
  return {
    /** Jalankan fn setelah pekerjaan sebelumnya dengan kunci yang sama selesai. */
    run(key, fn) {
      const p = (chains.get(key) || Promise.resolve()).then(fn).catch(onError);
      chains.set(key, p);
      pending.add(p);
      p.finally(() => {
        pending.delete(p);
        if (chains.get(key) === p) chains.delete(key);
      });
      return p;
    },
    /** Tunggu sampai semua pekerjaan (termasuk yang ditambahkan selama menunggu) selesai. Dipakai test dan saat berhenti. */
    async drain() {
      while (pending.size) await Promise.all([...pending]);
    },
  };
}

module.exports = { createBackgroundQueue };
