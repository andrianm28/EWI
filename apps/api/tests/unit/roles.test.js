// B2: peran, tampilan, dan menu per tampilan (docs/designs/b2-peran.md).
const { ROLES, viewOf, switchableRoles, describeRoles, VIEWS } = require('../../src/core/rbac/roles');
const { buildMenu } = require('../../src/core/rbac/menu');
const { denyRoles } = require('../../src/core/rbac');

describe('tampilan per peran (K2)', () => {
  it('lima tampilan; pimpinan dan role leader memakai tampilan Atasan (selaras shell B0), narasumber Karyawan', () => {
    expect(Object.keys(VIEWS)).toEqual(['hr', 'atasan', 'karyawan', 'admin', 'super']);
    expect(['hr_admin', 'supervisor', 'tenant_admin', 'eta_admin', 'learner', 'pimpinan', 'role_leader', 'sme'].map(viewOf))
      .toEqual(['hr', 'atasan', 'admin', 'super', 'karyawan', 'atasan', 'atasan', 'karyawan']);
  });

  it('HR, Atasan, dan Admin Tenant juga karyawan; Super Admin tunggal', () => {
    expect(switchableRoles(['hr_admin'])).toEqual(['hr_admin', 'learner']);
    expect(switchableRoles(['supervisor'])).toEqual(['supervisor', 'learner']);
    expect(switchableRoles(['tenant_admin', 'hr_admin'])).toEqual(['tenant_admin', 'hr_admin', 'learner']);
    expect(switchableRoles(['learner'])).toEqual(['learner']);
    expect(switchableRoles(['pimpinan'])).toEqual(['pimpinan', 'learner']);
    expect(switchableRoles(['supervisor', 'sme'])).toEqual(['supervisor', 'sme']);
    expect(switchableRoles(['eta_admin', 'hr_admin'])).toEqual(['eta_admin']);
    expect(switchableRoles(['tidak-ada'])).toEqual([]);
  });

  it('label: "Karyawan (saya)" hanya untuk akun dengan tampilan lain', () => {
    expect(describeRoles(['hr_admin', 'learner'])).toEqual([
      { role: 'hr_admin', view: 'hr', label: 'HR / L&D' }, { role: 'learner', view: 'karyawan', label: 'Karyawan (saya)' },
    ]);
    expect(describeRoles(['learner'])).toEqual([{ role: 'learner', view: 'karyawan', label: 'Karyawan' }]);
  });

  it('denyRoles menolak peran yang disebut dengan kode yang diberikan', () => {
    const mw = denyRoles([ROLES.ETA_ADMIN], 'X');
    const run = (user) => { let err; mw({ user }, {}, (e) => { err = e; }); return err; };
    expect(run({ role: 'eta_admin' })).toMatchObject({ status: 403, code: 'X' });
    expect(run({ role: 'hr_admin' })).toBeUndefined();
    expect(run(undefined)).toMatchObject({ status: 401 });
  });
});

describe('menu per tampilan (mockup fungsi N)', () => {
  const all = { 'module.cca': true, 'module.dna': true, 'module.tna': true, 'module.ina': true, 'promotion.recommendation': true };
  const full = { flags: all, submodules: ['cca', 'dna', 'tna', 'ina'] };
  const keys = (view, opts = full) => buildMenu(view, opts).map((m) => m.key || `[${m.group}]`);

  it('urutan dan kunci layar sama dengan mockup', () => {
    expect(keys('hr')).toEqual(['dash', '[lna]', 'cc', 'dna', 'tna', 'ina', '[li]', 'lib', 'prog', 'req', 'ld', 'lim', 'cp']);
    expect(keys('atasan')).toEqual(['dash', '[lna]', 'aiv', 'dna', 'tna', 'ina', 'lim', 'cp']);
    expect(keys('karyawan')).toEqual(['my', 'aiv', 'iv', 'li']);
    expect(keys('admin')).toEqual(['users', 'jobs', 'cfg']);
    expect(keys('super')).toEqual(['tenants', 'platform']);
    expect(buildMenu('hr', full)[0]).toEqual({ key: 'dash', label: 'Dashboard utama', icon: 'dashboard', level: 0, group: null, enabled: true });
    expect(buildMenu('atasan', full)[0].label).toBe('Dashboard tim');
    expect(buildMenu('hr', full)[2]).toMatchObject({ key: 'cc', level: 1, enabled: true });
    expect(buildMenu('hr', full)[1]).toEqual({ key: null, label: 'Learning Needs Analysis', icon: 'query_stats', level: 0, group: 'lna', enabled: true });
  });

  it('enabled mengikuti flag, entitlement, dan flag yang belum terdaftar', () => {
    const on = (view, opts) => buildMenu(view, opts).filter((m) => m.enabled).map((m) => m.key || `[${m.group}]`);
    expect(on('hr', { flags: {}, submodules: [] })).toEqual(['dash']);
    expect(on('hr', { flags: { 'module.tna': true }, submodules: ['tna'] })).toEqual(['dash', '[lna]', 'tna']);
    expect(on('hr', { flags: { 'module.tna': true }, submodules: [] })).toEqual(['dash']); // flag tanpa entitlement
    expect(on('hr', full)).not.toContain('lib'); // module.li belum terdaftar
    expect(on('hr', { ...full, flags: { ...all, 'module.li': true } })).toContain('lib');
    expect(on('karyawan', { flags: { 'module.tna': true }, submodules: ['tna'] })).toEqual(['my', 'iv', 'li']);
  });
});
