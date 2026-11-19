'use strict';
require('dotenv').config();
const { migrationDatabaseUrl } = require('./urls');
const schema = process.env.DB_SCHEMA || 'ewi';
const base = {
  // PD-8: migrasi memakai user pemilik schema (DB_MIGRATION_USER), bukan user aplikasi
  url: migrationDatabaseUrl(),
  dialect: 'postgres',
  migrationStorageTableSchema: schema,
  migrationStorageTableName: 'sequelize_meta',
};
module.exports = { development: base, test: base, staging: base, production: base };
