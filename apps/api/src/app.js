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
const { createAttemptLog } = require('./core/auth/attempts');
const { createMailer } = require('./integrations/mailer');
const { tenantContext } = require('./core/tenant');
const { createFlagService, FLAGS, requireFlag } = require('./core/flags');
const { roleRoutes } = require('./core/rbac/role-routes');
const { buildMenu } = require('./core/rbac/menu');
const { VIEWS, describeRoles } = require('./core/rbac/roles');
const { flagAdminRouter } = require('./core/flags/admin-routes');
const { createAuditService, memoryAuditStore } = require('./core/audit');
const { createEntitlementService } = require('./core/entitlement');
const { requireSubmodule } = require('./core/entitlement/guard');
const { errorHandler, notFound } = require('./core/errors');
const { createReadiness, readyHandler } = require('./core/health');
const projects = require('./modules/projects');
const { employeeRouter } = require('./modules/employees');
const { myRouter } = require('./modules/my');
const { assistantRouter } = require('./modules/assistant');
const { dashboardRouter } = require('./modules/dashboard');
const { webhookRouter } = require('./integrations/elitementor/webhook');
const { createElitementorClient } = require('./integrations/elitementor/client');
const { createAssignmentService } = require('./integrations/elitementor/assignments');
const { createSettingsService } = require('./core/settings');
const { createAiProvider } = require('./ai');
const { createAnalysisRunner } = require('./modules/interviews/analysis');
const { createCatalogService, elitementorAdapter, moodleAdapter } = require('./integrations/catalog');
const tenantAdmin = require('./modules/tenant-admin');
const { createStorage } = require('./integrations/storage');
const { createLdSync } = require('./modules/ld/sync');
const { createPlatformService } = require('./modules/platform/service');
const { createProvider } = require('./core/crypto');
const { withOnboardingClient } = require('./core/tenant/client');
const { createPlatformSettings } = require('./core/platform-settings');
const { createSettingsView } = require('./modules/platform/settings-view');
const { platformRouter } = require('./modules/platform/routes');
const { createPlatformLog } = require('./core/platform-log');
const { requireRole } = require('./core/rbac');
const SUBMODULE_MODULES = ['cca', 'dna', 'tna', 'ina', 'li', 'ld', 'lim'].map((k) => require(`./modules/${k}`));

/**
 * Bangun aplikasi Express. Semua akses data lewat `stores` agar bisa diganti di test.
 * stores: { users, flags, audit, entitlements, projects, people, settings, dna, interviews, tna, projectsExtra }
 * ai / catalog / assignments / storage bisa diganti di test; default mengikuti config (AI_PROVIDER, PK-06; K-1 masih terbuka).
 */
function createApp({ config, stores, ai, catalog, mailer, rateLimits, readiness, assignments, storage }) {
  const app = express();
  const tokens = createTokenService(config.jwt);
  const flags = createFlagService(stores.flags);
  const entitlements = createEntitlementService(stores.entitlements);
  // PK-16: sesi yang bisa dicabut. Store sesi wajib di luar test; in-memory hanya untuk test tanpa DB.
  if (!stores.authSessions && config.nodeEnv !== 'test') throw new Error('stores.authSessions wajib (PK-16)');
  const sessions = createSessionService({
    store: stores.authSessions || memorySessionStore(), tokens,
    // B2: pindah tampilan hanya untuk tenant yang flag auth.multi_role-nya menyala
    multiRole: (tenantId) => flags.isEnabled(tenantId, FLAGS.AUTH_MULTI_ROLE),
  });
  const authConfig = config.auth;
  const policy = createLoginPolicy(authConfig);
  const auth = requireAuth(tokens, { sessions, policy });
  const limits = rateLimits || defaultRateLimits();
  const settings = createSettingsService(stores.settings);
  // R2-2: store audit wajib di luar test; in-memory hanya untuk test yang tidak menyediakannya.
  if (!stores.audit && config.nodeEnv !== 'test') throw new Error('stores.audit wajib (R2-2)');
  const audit = createAuditService(stores.audit || memoryAuditStore());
  const attempts = createAttemptLog(audit);
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
  // B7: penugasan ke EliteMentor hanya terpasang bila dinyalakan lewat env (kontrak FR-EM belum final);
  // tanpa adapter, endpoint penugasan menjawab ASSIGN_UNAVAILABLE.
  const em = config.elitementor || {};
  deps.assignments = assignments
    || (em.assignmentsEnabled && em.baseUrl && em.tokenUrl ? createAssignmentService({ client: createElitementorClient(em) }) : null);
  // PK-14: analisis wawancara berjalan di latar. app.locals.analysis dipakai server (penyapu) dan test (drain).
  deps.analysis = createAnalysisRunner({ stores, ai: deps.ai, aiConfig: deps.aiConfig });
  app.locals.analysis = deps.analysis;

  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
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
  if (stores.loginLinks) app.use('/api/auth/email-link', emailLinkRoutes({ users: stores.users, links, sessions, policy, audit, limits, attempts }));
  app.use('/api/auth', authRoutes({
    users: stores.users, sessions, policy, audit, requireAuth: auth, limits, attempts, flags,
    tenantPicker: config.loginTenantPicker, localLogin: authConfig.localLogin,
  }));

  // B12: konsol Super Admin, dipasang sebelum /api supaya auth tidak berjalan dua kali (ADR 0002)
  if (stores.platform) {
    const platformLog = createPlatformLog({ store: stores.platformLog });
    const platformSettings = createPlatformSettings({ store: stores.platformSettings, platformLog });
    const settingsView = createSettingsView({ platformSettings, store: stores.platform, encryption: config.encryption.provider, ai: config.ai });
    const platform = createPlatformService({
      db: stores.db, store: stores.platform, flags, entitlements, audit, platformLog, links,
      provider: createProvider(config.encryption), production: config.nodeEnv === 'production',
      onboardingClient: (fn) => withOnboardingClient(config, fn),
    });
    app.use('/api/platform', auth, tenantContext(), requireRole(),
      requireFlag(flags, FLAGS.PLATFORM_CONSOLE, 'Konsol platform belum diaktifkan'), platformRouter({ service: platform, settings: settingsView, limits }));
  }

  const api = express.Router();
  api.use(auth, tenantContext());
  api.get('/me/access', async (req, res, next) => {
    try {
      const [submodules, products, tenantFlags] = [await entitlements.submodules(req.tenantId), await entitlements.products(req.tenantId), await flags.all(req.tenantId)];
      // B2: peran aktif, tampilan lain yang bisa dipilih, dan menu untuk tampilan ini.
      // products: dipakai web untuk menyembunyikan menu modul 2–5 yang butuh produk tertentu (mis. full_suite)
      const { role, view, roles } = req.user;
      res.json({
        submodules, products, flags: tenantFlags, role, view, home: VIEWS[view].home, roles: describeRoles(roles),
        menu: buildMenu(view, { flags: tenantFlags, submodules }),
      });
    } catch (e) { next(e); }
  });
  api.use('/projects', projects.router({ projects: stores.projects }));
  api.use('/admin', flagAdminRouter({ flags, audit }));
  if (stores.userRoles) api.use('/users', roleRoutes({ userRoles: stores.userRoles, audit, flags }));
  api.use('/sessions', sessionRoutes({ sessions, audit }));
  if (stores.people && stores.interviews) api.use('/employees', employeeRouter({ stores, flags, audit }));
  // B8: beranda karyawan. Bukan submodul; tiap bagian memeriksa modulnya sendiri (flag learner.home).
  if (stores.people && stores.dataRequests) api.use('/my', myRouter({ stores, flags, entitlements, settings, audit }));
  // B17: Asisten ELGOS. Bukan submodul; tiap penyusun fakta memeriksa modulnya sendiri (flag assistant).
  if (stores.people && stores.assistant) api.use('/assistant', assistantRouter({ ...deps, entitlements }));
  // B3: dashboard lintas modul. Bukan submodul; di balik flag sendiri dan tiap bagian mengikuti modul sumbernya.
  if (stores.people && stores.interviews && stores.tna && stores.dna) {
    api.use('/dashboard', requireFlag(flags, FLAGS.DASHBOARD_MAIN, 'Dashboard belum diaktifkan untuk organisasi Anda'),
      dashboardRouter({ stores, flags, entitlements, settings, audit }));
  }
  if (stores.loginLinks) api.use('/invitations', invitationRoutes({ users: stores.users, links, audit }));
  // B11: layar Admin Tenant, di balik flag admin.tenant (bukan submodul berbayar)
  api.use('/tenant-admin', tenantAdmin.router({ ...deps, entitlements, links, elitementor: config.elitementor }));
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
    // Review egm: baris audit "ditolak karena batas" paling banyak satu per akun per jendela
    auditOnce: createRateLimiter({ windowMs, max: 1 }),
    // B12: kirim ulang undangan dari konsol Super Admin, per tenant
    platformReinvite: createRateLimiter({ windowMs, max: 3, message: 'Undangan untuk tenant ini sudah dikirim 3 kali dalam 15 menit. Coba lagi nanti.' }),
  };
}

module.exports = { createApp, defaultRateLimits };
