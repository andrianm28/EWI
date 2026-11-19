'use strict';
// PRJ-6/T4 (PM-8 E): pengingat email H-3 dan H-1 sebelum undangan wawancara berakhir.
// Dijalankan sekali jalan oleh timer systemd di etavm2 (PD-15 A): `node scripts/run-job.js interview-reminders`.
// Aman dijalankan berulang: tiap jenis pengingat ditandai per sesi dan hanya terkirim sekali.
const { dueReminder, reminderMessage } = require('../modules/interviews/invitation');

/**
 * stores.interviews: reminderCandidates({ now, withinDays }), markReminded(tenantId, id, kind, at)
 * stores.audit (opsional): insert(row)
 */
async function runInterviewReminders({ stores, mailer, appBaseUrl, now = new Date(), log = () => {} }) {
  const candidates = await stores.interviews.reminderCandidates({ now, withinDays: 4 });
  const summary = { checked: candidates.length, h3: 0, h1: 0, failed: 0 };
  for (const s of candidates) {
    const kind = dueReminder(s, now);
    if (!kind) continue;
    // Tandai dulu: bila dua job berjalan bersamaan, hanya satu yang mengirim
    if (!(await stores.interviews.markReminded(s.tenantId, s.id, kind, now))) continue;
    try {
      await mailer.send({ to: s.email, ...reminderMessage({ kind, name: s.name, tenantName: s.tenantName, submodule: s.submodule, inviteExpiresAt: s.inviteExpiresAt, appBaseUrl }) });
    } catch (e) {
      // Kirim gagal: tanda dilepas supaya dicoba lagi pada run berikutnya
      await stores.interviews.clearReminded(s.tenantId, s.id, kind);
      summary.failed += 1;
      log(`gagal mengirim pengingat ${kind} sesi ${s.id}: ${e.message}`);
      continue;
    }
    summary[kind] += 1;
    if (!stores.audit) continue;
    try {
      // Email sudah terkirim: audit gagal tidak melepas tanda (tidak kirim ulang), tetapi job dilaporkan gagal
      await stores.audit.insert({
        tenantId: s.tenantId, userId: null, action: 'create', resource: `${s.submodule}.interview_reminder`,
        meta: { job: 'interview-reminders', kind, employeeIds: [s.userId], objectType: 'interview_session', objectIds: [s.id] }, at: now,
      });
    } catch (e) {
      summary.failed += 1;
      log(`pengingat ${kind} sesi ${s.id} terkirim, tetapi audit gagal: ${e.message}`);
    }
  }
  return summary;
}

module.exports = { runInterviewReminders };
