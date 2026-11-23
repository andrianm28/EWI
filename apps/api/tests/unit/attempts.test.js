// B1 + B12: percobaan masuk. Yang terikat tenant ke audit tenant; yang tidak (org/akun tak dikenal, link tidak valid)
// hanya menaikkan hitungan platform tanpa identitas.
const { createAttemptLog } = require('../../src/core/auth/attempts');

const tick = () => new Promise((r) => setImmediate(r));

describe('createAttemptLog', () => {
  const setup = (countAttempt = jest.fn()) => {
    const audit = { record: jest.fn(async () => {}) };
    const platformLog = { countAttempt };
    return { audit, platformLog, attempts: createAttemptLog(audit, { platformLog, logger: { error: jest.fn() } }) };
  };

  it('tanpa tenant: menaikkan hitungan platform, tidak menulis audit tenant', async () => {
    const { audit, platformLog, attempts } = setup();
    await attempts.record({}, { method: 'email_link', outcome: 'unknown_org' });
    expect(platformLog.countAttempt).toHaveBeenCalledWith('unknown_org');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('dengan tenant: audit tenant, tanpa hitungan platform', async () => {
    const { audit, platformLog, attempts } = setup();
    await attempts.record({ id: 'u1', tenantId: 't1', role: 'learner' }, { method: 'email_link', outcome: 'link_sent' });
    expect(audit.record).toHaveBeenCalled();
    expect(platformLog.countAttempt).not.toHaveBeenCalled();
  });

  it('hitungan gagal tidak mengubah jawaban', async () => {
    const { attempts } = setup(jest.fn(() => { throw new Error('db mati'); }));
    await expect(attempts.record({}, { outcome: 'invalid_link' })).resolves.toBeUndefined();
    await tick();
  });

  it('outcome lain tanpa tenant diabaikan; tanpa platformLog tetap jalan', async () => {
    const { platformLog, attempts } = setup();
    await attempts.record({}, { outcome: 'link_sent' });
    expect(platformLog.countAttempt).not.toHaveBeenCalled();
    await expect(createAttemptLog({ record: jest.fn() }).record({}, { outcome: 'unknown_org' })).resolves.toBeUndefined();
  });

  it('unknownAccount membedakan organisasi tak dikenal dan akun tak dikenal', async () => {
    const { platformLog, attempts } = setup();
    const users = { findTenantBySlug: async (slug) => (slug === 'ada' ? { id: 't1' } : null) };
    await attempts.unknownAccount(users, 'tidak-ada', 'email_link');
    await attempts.unknownAccount(users, 'ada', 'password');
    expect(platformLog.countAttempt.mock.calls).toEqual([['unknown_org'], ['unknown_account']]);
  });
});
