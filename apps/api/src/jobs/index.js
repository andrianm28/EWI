'use strict';
// Daftar job terjadwal (PD-15 A). Tiap job = fungsi sekali jalan yang dipanggil scripts/run-job.js
// oleh timer systemd milik infra. Tidak ada penjadwal di dalam proses API. Setiap job aman diulang.
const { runInterviewReminders } = require('./interview-reminders');

const { DEFAULTS } = require('../core/settings');

const DEFAULT_IMPORT_BATCH_TTL_DAYS = 7;

const JOBS = Object.freeze({
  // PRJ-6/T4: pengingat H-3 dan H-1 sebelum undangan wawancara berakhir.
  'interview-reminders': runInterviewReminders,
  // PK-15 butir 2: batch impor yang tidak pernah di-commit dihapus setelah TTL; batch tersimpan tidak menyimpan baris.
  'import-batches-cleanup': async ({ stores, env = process.env, now }) => {
    const days = Number(env.IMPORT_BATCH_TTL_DAYS || DEFAULT_IMPORT_BATCH_TTL_DAYS);
    if (!Number.isFinite(days) || days < 1) throw new Error('IMPORT_BATCH_TTL_DAYS minimal 1');
    return stores.imports.cleanup({ olderThanDays: days, now });
  },
  // B17: log Asisten ELGOS dihapus setelah assistant.retentionDays tenant (1-365, selain itu 90). Harian.
  'assistant-logs-cleanup': ({ stores }) => stores.assistant.cleanup({ defaultDays: DEFAULTS.assistant.retentionDays }),
});

function getJob(name) {
  return Object.prototype.hasOwnProperty.call(JOBS, name) ? JOBS[name] : null;
}

async function runJob(name, deps) {
  const job = getJob(name);
  if (!job) throw new Error(`Job tidak dikenal: ${name}. Tersedia: ${Object.keys(JOBS).join(', ')}`);
  return job(deps);
}

module.exports = { JOBS, getJob, runJob, DEFAULT_IMPORT_BATCH_TTL_DAYS };
