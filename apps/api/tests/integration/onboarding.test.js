// PK-13: dua tenant dibuat tanpa SQL manual, aman diulang. Jalan hanya bila DATABASE_URL di-set.
const crypto = require('crypto');
const { Client } = require('pg');
const { localProvider, createFieldCipher } = require('../../src/core/crypto');
const { onboardTenant } = require('../../src/core/tenant/onboarding');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('onboarding tenant (Postgres)', () => {
  let db;
  const provider = localProvider(crypto.randomBytes(32));
  const sfx = Date.now().toString(36);
  const uji = {
    id: crypto.randomUUID(), slug: `uji-${sfx}`, name: 'Uji Internal', products: ['full_suite'],
    flags: ['module.dna', 'module.tna'], settings: { tna: { interviewScope: 'red_only' } },
    users: [{ email: `admin-${sfx}@uji.test`, name: 'Admin Uji', role: 'tenant_admin' }, { email: `hr-${sfx}@uji.test`, name: 'HR Uji', role: 'hr_admin' }, { email: `eta-${sfx}@uji.test`, role: 'eta_admin' }],
  };
  const elitery = {
    id: crypto.randomUUID(), slug: `elitery-${sfx}`, name: 'HR Elitery', products: ['dna', 'tna'],
    flags: { 'module.dna': true, 'module.tna': true, 'dna.ai_interview': false },
    users: [{ email: `admin-${sfx}@elitery.test`, role: 'tenant_admin' }],
  };
  const ids = [uji.id, elitery.id];
  const one = async (sql, p) => (await db.query(sql, p)).rows;

  beforeAll(async () => {
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query(`SET search_path TO "${process.env.DB_SCHEMA || 'ewi'}"`);
  });

  afterAll(async () => {
    await db.query('BEGIN');
    await db.query("SET LOCAL ewi.audit_maintenance = 'on'");
    await db.query('DELETE FROM tenants WHERE id = ANY($1) OR slug LIKE $2', [ids, `%-${sfx}`]);
    await db.query('COMMIT');
    await db.end();
  });

  it('membuat dua tenant lengkap', async () => {
    for (const spec of [uji, elitery]) {
      const r = await onboardTenant({ db, provider, spec });
      expect(r.tenantId).toBe(spec.id);
      expect(r.report.find((x) => x.step === 'tenant').status).toBe('dibuat');
      expect(r.report.find((x) => x.step === 'kunci').status).toBe('dibuat');
    }
    const users = await one('SELECT email, role, status FROM users WHERE tenant_id = $1 ORDER BY role DESC', [uji.id]);
    expect(users).toEqual([
      { email: `admin-${sfx}@uji.test`, role: 'tenant_admin', status: 'invited' },
      { email: `hr-${sfx}@uji.test`, role: 'hr_admin', status: 'invited' },
      { email: `eta-${sfx}@uji.test`, role: 'eta_admin', status: 'invited' },
    ]);
    expect((await one('SELECT product FROM entitlements WHERE tenant_id = $1 ORDER BY product', [elitery.id])).map((x) => x.product)).toEqual(['dna', 'tna']);
    expect(await one('SELECT key, enabled FROM feature_flags WHERE tenant_id = $1 ORDER BY key', [elitery.id])).toEqual([
      { key: 'dna.ai_interview', enabled: false }, { key: 'module.dna', enabled: true }, { key: 'module.tna', enabled: true },
    ]);
    const [{ settings }] = await one('SELECT settings FROM tenants WHERE id = $1', [uji.id]);
    expect(settings.tna.interviewScope).toBe('red_only');
    const audit = await one(`SELECT action FROM audit_logs WHERE tenant_id = ANY($1) AND resource = 'tenant.onboarding'`, [ids]);
    expect(audit).toHaveLength(2);
  });

  it('kunci yang dibuat dipakai enkripsi aplikasi', async () => {
    const keyStore = {
      get: async (t) => (await one('SELECT version, key_ref AS "keyRef", wrapped_key AS "wrappedKey" FROM tenant_keys WHERE tenant_id = $1', [t]))[0] || null,
      insert: async () => { throw new Error('tidak boleh membuat kunci baru'); },
    };
    const cipher = createFieldCipher({ provider, keyStore });
    expect(await cipher.decrypt(uji.id, await cipher.encrypt(uji.id, 'rahasia'))).toBe('rahasia');
  });

  it('dijalankan ulang tidak menggandakan apa pun', async () => {
    const r = await onboardTenant({ db, provider, spec: uji });
    expect(r.report.every((x) => x.status === 'ada')).toBe(true);
    expect(await one('SELECT count(*)::int AS n FROM entitlements WHERE tenant_id = $1', [uji.id])).toEqual([{ n: 1 }]);
    expect(await one('SELECT count(*)::int AS n FROM tenant_keys WHERE tenant_id = $1', [uji.id])).toEqual([{ n: 1 }]);
    expect(await one(`SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND resource = 'tenant.onboarding'`, [uji.id])).toEqual([{ n: 1 }]);
  });

  it('perubahan nama, flag, dan peran berbeda dilaporkan', async () => {
    const spec = { ...uji, name: 'Uji Internal 2', flags: { 'module.tna': false }, users: [{ email: `eta-${sfx}@uji.test`, role: 'tenant_admin' }] };
    const r = await onboardTenant({ db, provider, spec });
    const by = (step) => r.report.filter((x) => x.step === step).map((x) => x.status);
    expect(by('tenant')).toEqual(['diperbarui']);
    expect(by('flag')).toEqual(['diperbarui']);
    expect(by('akun')).toEqual(['dilewati']);
    expect(await one('SELECT role FROM users WHERE tenant_id = $1 AND email = $2', [uji.id, `eta-${sfx}@uji.test`])).toEqual([{ role: 'eta_admin' }]);
  });

  it('slug milik tenant lain ditolak', async () => {
    await expect(onboardTenant({ db, provider, spec: { ...elitery, id: crypto.randomUUID(), slug: uji.slug } })).rejects.toThrow(/sudah dipakai tenant lain/);
  });

  it('--periksa tidak menyimpan apa pun', async () => {
    const spec = { ...elitery, id: crypto.randomUUID(), slug: `periksa-${sfx}` };
    const r = await onboardTenant({ db, provider, spec, dryRun: true });
    expect(r.report.find((x) => x.step === 'tenant').status).toBe('dibuat');
    expect(await one('SELECT id FROM tenants WHERE id = $1', [spec.id])).toEqual([]);
  });

  it('kunci induk berbeda ditolak sebelum mengubah data', async () => {
    const other = localProvider(crypto.randomBytes(32));
    await expect(onboardTenant({ db, provider: other, spec: { ...uji, name: 'Tidak berubah' } })).rejects.toThrow(/EWI_LOCAL_MASTER_KEY/);
    expect(await one('SELECT name FROM tenants WHERE id = $1', [uji.id])).toEqual([{ name: 'Uji Internal 2' }]);
  });
  describe('mode create (B12 konsol Super Admin)', () => {
    const spy = () => {
      const calls = [];
      const p = localProvider(crypto.randomBytes(32));
      return { calls, name: 'local', keyRef: p.keyRef, generateDataKey: (...a) => { calls.push('generate'); return p.generateDataKey(...a); },
        decryptDataKey: (...a) => { calls.push('decrypt'); return p.decryptDataKey(...a); } };
    };
    const actor = { userId: null, label: 'Super Admin ELGOS', via: 'api/platform' };
    const fresh = (key) => ({ id: crypto.randomUUID(), slug: `${key}-${sfx}`, name: `PT ${key}`, products: [],
      users: [{ email: `admin-${key}-${sfx}@uji.test`, role: 'tenant_admin' }] });

    it('slug atau id yang ada ditolak TENANT_EXISTS sebelum KMS; dryRun memberi exists', async () => {
      const p = spy();
      await expect(onboardTenant({ db, provider: p, mode: 'create', spec: { ...fresh('a'), slug: uji.slug } }))
        .rejects.toMatchObject({ code: 'TENANT_EXISTS', status: 409 });
      await expect(onboardTenant({ db, provider: p, mode: 'create', spec: { ...fresh('b'), id: uji.id } }))
        .rejects.toMatchObject({ code: 'TENANT_EXISTS' });
      expect(p.calls).toEqual([]);
      const r = await onboardTenant({ db, provider: p, mode: 'create', dryRun: true, spec: { ...fresh('c'), slug: uji.slug } });
      expect(r.exists).toBe(true);
      expect(p.calls).toEqual([]);
    });

    it('balapan: insert bentrok (23505) menjadi TENANT_EXISTS', async () => {
      const spec = fresh('balap');
      const racing = { query: async (sql, params) => {
        if (/^INSERT INTO tenants/.test(sql)) {
          const e = new Error('duplicate key value violates unique constraint'); e.code = '23505'; throw e;
        }
        return db.query(sql, params);
      } };
      await expect(onboardTenant({ db: racing, provider, mode: 'create', spec })).rejects.toMatchObject({ code: 'TENANT_EXISTS' });
      expect(await one('SELECT id FROM tenants WHERE id = $1', [spec.id])).toEqual([]);
    });

    it('beforeCommit gagal: semua ROLLBACK', async () => {
      const spec = fresh('gagal');
      await expect(onboardTenant({ db, provider, mode: 'create', spec, actor,
        beforeCommit: async () => { throw new Error('log platform gagal'); } })).rejects.toThrow(/log platform gagal/);
      expect(await one('SELECT id FROM tenants WHERE id = $1', [spec.id])).toEqual([]);
    });

    it('tenant_admin diterima, products kosong, pelaku tercatat, beforeCommit di dalam transaksi', async () => {
      const spec = fresh('jadi');
      let seen = null;
      const r = await onboardTenant({ db, provider, mode: 'create', spec, actor: { ...actor, userId: null },
        beforeCommit: async (c, res) => { seen = (await c.query('SELECT id FROM tenants WHERE id = $1', [res.tenantId])).rows.length; } });
      expect(seen).toBe(1);
      expect(r.exists).toBe(false);
      expect(await one('SELECT role, status FROM users WHERE tenant_id = $1', [spec.id])).toEqual([{ role: 'tenant_admin', status: 'invited' }]);
      expect(await one('SELECT product FROM entitlements WHERE tenant_id = $1', [spec.id])).toEqual([]);
      const [a] = await one("SELECT meta FROM audit_logs WHERE tenant_id = $1 AND resource = 'tenant.onboarding'", [spec.id]);
      expect(a.meta).toMatchObject({ actor: 'Super Admin ELGOS', via: 'api/platform' });
    });
  });
});
