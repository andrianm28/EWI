'use strict';
// PM-6 (dijawab user 17 Nov 15.36 WIB): temuan di luar pelatihan terlihat HR secara bawaan; atasan
// langsung hanya bila diberi akses oleh HR. Izin per atasan, bisa dicabut; riwayat disimpan (tidak dihapus).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE lna_non_training_grants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        supervisor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
        granted_at timestamptz NOT NULL DEFAULT now(),
        revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
        revoked_at timestamptz
      );
      -- satu izin aktif per atasan
      CREATE UNIQUE INDEX lna_ntg_active_idx ON lna_non_training_grants (tenant_id, supervisor_id) WHERE revoked_at IS NULL;
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP TABLE IF EXISTS lna_non_training_grants;
    `);
  },
};
