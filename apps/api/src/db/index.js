'use strict';
const { Sequelize } = require('sequelize');

/**
 * Koneksi ke database ELGOS sendiri (ADR 0001). Tabel di schema `ewi`.
 * Data EliteMentor hanya diakses lewat src/integrations/elitementor.
 */
function createDb(config) {
  return new Sequelize(config.databaseUrl, {
    dialect: 'postgres',
    logging: false,
    define: { schema: config.dbSchema, underscored: true },
    hooks: {
      afterConnect: async (conn) => {
        await conn.query(`SET search_path TO "${config.dbSchema}"`);
      },
    },
  });
}

module.exports = { createDb };
