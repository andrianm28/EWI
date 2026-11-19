// PK-18 + PK-20 (17 Nov): katalog course statis Moodle, status lulus per course, toleransi per KPI dengan
// hitung ulang (PM-1 ★ B, C-8), dan audit perubahan email lewat impor (PD-19 butir 7). Postgres.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { makeConfig } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Katalog course + toleransi KPI (Postgres)', () => {
  let db; let app; let stores; let tenant; let other; const u = {}; const tok = {};
  let comp; let project;
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const csv = (lines) => Buffer.from(`${lines.join('\n')}\n`);

  /** Unggah -> simpan dengan saran pemetaan otomatis (judul kolom = template). */
  async function importCsv(sm, kind, lines, { who = 'hr', options, mapping } = {}) {
    const up = await request(app).post(`/api/${sm}/imports/${kind}?filename=${kind}.csv`)
      .set(as(who)).set('Content-Type', 'application/octet-stream').send(csv(lines));
    expect(up.status).toBe(201);
    const body = { options };
    if (mapping) body.mapping = { ...up.body.data.mapping, ...mapping };
    return request(app).post(`/api/${sm}/imports/batches/${up.body.data.id}/commit`).set(as(who)).send(body);
  }

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    app = createApp({ config, stores }); // katalog default: elitementor (kosong) + moodle statis
    const tokens = createTokenService(config.jwt);
    const slug = `kat-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Katalog uji') RETURNING id`, { replacements: { slug } });
    [[other]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Lain') RETURNING id`, { replacements: { slug: `${slug}-x` } });
    for (const [key, role, t] of [['hr', 'hr_admin', tenant.id], ['dimas', 'learner', tenant.id], ['rina', 'learner', tenant.id], ['luar', 'hr_admin', other.id]]) {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, :email, :key, :emp, :role, 'active') RETURNING id`,
        { replacements: { t, email: `${key}@kat.test`, key, emp: `E-${key}`, role } },
      );
      u[key] = row.id;
      tok[key] = tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@kat.test` });
    }
    for (const t of [tenant.id, other.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t } });
      await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'module.dna', true), (:t, 'module.tna', true)`, { replacements: { t } });
    }
    comp = await stores.dna.createCompetency(tenant.id, {
      jobRoleId: null, careerLevelId: null, kind: 'core', name: 'Memahami kontrak proyek', definition: null, indicators: [], source: 'hr_rule', requiredScore: 3, importance: 4,
    });
    [[project]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'Pilot L1') RETURNING id`, { replacements: { t: tenant.id } });
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  const newFinding = (userId) => stores.tna.insertFinding(tenant.id, {
    projectId: project.id, userId, competencyId: comp.id, category: 'training', title: 'Belum paham klausul SLA', reviewStatus: 'approved',
  });

  it('rencana training: perlu modul -> course katalog setelah impor, lalu selesai saat course lulus', async () => {
    // 1. Belum ada katalog: rencana berstatus perlu modul
    const f1 = await newFinding(u.dimas);
    let plan = await request(app).post(`/api/tna/findings/${f1.id}/plan`).set(as('hr')).send({});
    expect(plan.status).toBe(201);
    expect(plan.body.data).toMatchObject({ status: 'new', needsModule: true });

    // 2. Impor katalog: satu course terpetakan, satu kompetensi tak dikenal ditolak
    const done = await importCsv('tna', 'catalog_courses', [
      'Kode Course,Judul Course,Kompetensi,Program,Tautan,Kategori,Status',
      'SDL1-101,Membaca SLA dan Kontrak Layanan,memahami kontrak proyek,dasar,https://lms.test/course/view.php?id=101,Service Delivery,aktif',
      'SDL1-102,Eskalasi Insiden,,lanjutan,,Service Delivery,nonaktif',
      'SDL1-999,Course Salah,Kompetensi Tidak Ada,,,,',
    ]);
    expect(done.status).toBe(200);
    expect(done.body.data.result).toMatchObject({ imported: 2, rejectedCount: 1, created: 2, updated: 0, mapped: 1, plansMatched: 1 });
    expect(done.body.data.result.rejected[0].reason).toMatch(/Kompetensi "Kompetensi Tidak Ada" belum ada di kamus/);

    // 3. Rencana lama kini menunjuk course; rencana baru langsung mendapat course
    let items = (await request(app).get('/api/tna/plan-items').set(as('hr'))).body.data;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'new', needsModule: false, catalogSource: 'moodle', catalogItemRef: 'SDL1-101', catalogItemTitle: 'Membaca SLA dan Kontrak Layanan', catalogItemUrl: 'https://lms.test/course/view.php?id=101', courseStatus: null });
    const f2 = await newFinding(u.rina);
    plan = await request(app).post(`/api/tna/findings/${f2.id}/plan`).set(as('hr')).send({ programTier: 'basic' });
    expect(plan.body.data).toMatchObject({ status: 'new', catalogItemRef: 'SDL1-101', catalogItemUrl: 'https://lms.test/course/view.php?id=101' });

    // 4. Katalog terlihat HR beserta kompetensinya; bukan untuk learner, tidak bocor ke tenant lain
    const cat = (await request(app).get('/api/tna/catalog').set(as('hr'))).body.data;
    expect(cat.map((c) => c.ref)).toEqual(['SDL1-102', 'SDL1-101']);
    expect(cat.find((c) => c.ref === 'SDL1-101')).toMatchObject({ programTier: 'basic', active: true, competencies: [{ id: comp.id, name: 'Memahami kontrak proyek' }] });
    expect((await request(app).get('/api/tna/catalog').set(as('dimas'))).status).toBe(403);
    expect((await request(app).get('/api/tna/catalog').set(as('luar'))).body.data).toEqual([]);

    // 5. Status lulus per course: menutup rencana Dimas, Rina masih berjalan
    const comp1 = await importCsv('tna', 'catalog_completions', [
      'ID Karyawan,Kode Course,Status,Tanggal Lulus,Nilai',
      'E-dimas,SDL1-101,lulus,20/11/2026,88',
      'E-rina,SDL1-101,sedang berjalan,,',
      'E-dimas,SDL1-777,lulus,,',
    ]);
    expect(comp1.body.data.result).toMatchObject({ imported: 2, rejectedCount: 1, completions: 2, passed: 1, plansCompleted: 1 });
    expect(comp1.body.data.result.rejected[0].reason).toMatch(/Course "SDL1-777" belum ada di katalog/);
    items = (await request(app).get('/api/tna/plan-items').set(as('hr'))).body.data;
    expect(items.find((p) => p.userId === u.dimas)).toMatchObject({ status: 'completed', courseStatus: 'passed' });
    expect(items.find((p) => p.userId === u.rina)).toMatchObject({ status: 'new', courseStatus: 'in_progress' });

    // 6. Impor ulang kode yang sama memperbarui course (tanpa duplikat); course nonaktif tidak diusulkan
    const again = await importCsv('dna', 'catalog_courses', ['Kode Course,Judul Course,Kompetensi', 'SDL1-101,Membaca SLA (rev),Memahami kontrak proyek']);
    expect(again.body.data.result).toMatchObject({ created: 0, updated: 1 });
    const [{ n }] = await db.query('SELECT count(*)::int AS n FROM lna_catalog_items WHERE tenant_id = :t', { replacements: { t: tenant.id }, type: 'SELECT' });
    expect(n).toBe(2);
  });

  it('toleransi per KPI: impor menyimpan aturan dan menghitung ulang status lama; ubah aturan lewat API diaudit', async () => {
    const perfMap = { metricType: 'Jenis Metrik', name: 'Nama Metrik', valueType: 'Tipe Nilai', target: 'Target', actual: 'Realisasi', tolerance: 'Toleransi' };
    // Periode Oktober tanpa toleransi: 86% dari target 90% = meleset
    let r = await importCsv('tna', 'tna_performance', [
      'ID Karyawan,Jenis Metrik,Nama Metrik,Tipe Nilai,Target,Realisasi,Toleransi',
      'E-dimas,kpi,Resolusi tiket < 4 jam,persen,90%,86%,',
    ], { options: { period: '2026-10' }, mapping: perfMap });
    expect(r.body.data.result).toMatchObject({ red: 1, rulesChanged: 0 });

    // Periode November dengan toleransi 5: aturan tersimpan, baris Oktober ikut dihitung ulang menjadi tercapai
    r = await importCsv('tna', 'tna_performance', [
      'ID Karyawan,Jenis Metrik,Nama Metrik,Tipe Nilai,Target,Realisasi,Toleransi',
      'E-dimas,kpi,Resolusi Tiket < 4 Jam,persen,90%,84%,5',
      'E-rina,kpi,Resolusi tiket < 4 jam,persen,90%,87%,',
    ], { options: { period: '2026-11' }, mapping: perfMap });
    expect(r.body.data.result).toMatchObject({ records: 2, red: 1, rulesChanged: 1, recomputed: { changed: 1, toMet: 1, toMissed: 0 } });
    let perf = (await request(app).get('/api/tna/performance').set(as('hr'))).body.data;
    expect(perf.find((p) => p.period === '2026-10')).toMatchObject({ isMet: true, tolerance: 5 });
    expect(perf.find((p) => p.period === '2026-11' && p.userId === u.rina)).toMatchObject({ isMet: true, tolerance: 5 });

    const rules = (await request(app).get('/api/tna/kpi-rules').set(as('hr'))).body.data;
    expect(rules).toEqual([expect.objectContaining({ metricType: 'kpi', metricKey: 'resolusi tiket < 4 jam', direction: 'higher', tolerance: 5 })]);

    // HR mengubah aturan kembali ke 0: dua baris yang tadinya dalam toleransi kembali meleset
    const put = await request(app).put('/api/tna/kpi-rules').set(as('hr')).send({ metricType: 'kpi', name: 'Resolusi tiket < 4 jam', direction: 'higher', tolerance: 0 });
    expect(put.status).toBe(200);
    expect(put.body.data.recomputed).toEqual({ changed: 3, toMet: 0, toMissed: 2 });
    perf = (await request(app).get('/api/tna/performance').set(as('hr'))).body.data;
    expect(perf.filter((p) => p.isMet === false)).toHaveLength(3);
    const audits = await db.query(`SELECT meta FROM audit_logs WHERE tenant_id = :t AND resource = 'tna.kpi_rule'`, { replacements: { t: tenant.id }, type: 'SELECT' });
    expect(audits).toHaveLength(1);
    expect(audits[0].meta).toMatchObject({ before: { tolerance: 5 }, after: { tolerance: 0 } });

    expect((await request(app).put('/api/tna/kpi-rules').set(as('hr')).send({ metricType: 'kpi', name: 'x', tolerance: -1 })).status).toBe(400);
    expect((await request(app).put('/api/tna/kpi-rules').set(as('dimas')).send({ metricType: 'kpi', name: 'x' })).status).toBe(403);
    expect((await request(app).get('/api/tna/kpi-rules').set(as('luar'))).body.data).toEqual([]);
  });

  it('perubahan email lewat impor dicatat di audit beserta alamat lama dan baru (PD-19 butir 7)', async () => {
    const r = await importCsv('dna', 'employees', ['ID Karyawan,Nama,Email', 'E-rina,Rina,rina.baru@kat.test', 'E-dimas,Dimas,dimas@kat.test']);
    expect(r.body.data.result).toMatchObject({ updated: 2, emailsChanged: 1 });
    const rows = await db.query(`SELECT user_id AS "actor", meta FROM audit_logs WHERE tenant_id = :t AND resource = 'user.email'`, { replacements: { t: tenant.id }, type: 'SELECT' });
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toBe(u.hr);
    expect(rows[0].meta).toMatchObject({ userId: u.rina, employeeId: 'E-rina', from: 'rina@kat.test', to: 'rina.baru@kat.test', via: 'import' });
  });
});
