'use strict';
// Antrean pekerjaan latar di dalam proses. Dipakai link email (audit 24 Nov, 8-11): pekerjaan yang hanya terjadi
// untuk akun terdaftar dijalankan setelah jawaban dikirim. Pekerjaan dengan kunci sama berjalan berurutan.
// Tidak tahan proses mati: pekerjaan yang belum selesai hilang (pemanggil harus bisa diulang).

/** onError(e, key) dipanggil untuk pekerjaan yang gagal. Antrean tidak pernah melempar, juga bila onError melempar. */
function createBackgroundQueue({ onError = () => {} } = {}) {
  const chains = new Map();
  const pending = new Set();
  const report = (key) => (e) => {
    try { onError(e, key); } catch { /* pencatat galat rusak tidak boleh menjatuhkan proses */ }
  };
  return {
    /** Jalankan fn setelah pekerjaan sebelumnya dengan kunci yang sama selesai. */
    run(key, fn) {
      const p = (chains.get(key) || Promise.resolve()).then(fn).catch(report(key));
      chains.set(key, p);
      pending.add(p);
      p.then(() => {
        pending.delete(p);
        if (chains.get(key) === p) chains.delete(key);
      });
      return p;
    },
    /** Tunggu sampai semua pekerjaan (termasuk yang ditambahkan selama menunggu) selesai. Dipakai test. */
    async drain() {
      while (pending.size) await Promise.all([...pending]);
    },
  };
}

module.exports = { createBackgroundQueue };
