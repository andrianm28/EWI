'use strict';
// B1: metode sesi 'sso' untuk kerangka SSO. Spek: docs/designs/b1-login.md.
// Keputusan 19 Nov: tanpa verifikasi dua langkah, jadi migrasi ini tidak membuat tabel autentikator.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE auth_sessions DROP CONSTRAINT auth_sessions_method_check;
      ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_method_check
        CHECK (method IN ('password','email_link','sso','unknown'));
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      DELETE FROM auth_sessions WHERE method = 'sso';
      ALTER TABLE auth_sessions DROP CONSTRAINT auth_sessions_method_check;
      ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_method_check
        CHECK (method IN ('password','email_link','unknown'));
    `);
  },
};
