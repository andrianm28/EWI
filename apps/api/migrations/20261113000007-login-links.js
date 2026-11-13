'use strict';
// R3-2 (13 Nov): karyawan masuk lewat link email (satu mekanisme untuk semua klien). Token sekali pakai;
// hanya hash SHA-256 yang disimpan.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE login_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash char(64) NOT NULL UNIQUE,
        purpose varchar(16) NOT NULL CHECK (purpose IN ('login','invite')),
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX login_links_user_idx ON login_links (tenant_id, user_id, created_at DESC);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS login_links;
    `);
  },
};
