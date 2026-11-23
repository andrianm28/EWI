const { normalizeSpec, onboardTenant } = require('../../src/core/tenant/onboarding');

const ID = '3f2b8c1e-5d4a-4e6b-9c7d-0a1b2c3d4e5f';
const base = () => ({
  id: ID, slug: 'uji-internal', name: 'Uji Internal', products: ['full_suite'], flags: ['module.dna'],
  users: [{ email: 'HR@Uji.test', name: 'HR', role: 'hr_admin' }],
});

describe('normalizeSpec', () => {
  it('menormalkan email dan flag daftar', () => {
    const s = normalizeSpec(base());
    expect(s.users[0].email).toBe('hr@uji.test');
    expect(s.flags).toEqual({ 'module.dna': true });
  });

  it('mengumpulkan semua kesalahan sekaligus', () => {
    expect(() => normalizeSpec({ id: 'x', slug: 'Bad Slug', products: ['emas'], flags: ['tidak.ada'], users: [{ email: 'a@b.c', role: 'learner' }] }))
      .toThrow(/id harus UUID[\s\S]*slug wajib[\s\S]*name wajib[\s\S]*produk tidak dikenal: emas[\s\S]*flag tidak dikenal[\s\S]*role harus/);
  });

  it('wajib minimal satu tenant_admin atau hr_admin (B12)', () => {
    expect(() => normalizeSpec({ ...base(), users: [{ email: 'a@b.test', role: 'eta_admin' }] })).toThrow(/minimal satu tenant_admin atau hr_admin/);
    expect(normalizeSpec({ ...base(), users: [{ email: 'a@b.test', role: 'tenant_admin' }] }).users[0].role).toBe('tenant_admin');
  });

  it('products boleh kosong: modul dinyalakan terpisah lewat konsol Super Admin (B12)', () => {
    expect(normalizeSpec({ ...base(), products: [] }).products).toEqual([]);
  });

  it('id wajib bila KMS', () => {
    const { id, ...noId } = base();
    expect(id).toBeDefined();
    expect(() => normalizeSpec(noId, { requireId: true })).toThrow(/Terraform/);
    expect(normalizeSpec(noId).id).toBeNull();
  });

  it('menolak email ganda', () => {
    expect(() => normalizeSpec({ ...base(), users: [...base().users, { email: 'hr@uji.test', role: 'hr_admin' }] })).toThrow(/email ganda/);
  });
});

describe('onboardTenant tanpa database', () => {
  const emptyDb = () => {
    const calls = [];
    return { calls, query: async (sql) => { calls.push(sql); return { rows: [] }; } };
  };

  it('produksi menolak penyedia kunci lokal', async () => {
    const db = emptyDb();
    await expect(onboardTenant({ db, provider: { name: 'local' }, spec: base(), production: true })).rejects.toThrow(/wajib ENCRYPTION_PROVIDER=kms/);
    expect(db.calls).toEqual([]);
  });

  it('alias KMS belum ada: berhenti sebelum transaksi dan menyebut tenant_ids', async () => {
    const db = emptyDb();
    const provider = {
      name: 'kms', keyRef: (t) => `alias/elgos-prod-tenant-${t}`,
      generateDataKey: async () => { throw new Error('NotFoundException: Alias is not found'); },
    };
    await expect(onboardTenant({ db, provider, spec: base(), production: true }))
      .rejects.toThrow(/alias\/elgos-prod-tenant-3f2b8c1e[\s\S]*tenant_ids/);
    expect(db.calls.some((s) => s === 'BEGIN' || /INSERT/.test(s))).toBe(false);
  });
});
