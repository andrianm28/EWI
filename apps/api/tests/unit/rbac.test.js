const { visibleEmployeeScope, ROLES } = require('../../src/core/rbac');

describe('visibleEmployeeScope (RG-3)', () => {
  it('HR melihat semua', () => {
    expect(visibleEmployeeScope({ id: 'a', role: ROLES.HR_ADMIN })).toEqual({ all: true });
  });
  it('atasan langsung melihat dirinya dan timnya', () => {
    expect(visibleEmployeeScope({ id: 's', role: ROLES.SUPERVISOR }, ['l1', 'l2'])).toEqual({ userIds: ['s', 'l1', 'l2'] });
  });
  it('learner hanya melihat dirinya', () => {
    expect(visibleEmployeeScope({ id: 'l', role: ROLES.LEARNER }, ['x'])).toEqual({ userIds: ['l'] });
  });
});

describe('Super Admin dan isi data karyawan (keputusan user 24 Nov)', () => {
  const { denyEmployeeContent } = require('../../src/core/rbac');
  it('cakupan Super Admin kosong: tidak ada data karyawan per orang', () => {
    expect(visibleEmployeeScope({ id: 'e', role: ROLES.ETA_ADMIN }, ['x'])).toEqual({ userIds: [] });
  });
  it('denyEmployeeContent menolak Super Admin dan meloloskan peran lain', () => {
    const run = (user) => { let err; denyEmployeeContent({ user }, {}, (e) => { err = e; }); return err; };
    expect(run({ role: ROLES.ETA_ADMIN })).toMatchObject({ status: 403, code: 'EMPLOYEE_CONTENT_PRIVATE' });
    for (const role of [ROLES.HR_ADMIN, ROLES.SUPERVISOR, ROLES.LEARNER]) expect(run({ role })).toBeUndefined();
    expect(run(undefined)).toMatchObject({ status: 401 });
  });
});
