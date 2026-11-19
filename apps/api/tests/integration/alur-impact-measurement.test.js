'use strict';
// B18 test alur (spek 3.3 baris "Pengukuran dampak belajar", B15): kamus DNA → library modul (B13) → pelatihan
// offline dengan skor vendor (B14) → rencana pengukuran HR → rantai bukti memakai skor post dari Learning Delivery →
// atasan mengisi skor kinerja timnya saja → HR menjadwalkan wawancara ulang per karyawan. Atasan tidak melihat
// antrean; tanpa paket full_suite rute ditolak; tenant lain tidak melihat rencana.
const crypto = require('crypto');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { FLAGS } = require('../../src/core/flags');
const { makeConfig } = require('../helpers');
const { siapkanTenant, tambahPengguna, pembuatMasuk, hapusTenant, langkah, kodeGalat } = require('../alur/driver');
const { JABATAN, KOMPETENSI, KARYAWAN_LAIN, TENANT_LAIN } = require('../alur/data');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const hari = (n) => new Date(Date.now() + 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
const FLAG_LIM = [FLAGS.MODULE_DNA, FLAGS.MODULE_LI, FLAGS.MODULE_LD, FLAGS.MODULE_LIM];

run('Alur pengukuran dampak belajar (HR, atasan)', () => {
  let db; let a; const tenantIds = [];
  const orang = {}; let tenant; let modul; let rencana;
  const slug = `alur-lim-${crypto.randomBytes(3).toString('hex')}`;
  const [kEskalasi, kProduk] = KOMPETENSI.filter((k) => k.kind === 'job').map((k) => k.name);

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const config = makeConfig();
    a = langkah(createApp({ config, stores: createStores(db), ai: createStubProvider() }), pembuatMasuk(config));

    tenant = await siapkanTenant(db, { slug, flags: FLAG_LIM });
    tenantIds.push(tenant.id);
    orang.hr = await tambahPengguna(db, tenant.id, { nama: 'HR Contoh', email: `hr@${slug}.test`, employeeId: 'E-HR', peran: 'hr_admin' });
    orang.atasan = await tambahPengguna(db, tenant.id, { nama: 'Atasan Contoh', email: `atasan@${slug}.test`, employeeId: 'E-SPV', peran: 'supervisor' });
    orang.karyawan = await tambahPengguna(db, tenant.id, {
      nama: 'Rina Contoh', email: `rina@${slug}.test`, employeeId: 'E-UJI-01', peran: 'learner', atasanId: orang.atasan.id,
    });
    orang.lain = await tambahPengguna(db, tenant.id, { nama: KARYAWAN_LAIN.nama, email: KARYAWAN_LAIN.email, employeeId: KARYAWAN_LAIN.employeeId, peran: 'learner' });

    const role = await a.dna.buatJabatan(orang.hr, JABATAN, KOMPETENSI);
    await a.dna.tempatkan(orang.hr, orang.karyawan, role);
    await a.dna.tempatkan(orang.hr, orang.lain, role);
    orang.jabatan = role;
    modul = await a.li.imporModul(orang.hr, {
      code: 'L1-ESK', name: 'Eskalasi tiket dan produk layanan', level: 'basic', jobRoles: JABATAN.name,
      competencies: `${kEskalasi}; ${kProduk}`, items: [['S', 'Menentukan jalur eskalasi ke L2'], ['K', 'Memahami katalog produk layanan']],
    });
  });

  afterAll(async () => {
    await hapusTenant(db, tenantIds);
    await db.close();
  });

  it('HR menjalankan pelatihan offline dari modul library: peserta, kehadiran, dan skor vendor (B13 → B14)', async () => {
    const pelatihan = await a.ld.pelatihanOffline(orang.hr, {
      title: 'Workshop eskalasi L1', moduleId: modul.id, startsOn: hari(-20), endsOn: hari(-19),
      skor: [[orang.karyawan, 80], [orang.lain, 65]],
    });
    expect(pelatihan.assessmentStatus).toBe('manual');
  });

  it('HR membuat rencana untuk jabatan dan periode; rantai bukti memakai skor post dari Learning Delivery', async () => {
    rencana = await a.lim.buatRencana(orang.hr, {
      title: 'Pilot L1', jobRoleId: orang.jabatan.id, periodFrom: hari(-60), periodUntil: hari(30), moduleIds: [modul.id],
      businessProblem: 'Eskalasi tiket lambat', desiredBehavior: 'Agen memilih jalur eskalasi yang tepat',
    });
    const r = await a.lim.ringkasan(orang.hr, rencana.id);
    expect(r.participants).toBe(2);
    expect(r.chain.find((x) => x.key === 'activity').coverage).toBe('measured');
    const perKompetensi = Object.fromEntries(r.competencies.map((c) => [c.name, c]));
    expect(perKompetensi[kEskalasi]).toMatchObject({ post: 73, postN: 2, postShared: true });
    expect(perKompetensi[kProduk]).toMatchObject({ post: 73, postN: 2 }) // rata-rata 80 dan 65, dibulatkan;
  });

  it('atasan hanya melihat timnya dan hanya mengisi skor kinerja; antrean wawancara ulang khusus HR', async () => {
    expect((await a.mentah('get', '/api/lim/plans', orang.atasan)).body.data).toEqual([expect.objectContaining({ id: rencana.id, participantCount: 1 })]);
    expect((await a.lim.ringkasan(orang.atasan, rencana.id)).participants).toBe(1);

    const kompetensi = (await a.lim.ringkasan(orang.hr, rencana.id)).competencies.find((c) => c.name === kEskalasi).competencyId;
    const isi = await a.mentah('put', `/api/lim/plans/${rencana.id}/measurements`, orang.atasan, { entries: [
      { userId: orang.karyawan.id, competencyId: kompetensi, performanceScore: 78 },
      { userId: orang.lain.id, competencyId: kompetensi, performanceScore: 90 },
      { userId: orang.karyawan.id, competencyId: kompetensi, postScore: 99 },
    ] });
    expect(isi.body.data.saved).toBe(1);
    expect(isi.body.data.rejected.map((x) => x.message)).toEqual(['Karyawan bukan anggota tim Anda', 'Atasan hanya mengisi skor kinerja']);
    expect((await a.mentah('get', `/api/lim/plans/${rencana.id}/queue`, orang.atasan)).status).toBe(403);
    expect((await a.mentah('post', '/api/lim/plans', orang.atasan, { title: 'x', moduleIds: [modul.id] })).status).toBe(403);
  });

  it('HR menjadwalkan wawancara ulang per karyawan; satu baris antrean per karyawan, bisa dibatalkan', async () => {
    const antrean = await a.lim.antrean(orang.hr, rencana.id);
    expect(antrean.map((x) => x.userId).sort()).toEqual([orang.karyawan.id, orang.lain.id].sort());
    expect(antrean.find((x) => x.userId === orang.karyawan.id).competencies).toHaveLength(2);

    const tanggal = hari(10);
    expect(await a.lim.jadwalkan(orang.hr, rencana.id, [orang.karyawan.id], tanggal)).toMatchObject({ scheduled: [orang.karyawan.id], rejected: [] });
    expect((await a.lim.antrean(orang.hr, rencana.id)).find((x) => x.userId === orang.karyawan.id)).toMatchObject({ status: 'scheduled', scheduledOn: tanggal });
    await a.lim.jadwalkan(orang.hr, rencana.id, [orang.karyawan.id], null);
    expect((await a.lim.antrean(orang.hr, rencana.id)).find((x) => x.userId === orang.karyawan.id).status).toBe('none');
  });

  it('tanpa paket full_suite rute ditolak meski flag menyala; tenant lain tidak melihat rencana', async () => {
    const lain = await siapkanTenant(db, { slug: `${slug}-lain`, nama: TENANT_LAIN.nama, flags: FLAG_LIM });
    tenantIds.push(lain.id);
    const hrLain = await tambahPengguna(db, lain.id, { nama: 'HR Lain', email: `hr@${slug}-lain.test`, employeeId: 'E-TL-HR', peran: 'hr_admin' });
    expect((await a.mentah('get', '/api/lim/plans', hrLain)).body.data).toEqual([]);
    expect((await a.mentah('get', `/api/lim/plans/${rencana.id}/overview`, hrLain)).status).toBe(404);

    const satuan = await siapkanTenant(db, { slug: `${slug}-satuan`, flags: FLAG_LIM, produk: ['dna', 'tna'] });
    tenantIds.push(satuan.id);
    const hrSatuan = await tambahPengguna(db, satuan.id, { nama: 'HR Satuan', email: `hr@${slug}-satuan.test`, employeeId: 'E-HR', peran: 'hr_admin' });
    const r = await a.mentah('get', '/api/lim/plans', hrSatuan);
    expect(r.status).toBe(403);
    expect(kodeGalat(r)).toBe('NOT_ENTITLED');
  });
});
