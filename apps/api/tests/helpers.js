'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config/env');

// Dibangkitkan acak per run: tidak ada kredensial tertanam di repo.
const SECRET = crypto.randomBytes(32).toString('hex');
const TEST_PASSWORD = crypto.randomBytes(12).toString('hex');

function makeConfig(overrides = {}) {
  // Test unit memakai login sandi lokal untuk membuat sesi; produk memakai OTP link (lihat session-auth.test.js)
  return loadConfig({ NODE_ENV: 'test', EWI_JWT_SECRET: SECRET, AUTH_PASSWORD_LOGIN: 'true', ...overrides });
}

/** Store in-memory untuk test tanpa database. */
function makeStores({ entitlements = {}, flags = {} } = {}) {
  const hash = bcrypt.hashSync(TEST_PASSWORD, 4);
  const users = [
    { id: 'u-hr', tenantId: 't-1', tenantSlug: 'elgos', email: 'hr@elgos.test', name: 'HR', role: 'hr_admin', passwordHash: hash },
    { id: 'u-l', tenantId: 't-1', tenantSlug: 'elgos', email: 'agent@elgos.test', name: 'Agent', role: 'learner', passwordHash: hash },
    { id: 'u-eta', tenantId: 't-0', tenantSlug: 'eta', email: 'admin@eta.test', name: 'Admin ETA', role: 'eta_admin', passwordHash: hash },
    { id: 'u-x', tenantId: 't-2', tenantSlug: 'other', email: 'hr@other.test', name: 'HR2', role: 'hr_admin', passwordHash: hash },
  ];
  const projects = [];
  return {
    users: {
      all: users,
      listActiveTenants: async () => [{ slug: 'elgos', name: 'ELGOS' }, { slug: 'other', name: 'Lain' }],
      findByEmail: async (slug, email) => users.find((u) => u.tenantSlug === slug && u.email === email) || null,
      findById: async (tenantId, id) => users.find((u) => u.tenantId === tenantId && u.id === id) || null,
      findTenantBySlug: async (slug) => { const u = users.find((x) => x.tenantSlug === slug); return u ? { id: u.tenantId, slug, name: slug } : null; },
    },
    flags: { getTenantFlags: async (tid) => flags[tid] || {} },
    entitlements: { getActiveEntitlements: async (tid) => (entitlements[tid] || []).map((product) => ({ product })) },
    projects: {
      list: async (tid) => projects.filter((p) => p.tenantId === tid),
      create: async (tid, p) => { const row = { id: `p-${projects.length + 1}`, tenantId: tid, status: 'draft', ...p }; projects.push(row); return row; },
    },
  };
}

/**
 * PK-16: token test harus menunjuk sesi aktif. sign(user) membuat baris sesi di store lalu mengembalikan JWT.
 * store: stores.authSessions (Postgres) atau memorySessionStore().
 */
function sessionSigner(config, store) {
  const { createTokenService } = require('../src/core/auth/tokens');
  const { createSessionService } = require('../src/core/auth/sessions');
  const sessions = createSessionService({ store, tokens: createTokenService(config.jwt) });
  return { sign: async (user) => (await sessions.issue(user, { method: 'unknown' })).token };
}

function makeApp(opts, env = {}) {
  return createApp({ config: makeConfig(env), stores: makeStores(opts) });
}

module.exports = { SECRET, TEST_PASSWORD, makeConfig, makeStores, makeApp, sessionSigner };
