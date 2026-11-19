'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { createTokenService } = require('./core/auth/tokens');
const { requireAuth } = require('./core/auth/middleware');
const { authRoutes } = require('./core/auth/routes');
const { createEmailLinkService, emailLinkRoutes, invitationRoutes } = require('./core/auth/email-link');
const { createMailer } = require('./integrations/mailer');
const { tenantContext } = require('./core/tenant');
const { createFlagService } = require('./core/flags');
const { flagAdminRouter } = require('./core/flags/admin-routes');
const { createAuditService, memoryAuditStore } = require('./core/audit');
const { createEntitlementService } = require('./core/entitlement');
const { requireSubmodule } = require('./core/entitlement/guard');
const { errorHandler, notFound } = require('./core/errors');
const { createReadiness, readyHandler } = require('./core/health');
const projects = require('./modules/projects');
const { employeeRouter } = require('./modules/employees');
const { webhookRouter } = require('./integrations/elitementor/webhook');
const { createSettingsService } = require('./core/settings');
const { createAiProvider } = require('./ai');
const { createAnalysisRunner } = require('./modules/interviews/analysis');
const { createCatalogService, elitementorAdapter, moodleAdapter } = require('./integrations/catalog');
const { createStorage } = require('./integrations/storage');
const { createLdSync } = require('./modules/ld/sync');
const SUBMODULE_MODULES = ['cca', 'dna', 'tna', 'ina', 'li', 'ld'].map((k) => require(`./modules/${k}`));

/**
 * Bangun aplikasi Express. Semua akses data lewat `stores` agar bisa diganti di test.
 * stores: { users, flags, audit, entitlements, projects, people, settings, dna, interviews, tna, projectsExtra }
 * ai / catalog / storage bisa diganti di test; default mengikuti config (AI_PROVIDER, PK-06; K-1 masih terbuka).
 */
function createApp({ config, stores, ai, catalog, mailer, readiness, storage }) {
  const app = express();
  const tokens = createTokenService(config.jwt);
  const flags = createFlagService(stores.flags);
  const entitlements = createEntitlementService(stores.entitlements);
  const auth = requireAuth(tokens);
  const settings = createSettingsService(stores.settings);
  // R2-2: store audit wajib di luar test; in-memory hanya untuk test yang tidak menyediakannya.
  if (!stores.audit && config.nodeEnv !== 'test') throw new Error('stores.audit wajib (R2-2)');
  const audit = createAuditService(stores.audit || memoryAuditStore());
  const mail = mailer || createMailer(config.mail || {});
  const links = createEmailLinkService({ stores, mailer: mail, appBaseUrl: config.appBaseUrl });
  const deps = {
    stores,
    flags,
    audit,
    settings,
    ai: ai || createAiProvider(config.ai || config.aiProvider),
    aiConfig: config.ai || {},
    catalog: catalog || createCatalogService({ elitementor: elitementorAdapter(), moodle: moodleAdapter(stores.catalog) }),
    // B14: dokumentasi pelatihan. null = EWI_UPLOAD_DIR belum diisi, unggah menjawab 501.
    storage: storage === undefined ? createStorage(config.uploads || {}) : storage,
    mailer: mail,
    uploads: config.uploads || {},
    appBaseUrl: config.appBaseUrl,
  };
  // PK-14: analisis wawancara berjalan di latar. app.locals.analysis dipakai server (penyapu) dan test (drain).
  deps.analysis = createAnalysisRunner({ stores, ai: deps.ai, aiConfig: deps.aiConfig });
  app.locals.analysis = deps.analysis;

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin.length ? config.corsOrigin : false }));
  // Webhook EliteMentor butuh raw body untuk verifikasi HMAC, jadi dipasang sebelum express.json().
  if (config.elitementor && config.elitementor.webhookSecret) {
    // B14: event progres/skor diteruskan ke Learning Delivery (cek entitlement + flag em.webhook_sync ada di sana).
    // stores.elitementorEvents: titik injeksi test (tests/unit/elitementor.test.js); di aplikasi nyata handler-nya sinkron B14.
    const handler = stores.elitementorEvents?.handle || (stores.ld ? createLdSync({ stores, flags, entitlements }) : undefined);
    app.use('/api/integrations/elitementor/webhook', webhookRouter({ secret: config.elitementor.webhookSecret, handler }));
  }
  app.use(express.json({ limit: '1mb' }));

  // Liveness ringan (tanpa I/O). Kesiapan (DB + enkripsi) di /api/ready, dipakai deploy (PK-07, I-6).
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'ewi-api' }));
  app.get('/api/ready', readyHandler(readiness || createReadiness({
    checks: {
      ...(stores.ping ? { database: () => stores.ping() } : {}),
      ...(stores.cipher?.healthCheck ? { encryption: () => stores.cipher.healthCheck() } : {}),
    },
  })));
  if (stores.loginLinks) app.use('/api/auth/email-link', emailLinkRoutes({ users: stores.users, links, tokens, audit }));
  app.use('/api/auth', authRoutes({ users: stores.users, tokens, requireAuth: auth, audit, tenantPicker: config.loginTenantPicker }));

  const api = express.Router();
  api.use(auth, tenantContext());
  api.get('/me/access', async (req, res, next) => {
    try {
      // products: dipakai web untuk menyembunyikan menu modul 2–5 yang butuh produk tertentu (mis. full_suite)
      res.json({ submodules: await entitlements.submodules(req.tenantId), products: await entitlements.products(req.tenantId), flags: await flags.all(req.tenantId) });
    } catch (e) { next(e); }
  });
  api.use('/projects', projects.router({ projects: stores.projects }));
  api.use('/admin', flagAdminRouter({ flags, audit }));
  if (stores.people && stores.interviews) api.use('/employees', employeeRouter({ stores, flags, audit }));
  if (stores.loginLinks) api.use('/invitations', invitationRoutes({ users: stores.users, links, audit }));
  for (const m of SUBMODULE_MODULES) {
    api.use(`/${m.key}`, requireSubmodule(m.key, { entitlements, flags }), m.router(deps));
  }
  app.use('/api', api);

  app.use((_req, _res, next) => next(notFound()));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
