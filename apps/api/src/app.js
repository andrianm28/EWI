'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { createTokenService } = require('./core/auth/tokens');
const { requireAuth } = require('./core/auth/middleware');
const { authRoutes } = require('./core/auth/routes');
const { tenantContext } = require('./core/tenant');
const { createFlagService } = require('./core/flags');
const { createEntitlementService } = require('./core/entitlement');
const { requireSubmodule } = require('./core/entitlement/guard');
const { errorHandler, notFound } = require('./core/errors');
const projects = require('./modules/projects');
const { webhookRouter } = require('./integrations/elitementor/webhook');
const SUBMODULE_MODULES = ['cca', 'dna', 'tna', 'ina'].map((k) => require(`./modules/${k}`));

/**
 * Bangun aplikasi Express. Semua akses data lewat `stores` agar bisa diganti di test.
 * stores: { users, flags, entitlements, projects }
 */
function createApp({ config, stores }) {
  const app = express();
  const tokens = createTokenService(config.jwt);
  const flags = createFlagService(stores.flags);
  const entitlements = createEntitlementService(stores.entitlements);
  const auth = requireAuth(tokens);

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin.length ? config.corsOrigin : false }));
  // Webhook EliteMentor butuh raw body untuk verifikasi HMAC, jadi dipasang sebelum express.json().
  if (config.elitementor && config.elitementor.webhookSecret) {
    app.use('/api/integrations/elitementor/webhook', webhookRouter({ secret: config.elitementor.webhookSecret, handler: stores.elitementorEvents?.handle }));
  }
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'ewi-api' }));
  app.use('/api/auth', authRoutes({ users: stores.users, tokens, requireAuth: auth }));

  const api = express.Router();
  api.use(auth, tenantContext());
  api.get('/me/access', async (req, res, next) => {
    try {
      res.json({ submodules: await entitlements.submodules(req.tenantId), flags: await flags.all(req.tenantId) });
    } catch (e) { next(e); }
  });
  api.use('/projects', projects.router({ projects: stores.projects }));
  for (const m of SUBMODULE_MODULES) {
    api.use(`/${m.key}`, requireSubmodule(m.key, { entitlements, flags }), m.router());
  }
  app.use('/api', api);

  app.use((_req, _res, next) => next(notFound()));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
