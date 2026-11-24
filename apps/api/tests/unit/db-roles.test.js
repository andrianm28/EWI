const { appDatabaseUrl, migrationDatabaseUrl, urlUser } = require('../../src/db/urls');
const { applyAppRole, appRoleFromEnv, grantSql, quoteIdent } = require('../../src/db/app-role');
const { migrationsToUndo, checkUndo, GUARDS } = require('../../src/db/undo-guard');
const { checkDbRole } = require('../../src/server');

describe('PK-07 / PD-8 pemisahan user database', () => {
  const base = 'postgres://elgos_app:rahasia@db:5432/elgos?ssl=true';

  it('aplikasi memakai DATABASE_URL (dari DB_USER/DB_PASSWORD)', () => {
    expect(appDatabaseUrl({ DATABASE_URL: base })).toBe(base);
  });

  it('migrasi memakai DB_MIGRATION_USER/PASSWORD di host, db, dan opsi yang sama', () => {
    const url = migrationDatabaseUrl({ DATABASE_URL: base, DB_MIGRATION_USER: 'elgos_owner', DB_MIGRATION_PASSWORD: 'p@ss:/#?' });
    const u = new URL(url);
    expect(urlUser(url)).toBe('elgos_owner');
    expect(decodeURIComponent(u.password)).toBe('p@ss:/#?');
    expect(u.host).toBe('db:5432');
    expect(u.pathname).toBe('/elgos');
    expect(u.search).toBe('?ssl=true');
  });

  it('MIGRATION_DATABASE_URL menang; tanpa DB_MIGRATION_USER sama dengan aplikasi', () => {
    expect(migrationDatabaseUrl({ DATABASE_URL: base, MIGRATION_DATABASE_URL: 'postgres://o@h/d', DB_MIGRATION_USER: 'x' })).toBe('postgres://o@h/d');
    expect(migrationDatabaseUrl({ DATABASE_URL: base })).toBe(base);
  });

  it('role aplikasi dari DB_APP_ROLE atau DB_USER', () => {
    expect(appRoleFromEnv({ DB_USER: 'elgos_app' })).toBe('elgos_app');
    expect(appRoleFromEnv({ DB_USER: 'elgos_app', DB_APP_ROLE: 'lain' })).toBe('lain');
    expect(appRoleFromEnv({})).toBe('');
  });

  it('SQL hak: tanpa DDL, audit_logs tanpa UPDATE/DELETE/TRUNCATE, sequelize_meta hanya baca', () => {
    const sql = grantSql({ schema: 'ewi', role: 'elgos_app', owner: 'elgos_owner' });
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "ewi" TO "elgos_app"/);
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "ewi"\."audit_logs", "ewi"\."platform_audit_logs" FROM "elgos_app"/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "ewi"\."sequelize_meta"/);
    expect(sql).not.toMatch(/GRANT[^;]*CREATE/);
    expect(sql).not.toMatch(/TRUNCATE ON ALL TABLES/);
  });

  it('menolak nama role yang bisa menyisipkan SQL', () => {
    expect(() => quoteIdent('x"; DROP SCHEMA ewi; --')).toThrow(/tidak valid/);
  });

  it('dilewati bila role aplikasi kosong atau sama dengan user migrasi; gagal jelas bila role belum ada', async () => {
    const q = (rows) => jest.fn(async (sql) => (sql.includes('current_user') ? [{ current: 'ewi' }] : rows));
    expect(await applyAppRole({ query: q([]), schema: 'ewi', role: '' })).toEqual({ skipped: true });
    expect(await applyAppRole({ query: q([]), schema: 'ewi', role: 'ewi' })).toEqual({ skipped: true });
    await expect(applyAppRole({ query: q([]), schema: 'ewi', role: 'elgos_app' })).rejects.toThrow(/belum ada/);
    expect(await applyAppRole({ query: q([]), schema: 'ewi', role: 'elgos_app', mode: 'revoke' })).toEqual({ skipped: true });
  });

  describe('pemeriksaan superuser saat boot (P1-7)', () => {
    const stores = (superuser) => ({ dbRole: async () => ({ user: 'elgos', superuser }) });
    it('DB_REQUIRE_NON_SUPERUSER=true menolak boot sebagai superuser', async () => {
      await expect(checkDbRole({ nodeEnv: 'production', db: { requireNonSuperuser: true } }, stores(true))).rejects.toThrow(/superuser/);
      await expect(checkDbRole({ nodeEnv: 'production', db: { requireNonSuperuser: true } }, stores(false))).resolves.toBeUndefined();
    });
    it('tanpa flag: peringatan di produksi, boot tetap jalan', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await checkDbRole({ nodeEnv: 'production', db: { requireNonSuperuser: false } }, stores(true));
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/P1-7/));
      warn.mockRestore();
    });
  });
});

describe('PK-07 / R-3 pengaman turun migrasi enkripsi', () => {
  const applied = ['20261111000001-core-tenant-auth.js', '20261113000008-tenant-keys.js', '20261117000200-app-role-grants.js'];

  it('menghitung migrasi yang akan diturunkan', () => {
    expect(migrationsToUndo(applied)).toEqual(['20261117000200-app-role-grants.js']);
    expect(migrationsToUndo(applied, { all: true })).toEqual([...applied].reverse());
    expect(migrationsToUndo(applied, { to: '20261113000008-tenant-keys.js' })).toEqual(['20261117000200-app-role-grants.js', '20261113000008-tenant-keys.js']);
    expect(() => migrationsToUndo(applied, { to: 'tidak-ada.js' })).toThrow();
  });

  const fakeQuery = ({ keys = 0, enc = 0, batches = 0 }) => async (sql) => {
    if (sql.includes('tenant_keys')) return [{ n: keys }];
    if (sql.includes('import_batches')) return [{ b: batches }];
    return [{ c: sql.includes('lna_findings') && sql.includes('title') ? enc : 0 }];
  };

  it('menolak menurunkan tenant-keys bila ada kunci tenant atau nilai terenkripsi', async () => {
    const targets = ['20261113000008-tenant-keys.js'];
    expect(await checkUndo(fakeQuery({}), targets)).toEqual([]);
    const [r] = await checkUndo(fakeQuery({ keys: 2, enc: 5 }), targets);
    expect(r.migration).toBe('20261113000008-tenant-keys.js');
    expect(r.reason).toMatch(/tenant_keys: 2 kunci tenant/);
    expect(r.reason).toMatch(/lna_findings\.title: 5 nilai terenkripsi/);
    expect(await checkUndo(fakeQuery({ batches: 1 }), targets)).toHaveLength(1);
  });

  it('migrasi lain tidak diperiksa', async () => {
    expect(await checkUndo(fakeQuery({ keys: 9 }), ['20261117000200-app-role-grants.js'])).toEqual([]);
    expect(Object.keys(GUARDS)).toContain('20261113000008-tenant-keys.js');
  });
});

describe('Audit 24 Nov: pengaman turun migrasi yang menghapus data hukum/akses', () => {
  // Kueri palsu: angka per kata kunci tabel/kolom yang muncul di SQL pemeriksaan.
  const q = (counts) => async (sql) => {
    const hit = Object.entries(counts).find(([k]) => sql.includes(k));
    return [{ n: hit ? hit[1] : 0 }];
  };
  const cases = [
    ['20261119000800-permintaan-data-karyawan.js', { consent_withdrawn_at: 1 }, /penarikan persetujuan/],
    ['20261119000800-permintaan-data-karyawan.js', { data_subject_requests: 3 }, /permintaan data karyawan/],
    ['20261117000501-consent-version.js', { consent_version: 4 }, /versi persetujuan/],
    ['20261119000200-user-roles.js', { "role = 'tenant_admin'": 1 }, /Admin Tenant/],
    ['20261119000200-user-roles.js', { user_roles: 2 }, /peran tambahan/],
    ['20261117000400-ai-review.js', { reviewed_at: 5 }, /keputusan review HR/],
  ];
  it.each(cases)('%s ditolak bila ada data (%o)', async (migration, counts, reason) => {
    const [r] = await checkUndo(q(counts), [migration]);
    expect(r && r.migration).toBe(migration);
    expect(r.reason).toMatch(reason);
    expect(r.reason).toMatch(/Pulihkan dari backup/);
  });
  it('basis data kosong (CI naik-turun-naik): semua boleh diturunkan', async () => {
    expect(await checkUndo(q({}), [...new Set(cases.map(([m]) => m))])).toEqual([]);
  });
});
