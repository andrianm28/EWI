'use strict';
// POC ELGOS Desember: DNA + TNA (RG-1..RG-4). Melengkapi skema inti 000002.
// Bagian yang masih menunggu keputusan bisnis disimpan generik (kolom `source`), bukan dikunci ke satu pilihan.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";

      -- T5: id user EliteMentor disimpan setelah cocok pertama (email + org terpetakan)
      ALTER TABLE users ADD COLUMN elitementor_user_id integer;

      -- DNA: skor minimal per kompetensi jabatan (skala 0-4) dan bobot kepentingan (Pareto TNA, BT-30)
      ALTER TABLE lna_competencies
        ADD COLUMN required_score smallint NOT NULL DEFAULT 3 CHECK (required_score BETWEEN 0 AND 4),
        ADD COLUMN importance smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5);

      -- RG-1: status program per jenjang (Basic/Intermediate/Advanced). Sumber masih terbuka (RG-1b):
      -- 'manual' (HR), 'elitementor' (Sync Back), atau LMS klien. Sumber selalu dicatat.
      CREATE TABLE lna_program_completions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        program_tier varchar(16) NOT NULL CHECK (program_tier IN ('basic','intermediate','advanced')),
        status varchar(16) NOT NULL CHECK (status IN ('in_progress','passed','failed')),
        source varchar(32) NOT NULL DEFAULT 'manual',
        passed_at timestamptz,
        recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, user_id, program_tier)
      );

      -- RG-2: arah target (lebih tinggi/lebih rendah lebih baik, mis. SLA waktu respons) + batch impor
      ALTER TABLE lna_performance_records
        ADD COLUMN direction varchar(8) NOT NULL DEFAULT 'higher' CHECK (direction IN ('higher','lower')),
        ADD COLUMN unit varchar(32),
        ADD COLUMN import_batch_id uuid;
      CREATE INDEX lna_perf_period_idx ON lna_performance_records (tenant_id, period);

      -- Temuan TNA tertaut ke target yang meleset; BT-23: temuan training & non-training bisa saling tertaut
      ALTER TABLE lna_findings
        ADD COLUMN performance_record_id uuid REFERENCES lna_performance_records(id) ON DELETE SET NULL,
        ADD COLUMN linked_finding_id uuid REFERENCES lna_findings(id) ON DELETE SET NULL;

      -- Training plan: rujukan katalog generik (EliteMentor default, LMS klien bila K-1 memutuskan)
      ALTER TABLE lna_training_plan_items
        ADD COLUMN catalog_source varchar(32),
        ADD COLUMN catalog_item_ref varchar(255),
        ADD COLUMN catalog_item_title varchar(255),
        ADD COLUMN note text,
        ADD COLUMN requested_by uuid REFERENCES users(id) ON DELETE SET NULL;
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_training_plan_items
        DROP COLUMN IF EXISTS requested_by, DROP COLUMN IF EXISTS note, DROP COLUMN IF EXISTS catalog_item_title,
        DROP COLUMN IF EXISTS catalog_item_ref, DROP COLUMN IF EXISTS catalog_source;
      ALTER TABLE lna_findings DROP COLUMN IF EXISTS linked_finding_id, DROP COLUMN IF EXISTS performance_record_id;
      DROP INDEX IF EXISTS lna_perf_period_idx;
      ALTER TABLE lna_performance_records
        DROP COLUMN IF EXISTS import_batch_id, DROP COLUMN IF EXISTS unit, DROP COLUMN IF EXISTS direction;
      DROP TABLE IF EXISTS lna_program_completions;
      ALTER TABLE lna_competencies DROP COLUMN IF EXISTS importance, DROP COLUMN IF EXISTS required_score;
      ALTER TABLE users DROP COLUMN IF EXISTS elitementor_user_id;
    `);
  },
};
