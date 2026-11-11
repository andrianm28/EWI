'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config/env');

// Dibangkitkan acak per run: tidak ada kredensial tertanam di repo.
const SECRET = crypto.randomBytes(32).toString('hex');
const TEST_PASSWORD = crypto.randomBytes(12).toString('hex');

function makeConfig(overrides = {}) {
  return loadConfig({ NODE_ENV: 'test', EWI_JWT_SECRET: SECRET, ...overrides });
}

/** Store in-memory untuk test tanpa database. */
function makeStores({ entitlements = {}, flags = {} } = {}) {
  const hash = bcrypt.hashSync(TEST_PASSWORD, 4);
  const users = [
    { id: 'u-hr', tenantId: 't-1', tenantSlug: 'elgos', email: 'hr@elgos.test', name: 'HR', role: 'hr_admin', passwordHash: hash },
    { id: 'u-l', tenantId: 't-1', tenantSlug: 'elgos', email: 'agent@elgos.test', name: 'Agent', role: 'learner', passwordHash: hash },
    { id: 'u-x', tenantId: 't-2', tenantSlug: 'other', email: 'hr@other.test', name: 'HR2', role: 'hr_admin', passwordHash: hash },
  ];
  const projects = [];
  return {
    users: {
      listActiveTenants: async () => [{ slug: 'elgos', name: 'ELGOS' }, { slug: 'other', name: 'Lain' }],
      findByEmail: async (slug, email) => users.find((u) => u.tenantSlug === slug && u.email === email) || null },
    flags: { getTenantFlags: async (tid) => flags[tid] || {} },
    entitlements: { getActiveEntitlements: async (tid) => (entitlements[tid] || []).map((product) => ({ product })) },
    projects: {
      list: async (tid) => projects.filter((p) => p.tenantId === tid),
      create: async (tid, p) => { const row = { id: `p-${projects.length + 1}`, tenantId: tid, status: 'draft', ...p }; projects.push(row); return row; },
    },
  };
}

function makeApp(opts, env = {}) {
  return createApp({ config: makeConfig(env), stores: makeStores(opts) });
}

module.exports = { SECRET, TEST_PASSWORD, makeConfig, makeStores, makeApp };
