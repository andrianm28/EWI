'use strict';
// B8 (19 Nov): permintaan data karyawan (tarik persetujuan, minta hapus data). Spek: docs/designs/b8-karyawan.md
// Keputusan user 19 Nov: tarik persetujuan hanya menandai sesi (consent_withdrawn_at) dan menghentikan wawancara;
// data tetap tersimpan sampai HR menghapusnya sendiri. Tenggat 3x24 jam (LIN-B23) hanya untuk permintaan hapus.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      CREATE TABLE data_subject_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type varchar(24) NOT NULL CHECK (type IN ('withdraw_consent','delete_data')),
        status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
        reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        due_at timestamptz,
        resolved_at timestamptz,
        resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
        resolution_note text
      );
      CREATE UNIQUE INDEX data_subject_requests_open_uniq ON data_subject_requests (tenant_id, user_id, type) WHERE status = 'open';
      CREATE INDEX data_subject_requests_tenant_idx ON data_subject_requests (tenant_id, status, created_at);
      ALTER TABLE lna_interview_sessions ADD COLUMN consent_withdrawn_at timestamptz;
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_interview_sessions DROP COLUMN IF EXISTS consent_withdrawn_at;
      DROP TABLE IF EXISTS data_subject_requests;
    `);
  },
};
