'use strict';
// B1: verifikasi dua langkah (TOTP) dan kerangka SSO. Spek: docs/designs/b1-login.md.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";

      -- Secret autentikator per akun, terenkripsi dengan kunci tenant (R2-3). enabled_at NULL = belum dikonfirmasi.
      CREATE TABLE user_mfa (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        secret_enc text NOT NULL,
        enabled_at timestamptz,
        last_step bigint,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      -- Tantangan langkah kedua: sekali pakai, 5 menit, maksimum 5 percobaan. Hanya hash token yang disimpan.
      CREATE TABLE auth_mfa_challenges (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        method varchar(16) NOT NULL,
        token_hash char(64) NOT NULL UNIQUE,
        attempts integer NOT NULL DEFAULT 0,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      ALTER TABLE auth_sessions ADD COLUMN mfa boolean NOT NULL DEFAULT false;
      ALTER TABLE auth_sessions DROP CONSTRAINT auth_sessions_method_check;
      ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_method_check
        CHECK (method IN ('password','email_link','sso','unknown'));
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DELETE FROM auth_sessions WHERE method = 'sso';
      ALTER TABLE auth_sessions DROP CONSTRAINT auth_sessions_method_check;
      ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_method_check
        CHECK (method IN ('password','email_link','unknown'));
      ALTER TABLE auth_sessions DROP COLUMN mfa;
      DROP TABLE IF EXISTS auth_mfa_challenges;
      DROP TABLE IF EXISTS user_mfa;
    `);
  },
};
