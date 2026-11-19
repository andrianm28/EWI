'use strict';
// B5 Training Needs: penugasan wawancara akar masalah per gap (cadence 18 Nov: tenggat + durasi 15/30 menit).
// Tenggat = invite_expires_at (tidak ada kolom tenggat terpisah). Kolom fokus mencatat gap yang ditugaskan.
// Semua kolom boleh kosong: sesi lama dan alur lama (POST /tna/projects/:id/interviews) tidak berubah.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_interview_sessions
        ADD COLUMN assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN duration_minutes smallint CHECK (duration_minutes IN (15, 30)),
        ADD COLUMN focus_kind varchar(16) CHECK (focus_kind IN ('okr', 'competency')),
        ADD COLUMN focus_competency_id uuid REFERENCES lna_competencies(id) ON DELETE SET NULL,
        ADD COLUMN focus_metric_type varchar(8) CHECK (focus_metric_type IN ('okr', 'kpi', 'sla')),
        ADD COLUMN focus_metric_key varchar(255),
        ADD COLUMN focus_period varchar(32),
        ADD COLUMN focus_label varchar(255),
        ADD CONSTRAINT lna_sessions_focus_chk CHECK (focus_kind IS NULL OR focus_label IS NOT NULL);
      CREATE INDEX lna_sessions_focus_idx ON lna_interview_sessions
        (tenant_id, focus_kind, focus_competency_id, focus_metric_key, focus_period);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP INDEX IF EXISTS lna_sessions_focus_idx;
      ALTER TABLE lna_interview_sessions
        DROP CONSTRAINT IF EXISTS lna_sessions_focus_chk,
        DROP COLUMN IF EXISTS focus_label,
        DROP COLUMN IF EXISTS focus_period,
        DROP COLUMN IF EXISTS focus_metric_key,
        DROP COLUMN IF EXISTS focus_metric_type,
        DROP COLUMN IF EXISTS focus_competency_id,
        DROP COLUMN IF EXISTS focus_kind,
        DROP COLUMN IF EXISTS duration_minutes,
        DROP COLUMN IF EXISTS assigned_by;
    `);
  },
};
