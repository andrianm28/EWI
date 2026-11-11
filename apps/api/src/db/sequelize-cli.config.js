'use strict';
require('dotenv').config();
const schema = process.env.DB_SCHEMA || 'ewi';
const base = {
  url: process.env.DATABASE_URL,
  dialect: 'postgres',
  migrationStorageTableSchema: schema,
  migrationStorageTableName: 'sequelize_meta',
};
module.exports = { development: base, test: base, staging: base, production: base };
