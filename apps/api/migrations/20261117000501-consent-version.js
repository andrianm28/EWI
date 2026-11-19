'use strict';
// PK-15 / PM-9 A (17 Nov): versi teks persetujuan disimpan per persetujuan wawancara.
// Sesi lama tanpa versi dibiarkan NULL.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_interview_sessions ADD COLUMN consent_version varchar(64);
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE lna_interview_sessions DROP COLUMN IF EXISTS consent_version;
    `);
  },
};
