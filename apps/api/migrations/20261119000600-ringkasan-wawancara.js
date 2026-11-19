'use strict';
// B6 Wawancara akar masalah: langkah "ringkasan temuan diperiksa karyawan" sebelum dikirim ke HR.
// Ringkasan = hasil penilaian pertama analisis, disimpan terenkripsi di sesi sampai dikonfirmasi karyawan.
// Catatan "tidak sesuai" dari karyawan juga terenkripsi. restart_count membatasi "Ulangi wawancara" (2 kali).
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_interview_sessions
        ADD COLUMN summary_findings jsonb,
        ADD COLUMN summary_at timestamptz,
        ADD COLUMN summary_confirmed_at timestamptz,
        ADD COLUMN summary_disputed boolean NOT NULL DEFAULT false,
        ADD COLUMN summary_note text,
        ADD COLUMN restart_count smallint NOT NULL DEFAULT 0;
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_interview_sessions
        DROP COLUMN IF EXISTS restart_count,
        DROP COLUMN IF EXISTS summary_note,
        DROP COLUMN IF EXISTS summary_disputed,
        DROP COLUMN IF EXISTS summary_confirmed_at,
        DROP COLUMN IF EXISTS summary_at,
        DROP COLUMN IF EXISTS summary_findings;
    `);
  },
};
