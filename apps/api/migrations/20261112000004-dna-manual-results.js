'use strict';
// Cadence 11 Nov (C2): di POC ELGOS, DNA menampilkan hasil wawancara manual yang sudah ada.
// Hasil diimpor HR; sumber dicatat agar bisa dibedakan dari skor AI dan penilaian ulang Admin ETA.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_assessments
        ADD COLUMN source varchar(32) NOT NULL DEFAULT 'ai_interview'
          CHECK (source IN ('ai_interview','manual_interview','eta_review')),
        ADD COLUMN assessor varchar(255),
        ADD COLUMN assessed_at timestamptz,
        ADD COLUMN import_batch_id uuid;
      CREATE INDEX lna_assessments_user_idx ON lna_assessments (tenant_id, user_id);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP INDEX IF EXISTS lna_assessments_user_idx;
      ALTER TABLE lna_assessments
        DROP COLUMN IF EXISTS import_batch_id, DROP COLUMN IF EXISTS assessed_at,
        DROP COLUMN IF EXISTS assessor, DROP COLUMN IF EXISTS source;
    `);
  },
};
