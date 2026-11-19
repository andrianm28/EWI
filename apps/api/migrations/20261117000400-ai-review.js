'use strict';
// PK-14 (PD-14 ★A, PD-13 ★A, PM-5 ★A): review hasil AI oleh HR.
// 1. Temuan TNA punya status review: draft -> approved | edited | rejected, dengan keyakinan, kesepakatan dua kali
//    penilaian, siapa dan kapan mereview, catatan, serta versi asli AI bila diubah (bahan pemantauan akurasi PM-2).
// 2. Analisis setelah wawancara berjalan sebagai job terpisah (lna_analysis_jobs), satu job per sesi.
// Temuan lama yang sudah ditindaklanjuti HR (status bukan 'open') dianggap sudah direview; sisanya menjadi draf.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";

      CREATE TABLE lna_analysis_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        session_id uuid NOT NULL REFERENCES lna_interview_sessions(id) ON DELETE CASCADE,
        submodule varchar(4) NOT NULL CHECK (submodule IN ('dna','tna')),
        status varchar(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
        attempts smallint NOT NULL DEFAULT 0,
        locked_until timestamptz,
        last_error varchar(64),
        result jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        started_at timestamptz,
        finished_at timestamptz,
        CONSTRAINT lna_analysis_jobs_session_uniq UNIQUE (session_id)
      );
      CREATE INDEX lna_analysis_jobs_pending_idx ON lna_analysis_jobs (status, locked_until) WHERE status <> 'done';

      ALTER TABLE lna_findings
        ADD COLUMN review_status varchar(16) NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft','approved','edited','rejected')),
        ADD COLUMN confidence numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
        ADD COLUMN scoring_agreement boolean,
        ADD COLUMN reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN reviewed_at timestamptz,
        ADD COLUMN review_note text,
        ADD COLUMN original_title text,
        ADD COLUMN original_detail text,
        ADD COLUMN original_category varchar(16),
        ADD COLUMN analysis_job_id uuid REFERENCES lna_analysis_jobs(id) ON DELETE SET NULL,
        ADD COLUMN finding_seq smallint;
      -- Pengaman kedua: satu job tidak bisa menyimpan temuan yang sama dua kali
      CREATE UNIQUE INDEX lna_findings_job_seq_uniq ON lna_findings (analysis_job_id, finding_seq) WHERE analysis_job_id IS NOT NULL;
      CREATE INDEX lna_findings_review_idx ON lna_findings (tenant_id, review_status);

      UPDATE lna_findings SET review_status = 'approved', reviewed_at = now() WHERE status <> 'open';
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DROP INDEX IF EXISTS lna_findings_review_idx;
      DROP INDEX IF EXISTS lna_findings_job_seq_uniq;
      ALTER TABLE lna_findings
        DROP COLUMN IF EXISTS finding_seq,
        DROP COLUMN IF EXISTS analysis_job_id,
        DROP COLUMN IF EXISTS original_category,
        DROP COLUMN IF EXISTS original_detail,
        DROP COLUMN IF EXISTS original_title,
        DROP COLUMN IF EXISTS review_note,
        DROP COLUMN IF EXISTS reviewed_at,
        DROP COLUMN IF EXISTS reviewed_by,
        DROP COLUMN IF EXISTS scoring_agreement,
        DROP COLUMN IF EXISTS confidence,
        DROP COLUMN IF EXISTS review_status;
      DROP TABLE IF EXISTS lna_analysis_jobs;
    `);
  },
};
