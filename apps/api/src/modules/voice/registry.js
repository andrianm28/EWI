'use strict';
// B19 4.3: paling banyak satu sesi suara per sesi wawancara di proses ini. Hanya mempercepat penghentian;
// penulis lama ditolak oleh voice_epoch di database.
function createVoiceRegistry() {
  const live = new Map();
  return {
    /** Daftarkan sesi suara baru; yang lama untuk sesi wawancara yang sama dihentikan (superseded). */
    add(sessionId, vs) {
      const old = live.get(sessionId);
      live.set(sessionId, vs);
      if (old && old !== vs) old.stop('superseded');
    },
    remove(sessionId, vs) { if (live.get(sessionId) === vs) live.delete(sessionId); },
    get: (sessionId) => live.get(sessionId) || null,
    stop(sessionId, reason) {
      const vs = live.get(sessionId);
      if (!vs) return Promise.resolve(false);
      live.delete(sessionId);
      return Promise.resolve(vs.stop(reason)).then(() => true);
    },
    /** SIGTERM: hentikan semua sesi suara (giliran terbuka disimpan, biaya dicatat). */
    async stopAll(reason) { await Promise.all([...live.keys()].map((id) => this.stop(id, reason))); },
    get size() { return live.size; },
  };
}

module.exports = { createVoiceRegistry };
