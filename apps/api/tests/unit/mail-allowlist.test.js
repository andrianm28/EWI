const { loadConfig, STAGING_DEFAULT_MAIL_DOMAINS } = require('../../src/config/env');
const { memoryMailer, withDomainAllowlist, recipientDomain, createMailer } = require('../../src/integrations/mailer');

const base = { NODE_ENV: 'production', EWI_JWT_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgres://x', MAIL_PROVIDER: 'ses', MAIL_FROM: 'a@b.c', ENCRYPTION_PROVIDER: 'kms', BEDROCK_MODEL_ID: 'anthropic.claude-test-v1:0' };

describe('PK-07 / I-5 email staging hanya ke domain yang diizinkan', () => {
  it('MAIL_ALLOWED_DOMAINS dibaca, dinormalisasi, dan dipakai', () => {
    expect(loadConfig({ ...base, MAIL_ALLOWED_DOMAINS: ' EliteAcademy.id, @elitery.com ' }).mail.allowedDomains).toEqual(['eliteacademy.id', 'elitery.com']);
  });

  it('staging tanpa MAIL_ALLOWED_DOMAINS memakai domain internal bawaan; produksi tanpa batas', () => {
    expect(loadConfig({ ...base, EWI_ENV: 'staging' }).mail.allowedDomains).toEqual([...STAGING_DEFAULT_MAIL_DOMAINS]);
    expect(loadConfig({ ...base, EWI_ENV: 'prod' }).mail.allowedDomains).toEqual([]);
  });

  it("'*' ditolak di staging", () => {
    expect(() => loadConfig({ ...base, EWI_ENV: 'staging', MAIL_ALLOWED_DOMAINS: '*' })).toThrow(/tidak boleh di staging/);
    expect(loadConfig({ ...base, EWI_ENV: 'prod', MAIL_ALLOWED_DOMAINS: '*' }).mail.allowedDomains).toEqual([]);
  });

  it('domain penerima dibaca dari alamat biasa maupun berformat nama', () => {
    expect(recipientDomain('rina@Elitery.com')).toBe('elitery.com');
    expect(recipientDomain('Rina <rina@sub.eliteacademy.id>')).toBe('sub.eliteacademy.id');
    expect(recipientDomain('bukan-email')).toBe('');
  });

  it('email ke domain lain tidak dikirim dan tidak melempar error; subdomain diizinkan', async () => {
    const inner = memoryMailer();
    const logger = { warn: jest.fn() };
    const m = withDomainAllowlist(inner, ['eliteacademy.id'], logger);
    await m.send({ to: 'a@eliteacademy.id', subject: 's', text: 'link' });
    await m.send({ to: 'b@hr.eliteacademy.id', subject: 's', text: 'link' });
    expect(await m.send({ to: 'c@gmail.com', subject: 's', text: 'https://rahasia' })).toEqual({ blocked: true });
    await m.send({ to: 'd@noteliteacademy.id', subject: 's', text: 'link' });
    expect(inner.sent.map((x) => x.to)).toEqual(['a@eliteacademy.id', 'b@hr.eliteacademy.id']);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn.mock.calls[0][0]).not.toContain('rahasia');
  });

  it('createMailer membungkus penyedia bila ada daftar domain', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const m = createMailer({ provider: 'memory', allowedDomains: ['elitery.com'] });
    await m.send({ to: 'x@luar.com', subject: 's', text: 't' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    expect(createMailer({ provider: 'memory' }).allowedDomains).toBeUndefined();
  });
});
