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
});
