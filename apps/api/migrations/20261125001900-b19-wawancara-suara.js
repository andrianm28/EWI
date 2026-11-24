'use strict';
// B19 wawancara suara langsung (Gemini Live): mode jawaban per giliran, tanda disela, koreksi terenkripsi, persetujuan
// suara berversi, epoch penulis suara, batas waktu suara, "AI selesai", dan detik audio di catatan biaya.
// Spek: docs/designs/b19-wawancara-suara.md bagian 8. Catatan reviewer: CHECK operation ai_usage_logs (kode bersama, aturan 7).
const S = process.env.DB_SCHEMA || 'ewi';
const OPS = "'next_question','assess_competencies','analyze_tna','assistant_reply','summarize_cca','lim_question','summarize_lim'";

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_interview_turns
        ADD COLUMN mode varchar(8) NOT NULL DEFAULT 'text' CHECK (mode IN ('text','voice')),
        ADD COLUMN interrupted boolean NOT NULL DEFAULT false,
        ADD COLUMN corrected_text text;
      ALTER TABLE lna_interview_sessions
        ADD COLUMN voice_consent_version varchar(64),
        ADD COLUMN voice_consent_at timestamptz,
        ADD COLUMN voice_epoch integer NOT NULL DEFAULT 0,
        ADD COLUMN voice_started_at timestamptz,
        ADD COLUMN ai_done_at timestamptz,
        ADD COLUMN transcript_edited_at timestamptz;
      ALTER TABLE ai_usage_logs
        ADD COLUMN audio_seconds_in numeric(10,2),
        ADD COLUMN audio_seconds_out numeric(10,2);
      ALTER TABLE ai_usage_logs DROP CONSTRAINT ai_usage_logs_operation_check;
      ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_operation_check CHECK (operation IN (${OPS},'voice_live'));
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DELETE FROM ai_usage_logs WHERE operation = 'voice_live';
      ALTER TABLE ai_usage_logs DROP CONSTRAINT ai_usage_logs_operation_check;
      ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_operation_check CHECK (operation IN (${OPS}));
      ALTER TABLE ai_usage_logs DROP COLUMN audio_seconds_in, DROP COLUMN audio_seconds_out;
      ALTER TABLE lna_interview_sessions
        DROP COLUMN voice_consent_version, DROP COLUMN voice_consent_at, DROP COLUMN voice_epoch,
        DROP COLUMN voice_started_at, DROP COLUMN ai_done_at, DROP COLUMN transcript_edited_at;
      ALTER TABLE lna_interview_turns DROP COLUMN mode, DROP COLUMN interrupted, DROP COLUMN corrected_text;
    `);
  },
};
