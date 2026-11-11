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
