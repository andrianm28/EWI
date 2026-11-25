// B11: aturan peran Admin Tenant dan opsi impor per jabatan (tanpa DB).
const { isTenantAdmin, assignableRoles, roleLabel, requireTenantAdmin } = require('../../src/modules/tenant-admin/access');
const { getKind } = require('../../src/modules/imports/kinds');
const { validateRows } = require('../../src/modules/imports/engine');
const express = require('express');
const request = require('supertest');
const tenantAdmin = require('../../src/modules/tenant-admin');
const { errorHandler } = require('../../src/core/errors');

describe('Gerbang impor Admin Tenant (B11)', () => {
  // kill switch bersifat global, jadi diuji dengan flag tiruan (bukan di DB bersama test lain)
  function makeApp({ killed = [], entitled = ['dna', 'tna'] } = {}) {
    const app = express();
    app.use((req, _res, next) => { req.user = { id: 'u', role: 'tenant_admin' }; req.tenantId = 't'; next(); });
    app.use(tenantAdmin.router({
      stores: { tenantAdmin: { actor: async () => ({ role: 'tenant_admin', status: 'active' }) } },
      flags: {
        isEnabled: async (_t, key) => key === 'admin.tenant',
        isKnown: () => false,
        detail: async () => killed.map((key) => ({ key, killSwitch: true })),
      },
      entitlements: { has: async (_t, sm) => entitled.includes(sm) },
      audit: {}, settings: {}, links: {},
    }));
    app.use(errorHandler);
    return app;
  }

  it('hanya jenis kamus (dna) dan kinerja (tna) yang dibuka', async () => {
    const app = makeApp();
    expect((await request(app).get('/imports/dna/templates')).body.data.map((k) => k.key)).toEqual(['dna_competencies']);
    expect((await request(app).get('/imports/tna/templates')).body.data.map((k) => k.key)).toEqual(['tna_performance']);
    expect((await request(app).get('/imports/dna/templates/employees.csv')).status).toBe(404);
  });

  it('tanpa entitlement atau saat kill switch modul aktif: ditolak', async () => {
    expect((await request(makeApp({ entitled: ['dna'] })).get('/imports/tna/templates')).body.error.code).toBe('NOT_ENTITLED');
    const app = makeApp({ killed: ['module.tna'] });
    expect((await request(app).get('/imports/tna/templates')).body.error.code).toBe('FEATURE_DISABLED');
    expect((await request(app).get('/imports/dna/templates')).status).toBe(200);
  });
});

describe('Akses Admin Tenant (B11)', () => {
  it('hanya eta_admin dan tenant_admin lolos; masa interim hr_admin dicabut (keputusan user 24 Nov)', () => {
    expect(isTenantAdmin({ role: 'eta_admin' })).toBe(true);
    expect(isTenantAdmin({ role: 'tenant_admin' })).toBe(true);
    for (const role of ['hr_admin', 'learner', 'supervisor', 'pimpinan', 'role_leader', 'sme']) expect(isTenantAdmin({ role })).toBe(false);
    // kontrak B2: hanya peran aktif yang dihitung, bukan daftar peran yang boleh dipilih
    expect(isTenantAdmin({ role: 'learner', roles: ['learner', 'tenant_admin'] })).toBe(false);
    expect(isTenantAdmin(null)).toBe(false);
  });

  it('peran yang boleh diberikan tidak pernah memuat eta_admin', () => {
    expect(assignableRoles()).not.toContain('eta_admin');
    expect(assignableRoles()).toEqual(expect.arrayContaining(['hr_admin', 'supervisor', 'learner']));
    expect(roleLabel('learner')).toBe('Karyawan');
    expect(roleLabel('tenant_admin')).toBe('Admin Tenant');
  });

  it('Super Admin hanya boleh memberi tenant_admin (R8-1); Admin Tenant semua kecuali eta_admin', () => {
    expect(assignableRoles({ role: 'eta_admin' })).toEqual(['tenant_admin']);
    expect(assignableRoles({ role: 'tenant_admin' })).toEqual(expect.arrayContaining(['tenant_admin', 'hr_admin', 'learner']));
    expect(assignableRoles({ role: 'tenant_admin' })).not.toContain('eta_admin');
  });

  it('gerbang membaca peran dan status pelaku dari store, bukan hanya dari token', async () => {
    const run = (user, actor) => new Promise((resolve) => {
      requireTenantAdmin({ actor: async () => actor })({ user, tenantId: 't' }, null, (err) => resolve(err ? err.code : 'ok'));
    });
    expect(await run({ id: 'u', role: 'tenant_admin' }, { role: 'tenant_admin', status: 'active' })).toBe('ok');
    expect(await run({ id: 'u', role: 'tenant_admin' }, { role: 'learner', status: 'active' })).toBe('ROLE_FORBIDDEN');
    expect(await run({ id: 'u', role: 'tenant_admin' }, { role: 'tenant_admin', status: 'disabled' })).toBe('ROLE_FORBIDDEN');
    expect(await run({ id: 'u', role: 'tenant_admin' }, null)).toBe('ROLE_FORBIDDEN');
    expect(await run({ id: 'u', role: 'learner' }, { role: 'tenant_admin', status: 'active' })).toBe('ROLE_FORBIDDEN');
    // hr_admin tidak lagi lolos, walau DB mencatat peran itu aktif
    expect(await run({ id: 'u', role: 'hr_admin' }, { role: 'hr_admin', status: 'active' })).toBe('ROLE_FORBIDDEN');
    expect(await run(null, null)).toBe('UNAUTHORIZED');
  });

  it('DC-1: peran aktif di token harus masih diberikan di DB (users.role, atau daftar peran B2)', async () => {
    const run = (user, actor) => new Promise((resolve) => {
      requireTenantAdmin({ actor: async () => actor })({ user, tenantId: 't' }, null, (err) => resolve(err ? err.code : 'ok'));
    });
    // B2: tenant_admin sebagai peran tambahan, peran utama hr_admin → tidak terkunci
    expect(await run({ id: 'u', role: 'tenant_admin' }, { role: 'hr_admin', roles: ['hr_admin', 'tenant_admin'], status: 'active' })).toBe('ok');
    // peran aktif di token sudah dicabut di DB, walau peran DB lain juga admin
    expect(await run({ id: 'u', role: 'tenant_admin' }, { role: 'hr_admin', status: 'active' })).toBe('ROLE_FORBIDDEN');
    expect(await run({ id: 'u', role: 'tenant_admin' }, { role: 'hr_admin', roles: ['hr_admin'], status: 'active' })).toBe('ROLE_FORBIDDEN');
  });
});

describe('Impor kamus per jabatan (B11)', () => {
  const roles = [{ id: 'jr-1', name: 'Engineer', levels: [{ id: 'lv-1', name: 'Junior' }] }, { id: 'jr-2', name: 'Sales', levels: [] }];
  const stores = { dna: { listJobRoles: async () => roles, listCompetencies: async () => [], listJobFunctions: async () => [] } };
  const kind = getKind('dna_competencies');
  const check = (rows, options) => validateRows(kind, rows, { stores, tenantId: 't', options });

  it('tanpa opsi: perilaku lama (Job Role kosong = kompetensi inti, sumber hr_rule)', async () => {
    const { accepted } = await check([{ name: 'Integritas' }], {});
    expect(accepted[0].value).toMatchObject({ kind: 'core', jobRoleId: null, source: 'hr_rule' });
  });

  it('opsi jobRoleId + source mengisi baris yang kolomnya kosong', async () => {
    const { accepted, rejected } = await check([
      { name: 'Ticket Life Cycle' },
      { name: 'RCA', jobRole: 'engineer', careerLevel: 'Junior', source: 'aturan hr' },
      { name: 'Salah jabatan', jobRole: 'Sales' },
      { name: 'Inti', kind: 'inti' },
    ], { jobRoleId: 'jr-1', source: 'dacum' });
    expect(accepted.map((a) => a.value)).toEqual([
      expect.objectContaining({ name: 'Ticket Life Cycle', kind: 'job', jobRoleId: 'jr-1', source: 'dacum' }),
      expect.objectContaining({ name: 'RCA', jobRoleId: 'jr-1', careerLevelId: 'lv-1', source: 'hr_rule' }),
    ]);
    expect(rejected.map((r) => r.reason)).toEqual([expect.stringMatching(/Sales/), expect.stringMatching(/inti/)]);
  });

  it('jabatan di luar tenant dan sumber tak dikenal ditolak sebelum baris diproses', async () => {
    await expect(check([{ name: 'X' }], { jobRoleId: 'jr-lain' })).rejects.toMatchObject({ status: 400 });
    await expect(check([{ name: 'X' }], { jobRoleId: 'jr-1', source: 'ngawur' })).rejects.toMatchObject({ status: 400 });
  });

  it('opsi internal tidak tampil sebagai isian di layar impor HR; sumber KPI dibatasi 64 karakter', () => {
    expect(kind.options.every((o) => o.internal)).toBe(true);
    const perf = getKind('tna_performance');
    expect(perf.checkOptions({ period: '2026-11', source: 'HRIS' })).toBeNull();
    expect(perf.checkOptions({ period: '2026-11', source: 'x'.repeat(65) })).toMatch(/64/);
  });
});
