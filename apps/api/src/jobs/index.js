'use strict';
// Daftar job terjadwal (PD-15 A). Tiap job = fungsi sekali jalan yang dipanggil scripts/run-job.js
// oleh timer systemd milik infra. Tidak ada penjadwal di dalam proses API.
const { runInterviewReminders } = require('./interview-reminders');

const JOBS = Object.freeze({
  'interview-reminders': runInterviewReminders,
});

function getJob(name) {
  return Object.prototype.hasOwnProperty.call(JOBS, name) ? JOBS[name] : null;
}

module.exports = { JOBS, getJob };
