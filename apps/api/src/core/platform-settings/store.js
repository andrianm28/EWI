'use strict';
// B12: tabel platform_settings (satu baris per kunci, nilai number jsonb).
const { QueryTypes } = require('sequelize');

function createPlatformSettingsStore(db) {
  return {
    async all() {
      const rows = await db.query('SELECT key, value FROM platform_settings', { type: QueryTypes.SELECT });
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    async set(key, value, userId, { transaction } = {}) {
      await db.query(
        `INSERT INTO platform_settings (key, value, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        { bind: [key, JSON.stringify(value), userId || null], type: QueryTypes.INSERT, transaction });
    },
    transaction: (fn) => db.transaction(fn),
  };
}

module.exports = { createPlatformSettingsStore };
