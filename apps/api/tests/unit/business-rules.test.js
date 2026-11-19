// PK-23: aturan bisnis wajib saat live (PM-8 ★ B+C+D+E, PM-6 ★ B, PD-15 ★ A). Satu blok per aturan.
const { PLAN_STATUSES, PLAN_STATUS_LABEL, initialStatus, canTransition } = require('../../src/modules/tna/plan-status');
const inv = require('../../src/modules/interviews/invitation');
const { runInterviewReminders } = require('../../src/jobs/interview-reminders');
const { getJob } = require('../../src/jobs');
const { FLAGS, createFlagService } = require('../../src/core/flags');
const { memoryMailer } = require('../../src/integrations/mailer');

const DAY = inv.DAY_MS;
// 18 Nov 2026 08.00 WIB = 01.00 UTC
const NOW = new Date('2026-11-18T01:00:00Z');
const at = (days, hoursUtc = 1) => new Date(Date.UTC(2026, 10, 18 + days, hoursUtc));

describe('K-3 (PM-8 C): status rencana Diminta, Baru, Berjalan, Selesai, Ditolak', () => {
  it('lima status dengan label Indonesia', () => {
    expect(PLAN_STATUSES).toEqual(['requested', 'new', 'in_progress', 'completed', 'rejected']);
    expect(PLAN_STATUSES.map((s) => PLAN_STATUS_LABEL[s])).toEqual(['Diminta', 'Baru', 'Berjalan', 'Selesai', 'Ditolak']);
  });
  it('permintaan karyawan mulai Diminta, usulan HR/AI mulai Baru', () => {
    expect(initialStatus('learner_request')).toBe('requested');
    expect(initialStatus('hr')).toBe('new');
    expect(initialStatus('ai')).toBe('new');
  });
  it('hanya maju berurutan; Ditolak sebelum selesai; Selesai/Ditolak final', () => {
    expect(canTransition('requested', 'new')).toBe(true);
    expect(canTransition('new', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'completed')).toBe(true);
    expect(canTransition('requested', 'rejected')).toBe(true);
    expect(canTransition('in_progress', 'rejected')).toBe(true);
    expect(canTransition('requested', 'completed')).toBe(false);
    expect(canTransition('new', 'completed')).toBe(false);
    expect(canTransition('completed', 'rejected')).toBe(false);
    expect(canTransition('rejected', 'new')).toBe(false);
  });
});

describe('BT-31 ditunda (PM-8 B) dan non-training hanya HR (PM-6 B): flag default mati', () => {
  it('kedua flag dikenal dan mati tanpa pengaturan tenant', async () => {
    const flags = createFlagService({ getTenantFlags: async () => ({}) });
    expect(await flags.isEnabled('t-1', FLAGS.TNA_TRAINING_REQUEST)).toBe(false);
    expect(await flags.isEnabled('t-1', FLAGS.TNA_NON_TRAINING_HR)).toBe(false);
  });
});

describe('Q38 (PM-8 D): undangan berlaku 7 hari, bisa diperpanjang HR', () => {
  it('batas = 7 hari sejak dijadwalkan', () => {
    expect(inv.inviteExpiry(NOW).getTime() - NOW.getTime()).toBe(7 * DAY);
  });
  it('kedaluwarsa tepat pada batasnya', () => {
    expect(inv.isExpired(at(1), NOW)).toBe(false);
    expect(inv.isExpired(NOW, NOW)).toBe(true);
    expect(inv.isExpired(at(-1), NOW)).toBe(true);
  });
  it('perpanjangan dari batas lama, atau dari sekarang bila sudah lewat', () => {
    expect(inv.extendedExpiry(at(2), 7, NOW)).toEqual(at(9));
    expect(inv.extendedExpiry(at(-3), 7, NOW)).toEqual(at(7));
  });
  it('jumlah hari: default 7, 1-30, bilangan bulat', () => {
    expect(inv.parseExtendDays(undefined)).toBe(7);
    expect(inv.parseExtendDays(14)).toBe(14);
    expect(inv.parseExtendDays(0)).toBeNull();
    expect(inv.parseExtendDays(31)).toBeNull();
    expect(inv.parseExtendDays(1.5)).toBeNull();
    expect(inv.parseExtendDays('abc')).toBeNull();
  });
});

describe('PRJ-6 (PM-8 E): pengingat H-3 dan H-1 per tanggal WIB', () => {
  const open = (expiresAt, extra = {}) => ({ status: 'scheduled', inviteExpiresAt: expiresAt, reminderH3At: null, reminderH1At: null, ...extra });
  it('H-3 dan H-2 → h3; H-1 dan hari terakhir → h1; lebih jauh → tidak ada', () => {
    expect(inv.dueReminder(open(at(4)), NOW)).toBeNull();
    expect(inv.dueReminder(open(at(3)), NOW)).toBe('h3');
    expect(inv.dueReminder(open(at(2)), NOW)).toBe('h3');
    expect(inv.dueReminder(open(at(1)), NOW)).toBe('h1');
    expect(inv.dueReminder(open(at(0, 10)), NOW)).toBe('h1'); // hari terakhir, 17.00 WIB
  });
  it('batas 23.30 WIB tanggal 21 Nov dihitung H-3 dari 18 Nov (bukan per 24 jam)', () => {
    expect(inv.daysLeft(new Date('2026-11-21T16:30:00Z'), NOW)).toBe(3);
  });
  it('tidak dikirim dua kali, tidak untuk sesi selesai atau undangan lewat', () => {
    expect(inv.dueReminder(open(at(3), { reminderH3At: NOW }), NOW)).toBeNull();
    expect(inv.dueReminder(open(at(1), { reminderH1At: NOW }), NOW)).toBeNull();
    expect(inv.dueReminder(open(at(1), { status: 'completed' }), NOW)).toBeNull();
    expect(inv.dueReminder(open(at(-1)), NOW)).toBeNull();
    expect(inv.dueReminder(open(at(2), { status: 'in_progress' }), NOW)).toBe('h3');
  });
  it('isi email menyebut batas WIB dan halaman masuk, tanpa token', () => {
    const m = inv.reminderMessage({ kind: 'h3', name: 'Dimas', tenantName: 'ELGOS', submodule: 'tna', inviteExpiresAt: at(3), appBaseUrl: 'https://app.test' });
    expect(m.subject).toMatch(/TNA.*3 hari/);
    expect(m.text).toMatch(/21 November 2026/);
    expect(m.text).toMatch(/https:\/\/app\.test\/masuk/);
    expect(m.text).not.toMatch(/token/);
  });
});

describe('PD-15 A: job pengingat sekali jalan', () => {
  function fakeStores(rows) {
    const marks = new Set(); const audit = [];
    return {
      audit,
      marks,
      stores: {
        interviews: {
          reminderCandidates: async () => rows,
          markReminded: async (_t, id, kind) => { const k = `${id}:${kind}`; if (marks.has(k)) return false; marks.add(k); return true; },
          clearReminded: async (_t, id, kind) => { marks.delete(`${id}:${kind}`); },
        },
        audit: { insert: async (r) => { audit.push(r); } },
      },
    };
  }
  const row = (id, expiresAt, extra = {}) => ({ id, tenantId: 't-1', submodule: 'tna', status: 'scheduled', inviteExpiresAt: expiresAt, reminderH3At: null, reminderH1At: null, userId: `u-${id}`, email: `${id}@x.test`, name: id, tenantName: 'ELGOS', ...extra });

  it('terdaftar di registry dengan nama interview-reminders', () => {
    expect(getJob('interview-reminders')).toBe(runInterviewReminders);
    expect(getJob('tidak-ada')).toBeNull();
    expect(getJob('toString')).toBeNull();
  });
  it('mengirim h3/h1 sesuai jatuh tempo, sekali saja walau dijalankan ulang, dan diaudit', async () => {
    const f = fakeStores([row('a', at(3)), row('b', at(1)), row('c', at(5))]);
    const mailer = memoryMailer();
    const first = await runInterviewReminders({ stores: f.stores, mailer, appBaseUrl: 'https://app.test', now: NOW });
    expect(first).toEqual({ checked: 3, h3: 1, h1: 1, failed: 0 });
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(['a@x.test', 'b@x.test']);
    expect(f.audit.map((a) => a.resource)).toEqual(['tna.interview_reminder', 'tna.interview_reminder']);
    const again = await runInterviewReminders({ stores: f.stores, mailer, appBaseUrl: 'https://app.test', now: NOW });
    expect(again).toMatchObject({ h3: 0, h1: 0 });
    expect(mailer.sent).toHaveLength(2);
  });
  it('kirim gagal: tanda dilepas agar dicoba lagi', async () => {
    const f = fakeStores([row('a', at(3))]);
    const broken = { send: async () => { throw new Error('SES down'); } };
    const res = await runInterviewReminders({ stores: f.stores, mailer: broken, appBaseUrl: 'x', now: NOW });
    expect(res.failed).toBe(1);
    expect(f.marks.size).toBe(0);
  });
  it('audit gagal setelah email terkirim: tidak dikirim ulang, job dilaporkan gagal', async () => {
    const f = fakeStores([row('a', at(3))]);
    f.stores.audit.insert = async () => { throw new Error('db'); };
    const mailer = memoryMailer();
    const res = await runInterviewReminders({ stores: f.stores, mailer, appBaseUrl: 'x', now: NOW });
    expect(res).toMatchObject({ h3: 1, failed: 1 });
    expect(f.marks.size).toBe(1);
  });
});
