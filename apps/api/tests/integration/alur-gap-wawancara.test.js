'use strict';
// B18 test alur "Gap ke wawancara akar masalah (B5, B6)" (spek b18 bagian 3.3). Lewat API sungguhan, Postgres,
// dan penyedia stub, memakai tests/alur/driver.js. Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan.
const crypto = require('crypto');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { FLAGS } = require('../../src/core/flags');
const { makeConfig } = require('../helpers');
const { siapkanTenant, tambahPengguna, pembuatMasuk, hapusTenant, langkah, siapkanTenantKenari, kodeGalat } = require('../alur/driver');
const { JABATAN, KOMPETENSI, KARYAWAN_LAIN, TERLARANG, PERIODE } = require('../alur/data');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const KPI = 'First Contact Resolution (%)';
// Jawaban tanpa kata petunjuk non-pelatihan di stub (sop, tools, sistem, akses, ...), jadi temuannya hanya pelatihan
const JAWABAN = ['Saya belum paham langkah eskalasi pelanggan yang marah.', 'Saya butuh contoh percakapan yang baik.'];
const wibDate = (offsetDays) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(Date.now() + offsetDays * 86400_000));

run('Alur gap ke wawancara akar masalah (B5, B6)', () => {
  let db; let a; let projectId; let ref; let sid; let temuanKaryawan;
  const tenantIds = [];
  const orang = {};
  const slug = `alur-gap-${crypto.randomBytes(3).toString('hex')}`;
  const barisKpi = async (siapa) => (await a.gap.okr(siapa, PERIODE)).find((r) => r.name === KPI);

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const config = makeConfig();
    let st;
    a = langkah(createApp({ config, stores: (st = createStores(db)), ai: createStubProvider() }), pembuatMasuk(config, st.authSessions));

    const t = await siapkanTenant(db, {
      slug,
      flags: [FLAGS.MODULE_DNA, FLAGS.MODULE_TNA, FLAGS.TNA_GAP_BOARD, FLAGS.TNA_INTERVIEW_ASSIGNMENT, FLAGS.TNA_INTERVIEW_SUMMARY],
    });
    tenantIds.push(t.id);
    orang.hr = await tambahPengguna(db, t.id, { nama: 'HR Contoh', email: `hr@${slug}.test`, employeeId: 'E-HR', peran: 'hr_admin' });
    orang.atasan = await tambahPengguna(db, t.id, { nama: 'Atasan Contoh', email: `atasan@${slug}.test`, employeeId: 'E-SPV', peran: 'supervisor' });
    orang.karyawan = await tambahPengguna(db, t.id, {
      nama: 'Rina Contoh', email: `rina@${slug}.test`, employeeId: 'E-UJI-01', peran: 'learner', atasanId: orang.atasan.id,
    });
    orang.lain = await tambahPengguna(db, t.id, { nama: KARYAWAN_LAIN.nama, email: KARYAWAN_LAIN.email, employeeId: KARYAWAN_LAIN.employeeId, peran: 'learner' });

    const role = await a.dna.buatJabatan(orang.hr, JABATAN, KOMPETENSI);
    await a.dna.tempatkan(orang.hr, orang.karyawan, role);
    await a.dna.tempatkan(orang.hr, orang.lain, role);
    projectId = await a.buatProyek(orang.hr, 'Alur gap');
    await a.tna.imporKinerja(orang.hr, {
      period: PERIODE,
      projectId,
      rows: [
        { employeeId: orang.karyawan.employeeId, metricType: 'kpi', name: KPI, target: 80, actual: 62 },
        { employeeId: orang.lain.employeeId, metricType: 'kpi', ...KARYAWAN_LAIN.kpi },
      ],
    });
    tenantIds.push((await siapkanTenantKenari(db, a, slug)).id);
  });

  afterAll(async () => {
    await hapusTenant(db, tenantIds);
    await db.close();
  });

  it('HR membuka papan gap: gap OKR meleset "Belum diwawancarai", tanpa data tenant lain', async () => {
    const rows = await a.gap.okr(orang.hr, PERIODE);
    const row = rows.find((r) => r.name === KPI);
    expect(row).toMatchObject({ kind: 'okr', classification: 'pending', peopleMissed: 1, assignedCount: 0, interviewedCount: 0 });
    expect(JSON.stringify(rows)).not.toContain(TERLARANG.kenari[1]);
    ref = a.gap.refDari(row);
    const detail = await a.gap.detail(orang.hr, ref);
    expect(detail.employees.map((e) => e.id)).toEqual([orang.karyawan.id]);
    expect(detail.employees[0]).toMatchObject({ isMet: false, assignable: true, session: null });
  });

  it('HR menugaskan wawancara 15 menit; atasan yang bukan penugas tidak bisa membatalkan, HR bisa', async () => {
    const body = { projectId, gap: ref, mode: 'affected', dueDate: wibDate(5), durationMinutes: 15 };
    const pertama = await a.gap.tugaskan(orang.hr, body);
    expect(pertama.status).toBe(201);
    const batal = pertama.body.data.assigned[0].sessionId;
    const ditolak = await a.gap.batalkan(orang.atasan, batal);
    expect(ditolak.status).toBe(403);
    expect(kodeGalat(ditolak)).toBe('NOT_ASSIGNER');
    expect((await a.gap.batalkan(orang.hr, batal)).status).toBe(200);

    const kedua = await a.gap.tugaskan(orang.hr, body);
    expect(kedua.status).toBe(201);
    expect(kedua.body.data.assigned).toHaveLength(1);
    const detail = await a.gap.detail(orang.hr, ref);
    expect(detail.employees[0].session).toMatchObject({ status: 'scheduled', open: true, assignedBy: orang.hr.id, projectId });
    sid = detail.employees[0].session.id;
    expect((await barisKpi(orang.hr)).assignedCount).toBe(1);
  });

  it('karyawan melihat topik, durasi, dan tenggat; menjawab paling banyak 5 pertanyaan; ringkasan mengunci percakapan', async () => {
    const [mine] = await a.tna.sesiSaya(orang.karyawan);
    expect(mine).toMatchObject({ id: sid, focusLabel: KPI, durationMinutes: 15, inviteExpiresAt: expect.any(String) });

    const w = await a.tna.jalankanWawancara(orang.karyawan, sid, (i) => JAWABAN[i % JAWABAN.length]);
    expect(w.gagal).toBeNull();
    expect(w.pertanyaan.length).toBeGreaterThan(0);
    expect(w.pertanyaan.length).toBeLessThanOrEqual(5);
    expect(await a.tna.sesi(orang.karyawan, sid)).toMatchObject({ questionLimit: 5, step: 'chat' });

    const r = await a.tna.ringkasan(orang.karyawan, sid);
    expect(r.status).toBe(201);
    const terkunci = await a.tna.jawab(orang.karyawan, sid, 'Tambahan');
    expect(terkunci.status).toBe(409);
    expect(kodeGalat(terkunci)).toBe('SUMMARY_PENDING');
  });

  it('"Ulangi wawancara" sekali, lalu "Sesuai, kirim ke HR"; temuan HR sama dengan yang dilihat karyawan', async () => {
    const ulang = await a.tna.ulangi(orang.karyawan, sid);
    expect(ulang.status).toBe(200);
    expect(ulang.body.data).toMatchObject({ status: 'scheduled', restartCount: 1, restartsLeft: 1 });
    expect(await a.tna.sesi(orang.karyawan, sid)).toMatchObject({ step: 'consent', answerCount: 0 });

    const w = await a.tna.jalankanWawancara(orang.karyawan, sid, (i) => JAWABAN[i % JAWABAN.length]);
    expect(w.gagal).toBeNull();
    const r = await a.tna.ringkasan(orang.karyawan, sid);
    expect(r.status).toBe(201);
    temuanKaryawan = r.body.data.findings;
    expect(temuanKaryawan.length).toBeGreaterThan(0);
    expect(temuanKaryawan.every((f) => f.category === 'training')).toBe(true);

    const kirim = await a.tna.kirimRingkasan(orang.karyawan, sid, {});
    expect(kirim.status).toBe(202);
    expect(kirim.body.data.summaryState).toBe('confirmed');
    await a.tungguAnalisis();

    const antrean = (await a.tna.antreanReview(orang.hr, projectId)).filter((f) => f.sessionId === sid);
    expect(antrean.map((f) => f.title)).toEqual(temuanKaryawan.map((f) => f.title));
    expect(antrean.every((f) => f.summaryState === 'confirmed')).toBe(true);
    expect(JSON.stringify(antrean)).not.toMatch(new RegExp(TERLARANG.kenari.join('|')));
  });

  it('ringkasan hanya untuk karyawan: atasan dan HR mendapat 403 SUMMARY_PRIVATE', async () => {
    expect((await a.tna.bacaRingkasan(orang.karyawan, sid)).status).toBe(200);
    for (const siapa of [orang.atasan, orang.hr]) {
      const res = await a.tna.bacaRingkasan(siapa, sid);
      expect(res.status).toBe(403);
      expect(kodeGalat(res)).toBe('SUMMARY_PRIVATE');
    }
  });

  it('gap pindah ke "Perlu ditinjau HR", lalu Training Needs setelah HR menyetujui temuan', async () => {
    expect(await barisKpi(orang.hr)).toMatchObject({ classification: 'review', interviewedCount: 1 });
    const antrean = (await a.tna.antreanReview(orang.hr, projectId)).filter((f) => f.sessionId === sid);
    for (const f of antrean) await a.tna.reviewTemuan(orang.hr, f.id, { decision: 'approve' });
    expect((await barisKpi(orang.hr)).classification).toBe('training');
    expect((await barisKpi(orang.atasan)).classification).toBe('training');
    const sum = await a.gap.ringkasan(orang.hr);
    expect(sum.classification.training).toBeGreaterThanOrEqual(1);
  });
});
