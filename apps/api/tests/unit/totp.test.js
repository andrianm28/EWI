// B1: kode autentikator (TOTP, RFC 6238) tanpa dependensi luar.
const { generateSecret, base32Encode, base32Decode, codeAt, verify, otpauthUrl } = require('../../src/core/auth/totp');

// Vektor RFC 6238 (SHA-1): kunci ASCII "12345678901234567890", 8 digit -> 6 digit terakhir
const RFC_KEY = base32Encode(Buffer.from('12345678901234567890'));
const VECTORS = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']];

describe('TOTP RFC 6238', () => {
  it.each(VECTORS)('detik %i menghasilkan %s', (sec, code) => {
    expect(codeAt(RFC_KEY, Math.floor(sec / 30))).toBe(code);
  });

  it('base32 bolak-balik dan secret baru 160 bit', () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
  });

  it('menerima langkah sekarang dan satu langkah sebelum/sesudah, menolak di luar itu', () => {
    const now = 1111111111 * 1000;
    const step = Math.floor(1111111111 / 30);
    expect(verify(RFC_KEY, codeAt(RFC_KEY, step), { now })).toEqual({ ok: true, step });
    expect(verify(RFC_KEY, codeAt(RFC_KEY, step - 1), { now }).ok).toBe(true);
    expect(verify(RFC_KEY, codeAt(RFC_KEY, step + 1), { now }).ok).toBe(true);
    expect(verify(RFC_KEY, codeAt(RFC_KEY, step - 2), { now }).ok).toBe(false);
  });

  it('menolak kode yang langkahnya sudah pernah dipakai (anti pakai ulang)', () => {
    const now = 1111111111 * 1000;
    const step = Math.floor(1111111111 / 30);
    expect(verify(RFC_KEY, codeAt(RFC_KEY, step), { now, lastStep: step }).ok).toBe(false);
    expect(verify(RFC_KEY, codeAt(RFC_KEY, step + 1), { now, lastStep: step })).toEqual({ ok: true, step: step + 1 });
  });

  it('menolak masukan yang bukan 6 digit', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, 123456]) {
      expect(verify(RFC_KEY, bad, { now: 0 }).ok).toBe(false);
    }
  });

  it('otpauthUrl memuat penerbit ELGOS dan akun', () => {
    const url = otpauthUrl({ secret: RFC_KEY, account: 'hr@elgos.test', tenantName: 'PT Contoh' });
    expect(url).toMatch(/^otpauth:\/\/totp\/ELGOS%20\(PT%20Contoh\):hr%40elgos\.test\?/);
    expect(url).toContain(`secret=${RFC_KEY}`);
    expect(url).toContain('issuer=ELGOS');
  });
});
