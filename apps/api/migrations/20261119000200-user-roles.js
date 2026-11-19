'use strict';
// B2: lima tampilan peran, banyak peran per akun, peran aktif per sesi. Spek: docs/designs/b2-peran.md.
const S = process.env.DB_SCHEMA || 'ewi';
const OLD_ROLES = "'eta_admin','hr_admin','pimpinan','supervisor','role_leader','sme','learner'";
const NEW_ROLES = `${OLD_ROLES},'tenant_admin'`;

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";

      ALTER TABLE users DROP CONSTRAINT users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${NEW_ROLES}));
      -- untuk FK komposit: baris peran tidak bisa menunjuk user di tenant lain
      ALTER TABLE users ADD CONSTRAINT users_id_tenant_key UNIQUE (id, tenant_id);

      CREATE TABLE user_roles (
        tenant_id uuid NOT NULL,
        user_id uuid NOT NULL,
        role varchar(32) NOT NULL CHECK (role IN (${NEW_ROLES})),
        granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, role),
        FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id) ON DELETE CASCADE
      );
      CREATE INDEX user_roles_tenant_role_idx ON user_roles (tenant_id, role);

      INSERT INTO user_roles (tenant_id, user_id, role) SELECT tenant_id, id, role FROM users;

      -- users.role = peran utama. Kode lama (impor, onboarding, seed) hanya menulis users.role;
      -- trigger ini menjaga user_roles tetap sama: peran utama baru menggantikan peran utama lama.
      CREATE FUNCTION users_role_sync() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
          DELETE FROM "${S}".user_roles WHERE user_id = NEW.id AND role = OLD.role;
        END IF;
        INSERT INTO "${S}".user_roles (tenant_id, user_id, role) VALUES (NEW.tenant_id, NEW.id, NEW.role)
          ON CONFLICT (user_id, role) DO NOTHING;
        RETURN NULL;
      END
      $fn$;
      CREATE TRIGGER users_role_sync AFTER INSERT OR UPDATE OF role ON users
        FOR EACH ROW EXECUTE FUNCTION users_role_sync();

      -- Peran aktif (tampilan) per sesi. role_version naik tiap ganti tampilan agar token lama tidak berlaku.
      ALTER TABLE auth_sessions ADD COLUMN active_role varchar(32);
      ALTER TABLE auth_sessions ADD COLUMN role_version integer NOT NULL DEFAULT 0;
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE auth_sessions DROP COLUMN role_version;
      ALTER TABLE auth_sessions DROP COLUMN active_role;
      DROP TRIGGER IF EXISTS users_role_sync ON users;
      DROP FUNCTION IF EXISTS users_role_sync();
      DROP TABLE IF EXISTS user_roles;
      -- Admin Tenant diturunkan ke karyawan (bukan HR) supaya rollback tidak menambah akses data; sesinya dihapus
      DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'tenant_admin');
      UPDATE users SET role = 'learner' WHERE role = 'tenant_admin';
      ALTER TABLE users DROP CONSTRAINT users_id_tenant_key;
      ALTER TABLE users DROP CONSTRAINT users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${OLD_ROLES}));
    `);
  },
};
