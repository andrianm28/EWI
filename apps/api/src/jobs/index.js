'use strict';
// Job sekali jalan: `node scripts/run-job.js <nama>`. Penjadwalnya timer systemd di etavm2 (PD-15 A),
// disiapkan thread infra. Setiap job aman diulang.
const DEFAULT_IMPORT_BATCH_TTL_DAYS = 7;

const JOBS = {
  // PK-15 butir 2: batch impor yang tidak pernah di-commit dihapus setelah TTL; batch tersimpan tidak menyimpan baris.
  'import-batches-cleanup': async ({ stores, env = process.env, now }) => {
    const days = Number(env.IMPORT_BATCH_TTL_DAYS || DEFAULT_IMPORT_BATCH_TTL_DAYS);
    if (!Number.isFinite(days) || days < 1) throw new Error('IMPORT_BATCH_TTL_DAYS minimal 1');
    return stores.imports.cleanup({ olderThanDays: days, now });
  },
};

async function runJob(name, deps) {
  const job = JOBS[name];
  if (!job) throw new Error(`Job tidak dikenal: ${name}. Tersedia: ${Object.keys(JOBS).join(', ')}`);
  return job(deps);
}

module.exports = { JOBS, runJob, DEFAULT_IMPORT_BATCH_TTL_DAYS };
