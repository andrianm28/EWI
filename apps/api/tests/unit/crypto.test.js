const crypto = require('crypto');
const { createFieldCipher, localProvider, kmsProvider } = require('../../src/core/crypto');

function memKeyStore() {
  const rows = new Map();
  return {
    rows,
    async get(t) { return rows.get(t) || null; },
    async insert(t, r) { if (!rows.has(t)) rows.set(t, r); return rows.get(t); },
  };
}

describe('R2-3 enkripsi kolom per tenant', () => {
  const master = crypto.randomBytes(32);
  const make = (ks = memKeyStore()) => ({ ks, c: createFieldCipher({ provider: localProvider(master), keyStore: ks }) });

  it('enkripsi/dekripsi bolak-balik; ciphertext acak dan tidak memuat teks asli', async () => {
    const { c, ks } = make();
    const a = await c.encrypt('t-1', 'Saya belum paham SLA');
    const b = await c.encrypt('t-1', 'Saya belum paham SLA');
    expect(a).toMatch(/^enc:v1:1:/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('SLA');
    expect(await c.decrypt('t-1', a)).toBe('Saya belum paham SLA');
    expect(ks.rows.get('t-1')).toMatchObject({ version: 1, keyRef: 'local' });
  });

  it('kunci berbeda per tenant; ciphertext tenant lain ditolak', async () => {
    const { c, ks } = make();
    const a = await c.encrypt('t-1', 'rahasia');
    await c.encrypt('t-2', 'x');
    expect(ks.rows.get('t-1').wrappedKey).not.toBe(ks.rows.get('t-2').wrappedKey);
    await expect(c.decrypt('t-2', a)).rejects.toThrow();
  });

  it('DEK terbungkus tetap bisa dibuka setelah proses baru (cache kosong)', async () => {
    const { c, ks } = make();
    const a = await c.encrypt('t-1', 'tetap');
    const fresh = createFieldCipher({ provider: localProvider(master), keyStore: ks });
    expect(await fresh.decrypt('t-1', a)).toBe('tetap');
    const wrongMaster = createFieldCipher({ provider: localProvider(crypto.randomBytes(32)), keyStore: ks });
    await expect(wrongMaster.decrypt('t-1', a)).rejects.toThrow();
  });

  it('nilai lama tanpa awalan enc: dan null dikembalikan apa adanya; JSON dan open()', async () => {
    const { c } = make();
    expect(await c.decrypt('t-1', 'teks lama')).toBe('teks lama');
    expect(await c.encrypt('t-1', null)).toBeNull();
    const j = await c.encryptJson('t-1', [{ a: 1 }]);
    expect(await c.decryptJson('t-1', j)).toEqual([{ a: 1 }]);
    const rows = [{ title: await c.encrypt('t-1', 'A'), n: 1 }, { title: 'lama', n: 2 }];
    expect(await c.open('t-1', rows, ['title'])).toEqual([{ title: 'A', n: 1 }, { title: 'lama', n: 2 }]);
  });

  it('provider KMS memakai alias per tenant dan encryption context tenant', async () => {
    const calls = [];
    const dek = crypto.randomBytes(32);
    const client = {
      async send(cmd) {
        calls.push({ name: cmd.constructor.name, input: cmd.input });
        if (cmd.constructor.name === 'GenerateDataKeyCommand') return { Plaintext: dek, CiphertextBlob: Buffer.from('wrapped'), KeyId: 'arn:aws:kms:x:1:key/abc' };
        return { Plaintext: dek };
      },
    };
    const ks = memKeyStore();
    const c = createFieldCipher({ provider: kmsProvider({ region: 'ap-southeast-3', aliasPrefix: 'elgos-tenant', client }), keyStore: ks });
    const v = await c.encrypt('t-9', 'halo');
    expect(calls[0]).toEqual({ name: 'GenerateDataKeyCommand', input: { KeyId: 'alias/elgos-tenant-t-9', KeySpec: 'AES_256', EncryptionContext: { tenant: 't-9' } } });
    const fresh = createFieldCipher({ provider: kmsProvider({ aliasPrefix: 'elgos-tenant', client }), keyStore: ks });
    expect(await fresh.decrypt('t-9', v)).toBe('halo');
    expect(calls[1]).toMatchObject({ name: 'DecryptCommand', input: { KeyId: 'arn:aws:kms:x:1:key/abc', EncryptionContext: { tenant: 't-9' } } });
  });
});
