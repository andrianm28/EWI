'use strict';
// PK-07 / I-6 (PD-19 butir 2): kesiapan vs kesehatan.
// - /api/health: proses hidup, tanpa I/O (liveness, healthcheck compose).
// - /api/ready : 200 hanya bila database bisa dikueri DAN penyedia enkripsi (KMS/lokal) bisa membuka kunci.
//   Dipakai deploy.sh untuk memutuskan deploy berhasil atau rollback. Detail error hanya ke log, tidak ke respons.

const DEFAULT_TIMEOUT_MS = 3000;

function withTimeout(promise, ms, name) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${name}: batas waktu ${ms} ms`)), ms); }),
  ]);
}

/**
 * checks: { [nama]: async () => void | string }  (lempar error = gagal; string = keterangan ok)
 * Pemeriksaan wajib yang tidak tersedia dihitung gagal, sehingga salah rakit tidak lolos sebagai "siap".
 */
function createReadiness({ checks = {}, required = ['database', 'encryption'], timeoutMs = DEFAULT_TIMEOUT_MS, logger = console } = {}) {
  return async function readiness() {
    const result = {};
    let ok = true;
    const names = [...new Set([...required, ...Object.keys(checks)])];
    await Promise.all(names.map(async (name) => {
      const fn = checks[name];
      if (typeof fn !== 'function') { ok = false; result[name] = 'tidak_dikonfigurasi'; return; }
      try {
        await withTimeout(Promise.resolve().then(fn), timeoutMs, name);
        result[name] = 'ok';
      } catch (e) {
        ok = false;
        result[name] = 'gagal';
        logger.error(`[ready] ${name} gagal: ${e.message}`);
      }
    }));
    // urutan tetap (sesuai daftar), bukan urutan selesai
    return { ok, checks: Object.fromEntries(names.map((n) => [n, result[n]])) };
  };
}

function readyHandler(readiness) {
  return async (_req, res) => {
    const { ok, checks } = await readiness();
    res.set('Cache-Control', 'no-store');
    res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'not_ready', checks });
  };
}

module.exports = { createReadiness, readyHandler };
