const { loadConfig } = require('../../src/config/env');

describe('loadConfig', () => {
  it('menolak boot tanpa EWI_JWT_SECRET (tidak ada fallback, B22)', () => {
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow(/EWI_JWT_SECRET/);
  });
  it('menolak secret yang sama dengan SESSION_SECRET EliteMentor', () => {
    const s = 'x'.repeat(40);
    expect(() => loadConfig({ NODE_ENV: 'test', EWI_JWT_SECRET: s, SESSION_SECRET: s })).toThrow(/SESSION_SECRET/);
  });
  it('mewajibkan DATABASE_URL di luar test', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', EWI_JWT_SECRET: 'x'.repeat(40) })).toThrow(/DATABASE_URL/);
  });
  it('memakai audience ewi secara default', () => {
    expect(loadConfig({ NODE_ENV: 'test', EWI_JWT_SECRET: 'x'.repeat(40) }).jwt.audience).toBe('ewi');
  });
  it('R3-2: produksi wajib SES dengan MAIL_FROM; dev default log', () => {
    const base = { EWI_JWT_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x' };
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/MAIL_PROVIDER=ses/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', MAIL_PROVIDER: 'ses' })).toThrow(/MAIL_FROM/);
    expect(loadConfig({ ...base, NODE_ENV: 'production', MAIL_PROVIDER: 'ses', MAIL_FROM: 'ELGOS <no-reply@x.id>' }).mail.provider).toBe('ses');
    const dev = loadConfig({ ...base, NODE_ENV: 'development', CORS_ORIGIN: 'https://dev.x.id/,http://a' });
    expect(dev.mail.provider).toBe('log');
    expect(dev.appBaseUrl).toBe('https://dev.x.id');
  });
});
