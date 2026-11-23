'use strict';
// B12 tahap 2: sesi diam. last_seen_at diisi now() saat migrasi, supaya jam diam mulai dari deploy.
// Spek: docs/designs/b12-super-admin.md §Sesi diam.
const S = process.env.DB_SCHEMA || 'ewi';

module.exports = {
  async up(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE auth_sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
    `);
  },
  async down(qi) {
    await qi.sequelize.query(`
      SET search_path TO "${S}";
      ALTER TABLE auth_sessions DROP COLUMN IF EXISTS last_seen_at;
    `);
  },
};
