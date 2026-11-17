'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { createTokenService } = require('./core/auth/tokens');
const { requireAuth } = require('./core/auth/middleware');
const { authRoutes } = require('./core/auth/routes');
const { createSessionService, memorySessionStore } = require('./core/auth/sessions');
const { sessionRoutes } = require('./core/auth/session-routes');
const { createLoginPolicy } = require('./core/auth/policy');
const { createRateLimiter } = require('./core/auth/rate-limit');
const { createEmailLinkService, emailLinkRoutes, invitationRoutes } = require('./core/auth/email-link');
const { createMailer } = require('./integrations/mailer');
const { tenantContext } = require('./core/tenant');
const { createFlagService } = require('./core/flags');
const { flagAdminRouter } = require('./core/flags/admin-routes');
const { createAuditService, memoryAuditStore } = require('./core/audit');
const { createEntitlementService } = require('./core/entitlement');
const { requireSubmodule } = require('./core/entitlement/guard');
const { errorHandler, notFound } = require('./core/errors');
const projects = require('./modules/projects');
const { webhookRouter } = require('./integrations/elitementor/webhook');
const { createSettingsService } = require('./core/settings');
const { createAiProvider } = require('./ai');
const { createCatalogService, elitementorAdapter, moodleAdapter } = require('./integrations/catalog');
const SUBMODULE_MODULES = ['cca', 'dna', 'tna', 'ina'].map((k) => require(`./modules/${k}`));

/**
 * Bangun aplikasi Express. Semua akses data lewat `stores` agar bisa diganti di test.
 * stores: { users, flags, audit, entitlements, projects, people, settings, dna, interviews, tna, projectsExtra }
 * ai / catalog bisa diganti di test; default mengikuti config (T3 dan K-1 masih terbuka).
 */
function createApp({ config, stores, ai, catalog, mailer, rateLimits }) {
  const app = express();
  const tokens = createTokenService(config.jwt);
  const flags = createFlagService(stores.flags);
  const entitlements = createEntitlementService(stores.entitlements);
  // PK-16: sesi yang bisa dicabut. Store sesi wajib di luar test; in-memory hanya untuk test tanpa DB.
  if (!stores.authSessions && config.nodeEnv !== 'test') throw new Error('stores.authSessions wajib (PK-16)');
  const sessions = createSessionService({ store: stores.authSessions || memorySessionStore(), tokens });
  const authConfig = config.auth;
  const policy = createLoginPolicy(authConfig);
  const auth = requireAuth(tokens, { sessions, policy });
  const limits = rateLimits || defaultRateLimits();
  const settings = createSettingsService(stores.settings);
  // R2-2: store audit wajib di luar test; in-memory hanya untuk test yang tidak menyediakannya.
  if (!stores.audit && config.nodeEnv !== 'test') throw new Error('stores.audit wajib (R2-2)');
  const audit = createAuditService(stores.audit || memoryAuditStore());
  const links = createEmailLinkService({ stores, mailer: mailer || createMailer(config.mail || {}), appBaseUrl: config.appBaseUrl });
  const deps = {
    stores,
    flags,
    audit,
    settings,
    ai: ai || createAiProvider(config.aiProvider),
    catalog: catalog || createCatalogService({ elitementor: elitementorAdapter(), moodle: moodleAdapter() }),
  };

  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin.length ? config.corsOrigin : false }));
  // Webhook EliteMentor butuh raw body untuk verifikasi HMAC, jadi dipasang sebelum express.json().
  if (config.elitementor && config.elitementor.webhookSecret) {
    app.use('/api/integrations/elitementor/webhook', webhookRouter({ secret: config.elitementor.webhookSecret, handler: stores.elitementorEvents?.handle }));
  }
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'ewi-api' }));
  if (stores.loginLinks) app.use('/api/auth/email-link', emailLinkRoutes({ users: stores.users, links, sessions, policy, audit, limits }));
  app.use('/api/auth', authRoutes({
    users: stores.users, sessions, policy, audit, requireAuth: auth, limits,
    tenantPicker: config.loginTenantPicker, passwordLogin: authConfig.passwordLogin,
  }));

  const api = express.Router();
  api.use(auth, tenantContext());
  api.get('/me/access', async (req, res, next) => {
    try {
      res.json({ submodules: await entitlements.submodules(req.tenantId), flags: await flags.all(req.tenantId) });
    } catch (e) { next(e); }
  });
  api.use('/projects', projects.router({ projects: stores.projects }));
  api.use('/admin', flagAdminRouter({ flags, audit }));
  api.use('/sessions', sessionRoutes({ sessions, audit }));
  if (stores.loginLinks) api.use('/invitations', invitationRoutes({ users: stores.users, links, audit }));
  for (const m of SUBMODULE_MODULES) {
    api.use(`/${m.key}`, requireSubmodule(m.key, { entitlements, flags }), m.router(deps));
  }
  app.use('/api', api);

  app.use((_req, _res, next) => next(notFound()));
  app.use(errorHandler);
  return app;
}

/** PK-16: batas laju bawaan rute login (per proses, jendela 15 menit). */
function defaultRateLimits() {
  const windowMs = 15 * 60 * 1000;
  return {
    passwordIp: createRateLimiter({ windowMs, max: 20 }),
    passwordAccount: createRateLimiter({ windowMs, max: 5, message: 'Terlalu banyak percobaan gagal untuk akun ini. Coba lagi 15 menit lagi.' }),
    linkIp: createRateLimiter({ windowMs, max: 10 }),
    verifyIp: createRateLimiter({ windowMs, max: 20 }),
  };
}

module.exports = { createApp, defaultRateLimits };
