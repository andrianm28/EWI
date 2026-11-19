'use strict';
// PK-16 (P1-3): sesi login yang bisa dicabut. JWT membawa id sesi (sid); API menolak token yang sesinya
// sudah dicabut atau kedaluwarsa. Baris lama boleh dibersihkan berkala (expires_at lewat > 30 hari).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE auth_sessions (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        method varchar(16) NOT NULL CHECK (method IN ('password','email_link','unknown')),
        ip varchar(64),
        user_agent varchar(255),
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
        revoke_reason varchar(32)
      );
      CREATE INDEX auth_sessions_user_idx ON auth_sessions (tenant_id, user_id) WHERE revoked_at IS NULL;
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS auth_sessions;
    `);
  },
};
