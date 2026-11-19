// B13 Learning Intervention (Postgres): impor library modul KSA, prioritas Pareto dari gap TNA, permintaan vendor,
// draf pengembangan + tinjauan SME, program per jabatan, isolasi tenant, dan gating.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { makeConfig } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Learning Intervention (Postgres)', () => {
  let db; let app; let stores; let tenant; let other; const u = {}; const tok = {};
  let role; let comp; let project; let catalogItem; let otherCatalogItem; let inactiveCatalogItem;
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const get = (path, who = 'hr') => request(app).get(`/api/li${path}`).set(as(who));
  const post = (path, body, who = 'hr') => request(app).post(`/api/li${path}`).set(as(who)).send(body || {});
  const patch = (path, body, who = 'hr') => request(app).patch(`/api/li${path}`).set(as(who)).send(body || {});
  const csv = (lines) => Buffer.from(`${lines.join('\n')}\n`);
  const HEADER = 'Kode Modul,Nama Modul,Level,Rumpun,Tujuan,Jabatan,Kompetensi,Tipe Butir,Butir';

  async function importModules(lines, who = 'hr') {
    const up = await request(app).post('/api/li/imports/li_modules?filename=modul.csv').set(as(who)).set('Content-Type', 'application/octet-stream').send(csv([HEADER, ...lines]));
    if (up.status !== 201) return up;
    return request(app).post(`/api/li/imports/batches/${up.body.data.id}/commit`).set(as(who)).send({});
  }
  const byCode = async (code, who = 'hr') => (await get('/modules', who)).body.data.find((m) => m.code === code);
  const audits = async (resource) => (await db.query('SELECT action, meta FROM audit_logs WHERE tenant_id = :t AND resource = :resource ORDER BY id', { replacements: { t: tenant.id, resource } }))[0];

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    app = createApp({ config, stores });
    const tokens = createTokenService(config.jwt);
    const slug = `li-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'LI uji') RETURNING id`, { replacements: { slug } });
    [[other]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Lain') RETURNING id`, { replacements: { slug: `${slug}-x` } });
    for (const [key, r, t] of [['hr', 'hr_admin', tenant.id], ['sme', 'sme', tenant.id], ['atasan', 'supervisor', tenant.id], ['dimas', 'learner', tenant.id], ['rina', 'learner', tenant.id], ['luar', 'hr_admin', other.id]]) {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status) VALUES (:t, :email, :key, :emp, :role, 'active') RETURNING id`,
        { replacements: { t, email: `${key}@li.test`, key, emp: `E-${key}`, role: r } },
      );
      u[key] = row.id;
      tok[key] = tokens.sign({ id: row.id, tenantId: t, role: r, email: `${key}@li.test` });
    }
    for (const t of [tenant.id, other.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t } });
      await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'module.li', true), (:t, 'module.tna', true)`, { replacements: { t } });
    }
    [[role]] = await db.query(`INSERT INTO lna_job_roles (tenant_id, name) VALUES (:t, 'Engineer Service Delivery') RETURNING id`, { replacements: { t: tenant.id } });
    await db.query(`INSERT INTO lna_job_roles (tenant_id, name) VALUES (:t, 'Project Manager')`, { replacements: { t: tenant.id } });
    await db.query('UPDATE users SET job_role_id = :r WHERE id IN (:ids)', { replacements: { r: role.id, ids: [u.dimas, u.rina] } });
    comp = await stores.dna.createCompetency(tenant.id, { jobRoleId: role.id, careerLevelId: null, kind: 'job', name: 'Root Cause Analysis', definition: null, indicators: [], source: 'dacum', requiredScore: 3, importance: 5 });
    [[project]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'Pilot') RETURNING id`, { replacements: { t: tenant.id } });
    [[catalogItem]] = await db.query(`INSERT INTO lna_catalog_items (tenant_id, source, external_ref, title) VALUES (:t, 'moodle', 'C-1', 'Course RCA') RETURNING id`, { replacements: { t: tenant.id } });
    [[inactiveCatalogItem]] = await db.query(`INSERT INTO lna_catalog_items (tenant_id, source, external_ref, title, active) VALUES (:t, 'moodle', 'C-OFF', 'Course lama', false) RETURNING id`, { replacements: { t: tenant.id } });
    [[otherCatalogItem]] = await db.query(`INSERT INTO lna_catalog_items (tenant_id, source, external_ref, title) VALUES (:t, 'moodle', 'C-X', 'Course lain') RETURNING id`, { replacements: { t: other.id } });
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  it('impor: modul tersimpan utuh; modul dengan satu baris salah ditolak seluruhnya', async () => {
    const done = await importModules([
      'ST-A2,Root Cause Analysis & Post-Incident Report,advanced,Specific Technical,Mampu menemukan akar masalah,Engineer Service Delivery,root cause analysis,K,Konsep 5 Whys',
      'ST-A2,,,,,,,S,Menyusun Post-Incident Report',
      'ST-A2,,,,,,,A,Teliti terhadap data',
      'TC-I1,Automation & IaC,intermediate,Technical Competencies,Otomasi dasar,Engineer Service Delivery,,K,Konsep IaC',
      'TC-I1,,,,,,,S,Menulis playbook',
      'NT-B2,Ketelitian Operasional,basic,Non-Technical,,Engineer Service Delivery,,A,Memeriksa ulang pekerjaan',
      'XX-1,Modul Jabatan Salah,basic,Technical,,Jabatan Tidak Ada,,K,Butir a',
      'XX-2,Modul Tipe Salah,basic,Technical,,,,K,Butir a',
      'XX-2,,,,,,,Z,Butir tipe salah',
    ]);
    expect(done.status).toBe(200);
    expect(done.body.data.result).toMatchObject({ imported: 6, rejectedCount: 3, modules: 3, created: 3, updated: 0, items: 6 });
    const reasons = done.body.data.result.rejected.map((x) => x.reason);
    expect(reasons[0]).toMatch(/Jabatan "Jabatan Tidak Ada" belum ada/);
    expect(reasons[1]).toMatch(/Tipe Butir/);
    expect(reasons[2]).toMatch(/Tipe Butir/); // baris pertama XX-2 ikut ditolak: modul atomik

    const lib = await get('/modules');
    expect(lib.status).toBe(200);
    expect(lib.body.data.map((m) => m.code).sort()).toEqual(['NT-B2', 'ST-A2', 'TC-I1']);
    expect(lib.body.kpis).toMatchObject({ modules: 3, knowledge: 2, skill: 2, attitude: 2 });
    expect(lib.body.vendorName).toBe('Mahaka Institute');
    expect(lib.body.filters.jobRoles.map((j) => j.name)).toEqual(['Engineer Service Delivery']);
    const rca = lib.body.data.find((m) => m.code === 'ST-A2');
    expect(rca).toMatchObject({ level: 'advanced', stream: 'Specific Technical', counts: { K: 1, S: 1, A: 1 }, status: { key: 'none', via: null }, recommendation: 'dev', priority: null });
    expect(rca).not.toHaveProperty('items');
    expect(lib.body.data.find((m) => m.code === 'TC-I1').recommendation).toBe('vendor');
  });

  it('impor ulang mengganti butir tanpa menggandakan modul', async () => {
    const again = await importModules(['NT-B2,Ketelitian & Kewaspadaan Operasional,basic,Non-Technical,,Engineer Service Delivery,,A,Memeriksa ulang pekerjaan', 'NT-B2,,,,,,,A,Waspada terhadap anomali']);
    expect(again.body.data.result).toMatchObject({ modules: 1, created: 0, updated: 1, items: 2 });
    const m = await byCode('NT-B2');
    expect(m).toMatchObject({ name: 'Ketelitian & Kewaspadaan Operasional', counts: { K: 0, S: 0, A: 2 } });
  });

  it('filter dan detail modul', async () => {
    expect((await get('/modules?type=S')).body.data.map((m) => m.code).sort()).toEqual(['ST-A2', 'TC-I1']);
    expect((await get('/modules?level=basic')).body.data.map((m) => m.code)).toEqual(['NT-B2']);
    expect((await get('/modules?stream=non-technical')).body.data.map((m) => m.code)).toEqual(['NT-B2']);
    expect((await get(`/modules?jobRoleId=${role.id}`)).body.data).toHaveLength(3);
    expect((await get('/modules?level=expert')).status).toBe(400);
    expect((await get('/modules?jobRoleId=bukan-uuid')).status).toBe(400);
    const id = (await byCode('ST-A2')).id;
    const detail = await get(`/modules/${id}`);
    expect(detail.body.data).toMatchObject({ code: 'ST-A2', objective: 'Mampu menemukan akar masalah', jobRoles: [{ name: 'Engineer Service Delivery' }] });
    expect(detail.body.data.items.map((i) => i.kind)).toEqual(['K', 'S', 'A']);
    expect((await get('/modules/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('prioritas Pareto berasal dari gap training tanpa membuka judul temuan', async () => {
    expect((await get('/modules')).body.pareto).toMatchObject({ available: true, count: 0, codes: [], withoutGapData: 3 });
    await stores.tna.insertFinding(tenant.id, { projectId: project.id, userId: u.dimas, competencyId: comp.id, category: 'training', title: 'Rahasia Dimas' });
    await stores.tna.insertFinding(tenant.id, { projectId: project.id, userId: u.rina, competencyId: comp.id, category: 'training', title: 'Rahasia Rina' });
    await stores.tna.insertFinding(tenant.id, { projectId: project.id, userId: u.rina, competencyId: null, category: 'training', title: 'Temuan tanpa kompetensi' });
    // temuan yang belum ditinjau HR tidak dihitung (sama dengan /api/tna/pareto)
    await db.query("UPDATE lna_findings SET review_status = 'draft' WHERE tenant_id = :t", { replacements: { t: tenant.id } });
    expect((await get('/modules')).body.pareto).toMatchObject({ count: 0, unlinkedFindings: 0 });
    await db.query("UPDATE lna_findings SET review_status = 'approved' WHERE tenant_id = :t", { replacements: { t: tenant.id } });
    // prioritas per jabatan: jabatan tanpa gap tidak punya modul prioritas, dan permintaan massal mengikutinya
    const [[pm]] = await db.query("SELECT id FROM lna_job_roles WHERE tenant_id = :t AND name = 'Project Manager'", { replacements: { t: tenant.id } });
    expect((await get(`/modules?jobRoleId=${pm.id}`)).body.pareto.count).toBe(0);
    expect((await post('/requests/bulk', { scope: 'pareto', jobRoleId: pm.id })).body.data).toMatchObject({ created: 0, skipped: 0 });
    expect((await post('/requests/bulk', { scope: 'pareto', jobRoleId: 'x' })).status).toBe(400);
    const lib = await get('/modules');
    expect(lib.body.pareto).toMatchObject({ available: true, count: 1, codes: ['ST-A2'], withoutGapData: 2, unlinkedFindings: 1 });
    expect(lib.body.data[0]).toMatchObject({ code: 'ST-A2', priority: { rank: 1, label: 'Root Cause Analysis' } }); // prioritas tampil paling atas
    expect(JSON.stringify(lib.body)).not.toMatch(/Rahasia|Temuan tanpa kompetensi/);
    expect((await get('/modules?priority=pareto')).body.data.map((m) => m.code)).toEqual(['ST-A2']);
    // aturan 4 CLAUDE.md: gap per karyawan dibaca lewat cakupan visibleEmployeeScope
    expect((await stores.li.listTrainingGaps(tenant.id, { userIds: [u.dimas] })).map((g) => g.userId)).toEqual([u.dimas]);
    expect((await stores.li.listTrainingGaps(tenant.id, { all: true })).length).toBe(3);
    // modul TNA mati -> prioritas tidak tersedia, library tetap jalan
    await db.query(`UPDATE feature_flags SET enabled = false WHERE tenant_id = :t AND key = 'module.tna'`, { replacements: { t: tenant.id } });
    expect((await get('/modules')).body.pareto).toMatchObject({ available: false, count: 0 });
    await db.query(`UPDATE feature_flags SET enabled = true WHERE tenant_id = :t AND key = 'module.tna'`, { replacements: { t: tenant.id } });
  });

  it('permintaan vendor: alur maju satu langkah, satu jalur aktif, course katalog saat dipasang', async () => {
    const m = await byCode('TC-I1');
    const made = await post(`/modules/${m.id}/request`);
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ status: 'requested', vendorName: 'Mahaka Institute', moduleCode: 'TC-I1' });
    expect((await post(`/modules/${m.id}/request`)).body.error.code).toBe('PATH_ACTIVE');
    expect((await post(`/modules/${m.id}/draft`)).body.error.code).toBe('PATH_ACTIVE');
    expect((await byCode('TC-I1')).status).toEqual({ key: 'requested', via: 'vendor' });

    const rid = made.body.data.id;
    expect((await patch(`/requests/${rid}`, { status: 'installed' })).body.error.code).toBe('INVALID_TRANSITION');
    for (const body of [{}, { status: 'apa' }]) expect((await patch(`/requests/${rid}`, body)).status).toBe(400); // status kosong/tidak dikenal: salah isi, bukan konflik
    expect((await patch(`/requests/${rid}`, { status: 'confirmed', catalogItemId: catalogItem.id })).status).toBe(400);
    expect((await patch(`/requests/${rid}`, { status: 'confirmed' })).body.data.status).toBe('confirmed');
    expect((await patch(`/requests/${rid}`, { status: 'delivered' })).body.data.status).toBe('delivered');
    expect((await patch(`/requests/${rid}`, { status: 'installed', catalogItemId: otherCatalogItem.id })).status).toBe(400); // course tenant lain
    expect((await patch(`/requests/${rid}`, { status: 'installed', catalogItemId: inactiveCatalogItem.id })).status).toBe(400); // course nonaktif
    const installed = await patch(`/requests/${rid}`, { status: 'installed', catalogItemId: catalogItem.id });
    expect(installed.body.data).toMatchObject({ status: 'installed' });
    expect(installed.body.data.installedAt).toBeTruthy();
    expect(await byCode('TC-I1')).toMatchObject({ status: { key: 'available', via: 'catalog' }, catalogItemId: catalogItem.id });
    expect((await patch(`/requests/${rid}`, { status: 'cancelled' })).body.error.code).toBe('INVALID_TRANSITION');

    const list = await get('/requests');
    expect(list.body.data.vendor).toEqual([expect.objectContaining({ id: rid, status: 'installed', moduleCode: 'TC-I1' })]);
    expect(list.body.data.candidates.map((c) => c.code)).toEqual(['ST-A2']);
    expect((await audits('li.module_request')).map((a) => `${a.action}:${a.meta.to || 'new'}`)).toEqual(['create:new', 'update:confirmed', 'update:delivered', 'update:installed']);
  });

  it('permintaan batal membuka jalur lagi; permintaan massal hanya modul generik tanpa sumber', async () => {
    const m = await byCode('NT-B2');
    const made = await post(`/modules/${m.id}/request`);
    expect((await patch(`/requests/${made.body.data.id}`, { status: 'cancelled' })).body.data.status).toBe('cancelled');
    expect((await byCode('NT-B2')).status.key).toBe('none');
    expect((await post('/requests/bulk', { scope: 'program' })).status).toBe(400);
    expect((await post('/requests/bulk', { scope: 'lain' })).status).toBe(400);
    // Pareto: hanya ST-A2 yang prioritas, dan sarannya dikembangkan sendiri -> tidak ada yang diminta
    expect((await post('/requests/bulk', { scope: 'pareto' })).body.data).toMatchObject({ created: 0, skipped: 1 });
    const bulk = await post('/requests/bulk', { scope: 'program', jobRoleId: role.id, level: 'basic' });
    expect(bulk.status).toBe(201);
    expect(bulk.body.data).toMatchObject({ created: 1, skipped: 0 });
    expect((await byCode('NT-B2')).status.key).toBe('requested');
    expect((await post('/requests/bulk', { scope: 'program', jobRoleId: role.id, level: 'basic' })).body.data).toMatchObject({ created: 0, skipped: 1 });
  });

  it('draf pengembangan: buat, sunting, ajukan, dikembalikan, disetujui SME, lalu ditautkan ke course', async () => {
    const m = await byCode('ST-A2');
    const made = await post(`/modules/${m.id}/draft`);
    expect(made.status).toBe(201);
    const d = made.body.data;
    expect(d).toMatchObject({ status: 'draft', generatedBy: 'template', moduleCode: 'ST-A2' });
    expect(d.objectives).toHaveLength(3);
    expect(d.sessions).toHaveLength(5);
    expect((await post(`/modules/${m.id}/draft`)).status).toBe(200); // sudah ada: dikembalikan, tidak dibuat ulang
    expect((await post(`/modules/${m.id}/request`)).body.error.code).toBe('PATH_ACTIVE');
    expect((await byCode('ST-A2')).status).toEqual({ key: 'dev_draft', via: 'elgos' });

    // tujuan tanpa kriteria ukur tidak bisa diajukan
    const vague = d.objectives.map((o, i) => (i === 0 ? { ...o, text: 'Peserta paham konsep' } : o));
    expect((await request(app).put(`/api/li/drafts/${d.id}`).set(as('hr')).send({ objectives: vague })).status).toBe(200);
    const blocked = await post(`/drafts/${d.id}/submit`);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.message).toMatch(/1 tujuan pembelajaran belum terukur/);
    expect((await request(app).put(`/api/li/drafts/${d.id}`).set(as('hr')).send({ objectives: [{ kind: 'X', text: 'a' }] })).status).toBe(400);
    await request(app).put(`/api/li/drafts/${d.id}`).set(as('hr')).send({ objectives: d.objectives });

    // SME belum bisa meninjau draf yang belum diajukan; antrian SME kosong
    expect((await post(`/drafts/${d.id}/review`, { decision: 'approved' }, 'sme')).body.error.code).toBe('INVALID_STATE');
    expect((await get('/drafts', 'sme')).body.data).toEqual([]);
    expect((await get(`/drafts/${d.id}`, 'sme')).status).toBe(404); // belum diajukan: bukan urusan SME
    expect((await post(`/drafts/${d.id}/submit`)).body.data.status).toBe('sme_review');
    expect((await request(app).put(`/api/li/drafts/${d.id}`).set(as('hr')).send({ sessions: [] })).body.error.code).toBe('INVALID_STATE');
    expect((await request(app).delete(`/api/li/drafts/${d.id}`).set(as('hr'))).status).toBe(409);
    expect((await get('/drafts', 'sme')).body.data.map((x) => x.id)).toEqual([d.id]);
    expect((await get(`/drafts/${d.id}`, 'sme')).status).toBe(200);

    expect((await post(`/drafts/${d.id}/review`, { decision: 'returned' }, 'sme')).status).toBe(400); // catatan wajib
    const back = await post(`/drafts/${d.id}/review`, { decision: 'returned', note: 'Tambah studi kasus P1' }, 'sme');
    expect(back.body.data).toMatchObject({ status: 'returned', reviewNote: 'Tambah studi kasus P1', reviewerName: 'sme', reviewRecordedByHr: false });
    await post(`/drafts/${d.id}/submit`);
    expect((await post(`/drafts/${d.id}/review`, { decision: 'approved' })).status).toBe(400); // HR wajib menyebut nama SME
    const ok = await post(`/drafts/${d.id}/review`, { decision: 'approved', reviewerName: 'Pak Budi (SME)' });
    expect(ok.body.data).toMatchObject({ status: 'approved', reviewerName: 'Pak Budi (SME)', reviewRecordedByHr: true });
    // rancangan disetujui belum berarti modul tersedia
    expect((await byCode('ST-A2')).status).toEqual({ key: 'dev_approved', via: 'elgos' });
    expect((await patch(`/modules/${m.id}`, { catalogItemId: otherCatalogItem.id })).status).toBe(400);
    expect((await patch(`/modules/${m.id}`, { catalogItemId: inactiveCatalogItem.id })).status).toBe(400); // tidak ada di /catalog
    expect((await patch(`/modules/${m.id}`, {})).status).toBe(400);
    expect((await patch(`/modules/${m.id}`, { catalogItemId: catalogItem.id })).body.data.status).toEqual({ key: 'available', via: 'catalog' });
    expect((await patch(`/modules/${m.id}`, { catalogItemId: null })).body.data.status.key).toBe('dev_approved');
    const log = await audits('li.module_draft');
    expect(log.map((a) => a.meta.to || a.action)).toEqual(['create', 'update', 'update', 'sme_review', 'returned', 'sme_review', 'approved']);
    expect(log[1].meta).toMatchObject({ draftId: d.id, fields: ['objectives'] });
    expect(log[6].meta).toMatchObject({ reviewerName: 'Pak Budi (SME)', recordedByHr: true });
  });

  it('katalog course untuk menautkan modul hanya milik tenant ini', async () => {
    const list = (await get('/catalog')).body.data;
    expect(list.map((c) => c.id)).toContain(catalogItem.id);
    expect(list.map((c) => c.id)).not.toContain(otherCatalogItem.id);
    expect(list.map((c) => c.id)).not.toContain(inactiveCatalogItem.id);
    expect((await get('/catalog', 'dimas')).status).toBe(403);
  });

  it('program per jabatan dan level', async () => {
    const p = await get(`/programs?jobRoleId=${role.id}&level=advanced`);
    expect(p.status).toBe(200);
    expect(p.body.data.jobRoles).toEqual([
      expect.objectContaining({ name: 'Engineer Service Delivery', hasDictionary: true }),
      expect.objectContaining({ name: 'Project Manager', hasDictionary: false }),
    ]);
    expect(p.body.data.levels).toEqual([{ level: 'basic', count: 1 }, { level: 'intermediate', count: 1 }, { level: 'advanced', count: 1 }]);
    expect(p.body.data.kpis).toEqual({ courses: 1, available: 0, inProgress: 1, noSource: 0 });
    expect(p.body.data.groups).toEqual([{ stream: 'Specific Technical', modules: [expect.objectContaining({ code: 'ST-A2', priority: expect.objectContaining({ rank: 1 }) })] }]);
    expect(p.body.data.pareto.codes).toEqual(['ST-A2']);
    // default: jabatan pertama yang punya modul, level basic
    const def = await get('/programs');
    expect(def.body.data).toMatchObject({ jobRoleId: role.id, level: 'basic' });
    expect((await get('/programs?jobRoleId=00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('hanya HR; tenant lain tidak melihat apa pun; flag mati menutup modul', async () => {
    for (const who of ['atasan', 'dimas', 'sme']) expect((await get('/modules', who)).status).toBe(403);
    expect((await post('/requests/bulk', { scope: 'pareto' }, 'dimas')).status).toBe(403);
    expect((await get('/drafts', 'dimas')).status).toBe(403);
    // probe modul: HR dan peninjau (SME) boleh, karyawan tidak
    expect((await get('/', 'sme')).status).toBe(200);
    expect((await get('/', 'dimas')).status).toBe(403);
    const m = await byCode('ST-A2');
    expect((await get('/modules', 'luar')).body.data).toEqual([]);
    expect((await get(`/modules/${m.id}`, 'luar')).status).toBe(404);
    expect((await post(`/modules/${m.id}/request`, {}, 'luar')).status).toBe(404);
    expect((await post(`/modules/${m.id}/draft`, {}, 'luar')).status).toBe(404);
    expect((await get('/requests', 'luar')).body.data).toEqual({ vendor: [], drafts: [], candidates: [] });
    const [draft] = (await get('/requests')).body.data.drafts;
    expect((await get(`/drafts/${draft.id}`, 'luar')).status).toBe(404);
    await db.query(`UPDATE feature_flags SET enabled = false WHERE tenant_id = :t AND key = 'module.li'`, { replacements: { t: tenant.id } });
    const off = await get('/modules');
    expect(off.status).toBe(403);
    expect(off.body.error.code).toBe('FEATURE_DISABLED');
    await db.query(`UPDATE feature_flags SET enabled = true WHERE tenant_id = :t AND key = 'module.li'`, { replacements: { t: tenant.id } });
  });
});
