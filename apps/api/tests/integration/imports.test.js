// R3-3: impor file XLSX/CSV dengan pemetaan kolom, pratinjau, dan simpan (Postgres).
const request = require('supertest');
const ExcelJS = require('exceljs');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Impor file R3-3 (Postgres)', () => {
  let db; let app; let tenant; let other; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });

  /** Unggah file -> batch (dengan saran pemetaan). */
  const upload = (sm, kind, filename, body, who = 'hr') => request(app)
    .post(`/api/${sm}/imports/${kind}?filename=${encodeURIComponent(filename)}`)
    .set(as(who)).set('Content-Type', 'application/octet-stream').send(body);
  const csv = (lines) => Buffer.from(`${lines.join('\n')}\n`);
  async function xlsx(rows) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const stores = createStores(db);
    app = createApp({ config, stores });
    const tokens = sessionSigner(config, stores.authSessions);
    const slug = `imp-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Impor uji') RETURNING id`, { replacements: { slug } });
    [[other]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Lain') RETURNING id`, { replacements: { slug: `${slug}-x` } });
    for (const [key, role, t] of [['hr', 'hr_admin', tenant.id], ['spv0', 'learner', tenant.id], ['luar', 'hr_admin', other.id]]) {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, :email, :key, :emp, :role, 'active') RETURNING id`,
        { replacements: { t, email: `${key}@imp.test`, key, emp: key === 'spv0' ? 'E-0900' : `X-${key}`, role } },
      );
      tok[key] = await tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@imp.test` });
    }
    for (const t of [tenant.id, other.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t } });
      await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'module.dna', true), (:t, 'module.tna', true), (:t, 'dna.development', true)`, { replacements: { t } });
    }
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  it('template bisa diunduh (XLSX + CSV) dan hanya untuk HR', async () => {
    const list = await request(app).get('/api/dna/imports/templates').set(as('hr'));
    expect(list.body.data.map((k) => k.key)).toEqual(['dna_job_levels', 'employees', 'dna_competencies', 'dna_completions', 'dna_results', 'catalog_courses', 'catalog_completions', 'dna_job_functions']);
    const tnaList = await request(app).get('/api/tna/imports/templates').set(as('hr'));
    expect(tnaList.body.data.map((k) => k.key)).toEqual(['employees', 'tna_performance', 'catalog_courses', 'catalog_completions']);
    const file = await request(app).get('/api/tna/imports/templates/tna_performance.xlsx').set(as('hr')).buffer(true)
      .parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toMatch(/template-elgos-tna_performance\.xlsx/);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(file.body);
    expect(wb.worksheets[0].getRow(1).values).toContain('Tipe Nilai');
    expect((await request(app).get('/api/dna/imports/templates/employees.csv').set(as('hr'))).text).toMatch(/^\uFEFFID Karyawan,Nama,Email/);
    expect((await request(app).get('/api/dna/imports/templates').set(as('spv0'))).status).toBe(403);
    expect((await request(app).get('/api/dna/imports/templates/tna_performance.csv').set(as('hr'))).status).toBe(404);
  });

  it('alur penuh POC: jenjang -> karyawan -> kamus -> status lulus -> hasil DNA -> kinerja', async () => {
    // 1. Jenjang & program (XLSX, judul kolom sesuai template)
    let up = await upload('dna', 'dna_job_levels', 'jenjang.xlsx', await xlsx([
      ['Job Role', 'Divisi', 'Jenjang', 'Urutan', 'Program Wajib'],
      ['Service Desk', 'SD', 'Senior', 2, 'menengah'],
      ['Service Desk', 'SD', 'Junior', 1, 'dasar'],
      ['Service Desk', 'SD', 'Junior', 3, ''],
    ]));
    expect(up.status).toBe(201);
    expect(up.body.data).toMatchObject({ status: 'uploaded', rowCount: 3, mapping: { jobRole: 'Job Role', programTier: 'Program Wajib' } });
    let id = up.body.data.id;
    let prev = await request(app).post(`/api/dna/imports/batches/${id}/preview`).set(as('hr')).send({});
    expect(prev.body.data).toMatchObject({ valid: 2, rejectedCount: 1, rejected: [{ row: 4, reason: expect.stringMatching(/lebih dari sekali/) }] });
    let done = await request(app).post(`/api/dna/imports/batches/${id}/commit`).set(as('hr')).send({});
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'committed', result: { imported: 2, jobRoles: 1 } });
    const roles = (await request(app).get('/api/dna/job-roles').set(as('hr'))).body.data;
    expect(roles.find((r) => r.name === 'Service Desk').levels.map((l) => [l.name, l.requiredProgramTier])).toEqual([['Junior', 'basic'], ['Senior', 'intermediate']]);
    expect((await request(app).post(`/api/dna/imports/batches/${id}/commit`).set(as('hr')).send({})).status).toBe(409);

    // 2. Karyawan (CSV titik koma, judul kolom HR sendiri -> dipetakan manual)
    up = await upload('dna', 'employees', 'karyawan.csv', csv([
      'NIK;Nama Lengkap;Surel;Jabatan;Grade;Atasan',
      'E-1001;Dimas;dimas@imp.test;Service Desk;Junior;E-1000',
      'E-1000;Sinta;sinta@imp.test;Service Desk;Senior;',
      'E-1002;Rina;rina@imp.test;Service Desk;Lead;E-1000',
      'X-hr;HR Baru;hr@imp.test;;;',
    ]));
    id = up.body.data.id;
    expect(up.body.data.mapping).toMatchObject({ employeeId: 'NIK', name: 'Nama Lengkap', email: 'Surel', jobRole: 'Jabatan', careerLevel: 'Grade' });
    expect((await request(app).post(`/api/dna/imports/batches/${id}/preview`).set(as('hr')).send({ mapping: { employeeId: 'NIK' } })).body.error.message).toMatch(/Nama, Email/);
    const mapping = { ...up.body.data.mapping, supervisorEmployeeId: 'Atasan', role: null };
    prev = await request(app).post(`/api/dna/imports/batches/${id}/preview`).set(as('hr')).send({ mapping });
    expect(prev.body.data.valid).toBe(2);
    expect(prev.body.data.rejected.map((r) => r.row)).toEqual([4, 5]);
    expect(prev.body.data.rejected[1].reason).toMatch(/HR\/Admin/);
    expect(prev.body.data.sample[0]).toMatchObject({ row: 2, values: { employeeId: 'E-1001', name: 'Dimas' } });
    done = await request(app).post(`/api/dna/imports/batches/${id}/commit`).set(as('hr')).send({});
    expect(done.body.data.result).toMatchObject({ imported: 2, created: 2, supervisorsLinked: 1 });
    const people = (await request(app).get('/api/dna/employees').set(as('hr'))).body.data;
    const dimas = people.find((p) => p.employeeId === 'E-1001');
    const sinta = people.find((p) => p.employeeId === 'E-1000');
    expect(dimas).toMatchObject({ supervisorId: sinta.id, jobRoleName: 'Service Desk' });

    // 3. Kamus kompetensi
    up = await upload('dna', 'dna_competencies', 'kamus.csv', csv([
      'Job Role,Jenjang,Kompetensi,Skor Minimal,Kepentingan,Indikator,Sumber',
      'Service Desk,Junior,Triase tiket,3,5,Mengenali prioritas; Eskalasi tepat,dacum',
      ',,Komunikasi pelanggan,2,,,',
      'Service Desk,Junior,Triase tiket,3,5,,',
      'Service Desk,,Skor salah,7,,,',
    ]));
    id = up.body.data.id;
    done = await request(app).post(`/api/dna/imports/batches/${id}/commit`).set(as('hr')).send({});
    expect(done.body.data.result).toMatchObject({ imported: 2, rejectedCount: 2 });
    const comps = (await request(app).get('/api/dna/competencies').set(as('hr'))).body.data;
    expect(comps.find((c) => c.name === 'Triase tiket')).toMatchObject({ kind: 'job', source: 'dacum', importance: 5, indicators: ['Mengenali prioritas', 'Eskalasi tepat'] });
    expect(comps.find((c) => c.name === 'Komunikasi pelanggan')).toMatchObject({ kind: 'core', requiredScore: 2 });

    // 3b. B4: job function, lalu melengkapi kamus yang sudah ada dengan kode, level program, dan job function
    up = await upload('dna', 'dna_job_functions', 'jf.csv', csv(['Job Role,No,Job Function', 'Service Desk,1,Penanganan tiket', 'Service Desk,,Eskalasi', 'Service Desk,1,Bentrok nomor']));
    done = await request(app).post(`/api/dna/imports/batches/${up.body.data.id}/commit`).set(as('hr')).send({});
    expect(done.body.data.result).toMatchObject({ imported: 2, rejectedCount: 1, jobFunctions: 2 });
    up = await upload('dna', 'dna_competencies', 'kamus-b4.csv', csv([
      'Job Role,Jenjang,Kompetensi,Kode,Rumpun,Level,Job Function',
      'Service Desk,Junior,Triase tiket,SD-B1,Specific Technical,B,1; 2',
      'Service Desk,,Penulisan laporan,SD-I1,Non-Technical,Intermediate,2',
      'Service Desk,,Kode kembar,sd-b1,,,',
      'Service Desk,,JF tidak ada,SD-X,,,9',
    ]));
    expect(up.body.data.mapping).toMatchObject({ code: 'Kode', stream: 'Rumpun', programTier: 'Level', jobFunctions: 'Job Function', careerLevel: 'Jenjang' });
    done = await request(app).post(`/api/dna/imports/batches/${up.body.data.id}/commit`).set(as('hr')).send({});
    expect(done.body.data.result).toMatchObject({ imported: 2, rejectedCount: 2, competencies: 1, updated: 1 });
    const sdRole = (await request(app).get('/api/dna/job-roles').set(as('hr'))).body.data.find((r) => r.name === 'Service Desk');
    const dict = (await request(app).get(`/api/dna/job-roles/${sdRole.id}/dictionary`).set(as('hr'))).body.data;
    expect(dict.jobFunctions.map((f) => [f.order, f.name, f.competencyCount])).toEqual([[1, 'Penanganan tiket', 1], [2, 'Eskalasi', 2]]);
    expect(dict.competencies.map((c) => [c.code, c.name, c.programTier, c.jobFunctionIds.length])).toEqual([['SD-B1', 'Triase tiket', 'basic', 2], ['SD-I1', 'Penulisan laporan', 'intermediate', 1]]);
    // kolom lama kompetensi yang diperbarui tidak berubah
    expect((await request(app).get('/api/dna/competencies').set(as('hr'))).body.data.find((c) => c.name === 'Triase tiket')).toMatchObject({ source: 'dacum', importance: 5, stream: 'Specific Technical' });

    // 4. Status lulus program
    up = await upload('dna', 'dna_completions', 'lulus.csv', csv(['Email,Program,Status,Tanggal Lulus', 'dimas@imp.test,dasar,lulus,30/10/2026', 'nobody@imp.test,basic,lulus,']));
    done = await request(app).post(`/api/dna/imports/batches/${up.body.data.id}/commit`).set(as('hr')).send({});
    expect(done.body.data.result).toMatchObject({ imported: 1, rejected: [{ row: 3, reason: expect.stringMatching(/tidak ditemukan/) }] });

    // 5. Hasil DNA manual; pewawancara & tanggal dari isian layar
    up = await upload('dna', 'dna_results', 'hasil.xlsx', await xlsx([
      ['ID Karyawan', 'Kompetensi', 'Skor', 'Bukti'],
      ['E-1001', 'triase tiket', 2, 'Belum konsisten'],
      ['E-1001', 'Komunikasi pelanggan', '3', ''],
      ['E-1001', 'Tidak ada', 3, ''],
    ]));
    id = up.body.data.id;
    expect((await request(app).post(`/api/dna/imports/batches/${id}/preview`).set(as('hr')).send({ options: { assessedAt: '31/02/2026' } })).status).toBe(400);
    done = await request(app).post(`/api/dna/imports/batches/${id}/commit`).set(as('hr')).send({ options: { assessor: 'Abdan', assessedAt: '2026-11-10' } });
    expect(done.body.data.result).toMatchObject({ imported: 2, rejectedCount: 1 });
    const detail = (await request(app).get(`/api/dna/employees/${dimas.id}`).set(as('hr'))).body.data;
    expect(detail.gap.items.find((g) => g.name === 'Triase tiket')).toMatchObject({ score: 2, status: 'gap', source: 'manual_interview' });
    expect(detail.career.passedTiers || detail.completions.map((c) => c.programTier)).toContain('basic');

    // 6. Kinerja (TNA) dengan tipe nilai BT-26
    up = await upload('tna', 'tna_performance', 'happyfive.csv', csv([
      'NIK,Jenis,Key Result,Tipe,Goal,Pencapaian,Arah',
      'E-1001,kpi,Resolusi tiket,persen,90%,"72,5%",',
      'E-1001,sla,Laporan bulanan,tenggat,30/11/2026,2026-11-28,',
      'E-1001,okr,Ikut kelas,biner,,tidak,',
    ]));
    id = up.body.data.id;
    const perfMap = { ...up.body.data.mapping, metricType: 'Jenis', valueType: 'Tipe', direction: 'Arah' };
    expect((await request(app).post(`/api/tna/imports/batches/${id}/preview`).set(as('hr')).send({ mapping: perfMap })).status).toBe(400); // periode wajib
    done = await request(app).post(`/api/tna/imports/batches/${id}/commit`).set(as('hr')).send({ mapping: perfMap, options: { period: '2026-11' } });
    expect(done.body.data.result).toMatchObject({ imported: 3, records: 3, red: 2 });
    const perf = (await request(app).get('/api/tna/performance').set(as('hr'))).body.data;
    expect(perf.find((p) => p.name === 'Resolusi tiket')).toMatchObject({ valueType: 'persen', target: 90, actual: 72.5, isMet: false, unit: '%' });
    expect(perf.find((p) => p.name === 'Laporan bulanan')).toMatchObject({ valueType: 'tenggat', isMet: true });

    // Riwayat + audit; baris mentah dibuang setelah disimpan
    const hist = (await request(app).get('/api/dna/imports/batches').set(as('hr'))).body.data;
    expect(hist.length).toBe(7);
    expect(hist.every((b) => b.status === 'committed' && b.createdByName === 'hr')).toBe(true);
    const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM import_batches WHERE tenant_id = :t AND (jsonb_typeof(rows) <> 'array' OR jsonb_array_length(rows) > 0)`, { replacements: { t: tenant.id }, type: 'SELECT' });
    expect(n).toBe(0);
    const audits = await db.query(`SELECT resource FROM audit_logs WHERE tenant_id = :t AND action = 'create' AND resource LIKE 'import.%'`, { replacements: { t: tenant.id }, type: 'SELECT' });
    expect(audits.length).toBe(8);

    // C5 demo 25 Nov: isian Periode kosong, periode dibaca dari kolom berkas; baris tanpa periode tetap ditolak per baris
    up = await upload('tna', 'tna_performance', 'kpi-periode.csv', csv([
      'NIK,Jenis,Key Result,Goal,Pencapaian,Periode',
      'E-1001,kpi,Tiket per jam C5,10,8,2026-10',
      'E-1001,kpi,Tiket per jam C5,10,11,',
    ]));
    id = up.body.data.id;
    const c5Map = { ...up.body.data.mapping, metricType: 'Jenis', period: 'Periode' };
    const pv = await request(app).post(`/api/tna/imports/batches/${id}/preview`).set(as('hr')).send({ mapping: c5Map, options: {} });
    expect(pv.status).toBe(200);
    done = await request(app).post(`/api/tna/imports/batches/${id}/commit`).set(as('hr')).send({ mapping: c5Map, options: {} });
    expect(done.status).toBe(200);
    expect(done.body.data.result).toMatchObject({ imported: 1, rejectedCount: 1 });
    const c5 = (await request(app).get('/api/tna/performance').set(as('hr'))).body.data.filter((p) => p.name === 'Tiket per jam C5');
    expect(c5.map((p) => p.period)).toEqual(['2026-10']);
  });

  it('flag dna.development mati: impor kamus berperilaku seperti sebelum B4 (tanpa kolom B4, "Level" = Jenjang, tanpa jenis Job function)', async () => {
    await db.query(`UPDATE feature_flags SET enabled = false WHERE tenant_id = :t AND key = 'dna.development'`, { replacements: { t: other.id } });
    const list = (await request(app).get('/api/dna/imports/templates').set(as('luar'))).body.data;
    expect(list.map((k) => k.key)).not.toContain('dna_job_functions');
    const comp = list.find((k) => k.key === 'dna_competencies');
    expect(comp.fields.map((f) => f.key)).not.toEqual(expect.arrayContaining(['code']));
    expect(comp.fields.map((f) => f.key)).not.toContain('programTier');
    expect((await upload('dna', 'dna_job_functions', 'jf.csv', csv(['Job Role,No,Job Function', 'X,1,Y']), 'luar')).status).toBe(404);
    const up = await upload('dna', 'dna_competencies', 'lama.csv', csv(['Job Role,Kompetensi,Level', 'Lain,Uji,Junior']), 'luar');
    expect(up.status).toBe(201);
    expect(up.body.data.mapping).toMatchObject({ careerLevel: 'Level' });
    expect(up.body.data.mapping.programTier).toBeUndefined();
    const bad = await request(app).post(`/api/dna/imports/batches/${up.body.data.id}/preview`).set(as('luar')).send({ mapping: { jobRole: 'Job Role', name: 'Kompetensi', programTier: 'Level' } });
    expect(bad.status).toBe(400);
  });

  it('isolasi tenant dan validasi unggahan', async () => {
    const up = await upload('dna', 'employees', 'k.csv', csv(['ID Karyawan,Nama,Email', 'E-9,Nn,nn@imp.test']));
    // R2-3: baris mentah tersimpan terenkripsi
    const [[raw]] = await db.query('SELECT rows #>> \'{}\' AS rows FROM import_batches WHERE id = :id', { replacements: { id: up.body.data.id } });
    expect(raw.rows).toMatch(/^enc:v1:/);
    expect(raw.rows).not.toContain('nn@imp.test');
    expect(up.body.data.sample[0]).toMatchObject({ Email: 'nn@imp.test' });
    expect((await request(app).get(`/api/dna/imports/batches/${up.body.data.id}`).set(as('luar'))).status).toBe(404);
    expect((await request(app).post(`/api/dna/imports/batches/${up.body.data.id}/commit`).set(as('luar')).send({})).status).toBe(404);
    expect((await request(app).get(`/api/tna/imports/batches/${up.body.data.id}`).set(as('hr'))).status).toBe(404); // beda submodul
    expect((await upload('dna', 'employees', 'k.pdf', Buffer.from('x'))).status).toBe(400);
    expect((await upload('dna', 'tidak_ada', 'k.csv', Buffer.from('a\n1'))).status).toBe(404);
    expect((await request(app).post('/api/dna/imports/employees?filename=a.csv').set(as('hr')).send({ a: 1 })).status).toBe(400);
  });
});
