'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { createTokenService } = require('./core/auth/tokens');
const { requireAuth } = require('./core/auth/middleware');
const { authRoutes } = require('./core/auth/routes');
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
function createApp({ config, stores, ai, catalog }) {
  const app = express();
  const tokens = createTokenService(config.jwt);
  const flags = createFlagService(stores.flags);
  const entitlements = createEntitlementService(stores.entitlements);
  const auth = requireAuth(tokens);
  const settings = createSettingsService(stores.settings);
  // R2-2: store audit wajib di luar test; in-memory hanya untuk test yang tidak menyediakannya.
  if (!stores.audit && config.nodeEnv !== 'test') throw new Error('stores.audit wajib (R2-2)');
  const audit = createAuditService(stores.audit || memoryAuditStore());
  const deps = {
    stores,
    flags,
    audit,
    settings,
    ai: ai || createAiProvider(config.aiProvider),
    catalog: catalog || createCatalogService({ elitementor: elitementorAdapter(), moodle: moodleAdapter() }),
  };

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin.length ? config.corsOrigin : false }));
  // Webhook EliteMentor butuh raw body untuk verifikasi HMAC, jadi dipasang sebelum express.json().
  if (config.elitementor && config.elitementor.webhookSecret) {
    app.use('/api/integrations/elitementor/webhook', webhookRouter({ secret: config.elitementor.webhookSecret, handler: stores.elitementorEvents?.handle }));
  }
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'ewi-api' }));
  app.use('/api/auth', authRoutes({ users: stores.users, tokens, requireAuth: auth, tenantPicker: config.loginTenantPicker }));

  const api = express.Router();
  api.use(auth, tenantContext());
  api.get('/me/access', async (req, res, next) => {
    try {
      res.json({ submodules: await entitlements.submodules(req.tenantId), flags: await flags.all(req.tenantId) });
    } catch (e) { next(e); }
  });
  api.use('/projects', projects.router({ projects: stores.projects }));
  api.use('/admin', flagAdminRouter({ flags, audit }));
  for (const m of SUBMODULE_MODULES) {
    api.use(`/${m.key}`, requireSubmodule(m.key, { entitlements, flags }), m.router(deps));
  }
  app.use('/api', api);

  app.use((_req, _res, next) => next(notFound()));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
