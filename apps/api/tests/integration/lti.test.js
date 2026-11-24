// EM-LTI (Postgres): ELGOS sebagai LTI 1.3 Platform. Spek docs/designs/em-lti-platform.md §9.
// Tool palsu di test: kunci RSA sendiri, JWKS lewat fetch palsu. Alur: launch -> authorize -> id_token -> token AGS -> skor.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { memoryMailer } = require('../../src/integrations/mailer');
const { makeConfig, sessionSigner } = require('../helpers');
const { AGS_SCOPES, CLAIM } = require('../../src/modules/lti/domain');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const ISSUER = 'https://elgos-uji.local';
const BASE = 'https://elgos.test';
const platformPem = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const toolPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const toolJwk = { ...toolPair.publicKey.export({ format: 'jwk' }), kid: 'tool-k1', alg: 'RS256', use: 'sig' };
const TOOL_JWKS = 'http://em-sim.internal/lti/keys';

run('LTI 1.3 Platform (Postgres)', () => {
  let db; let app; let stores; let tenant; let other; const u = {}; const tok = {}; let clientId; let otherClientId; let planId; let trainingId;
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const flag = (key, enabled, t = tenant.id) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled) ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t, key, enabled } });
  const fetchImpl = async (url) => {
    if (url !== TOOL_JWKS) throw new Error(`fetch tak terduga: ${url}`);
    return { ok: true, status: 200, text: async () => JSON.stringify({ keys: [toolJwk] }) };
  };
  const cookieOf = (res) => (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

  /** Jalankan launch + authorize; return { res, params, cookie, idToken }. */
  async function launch(who, linkId, { mutate = (p) => p, cookie } = {}) {
    const start = await request(app).post('/api/my/elitementor/launch').set(as(who)).send({ linkId });
    if (start.status !== 200) return { start };
    const login = new URL(start.body.data.url);
    const params = mutate({
      scope: 'openid', response_type: 'id_token', response_mode: 'form_post', prompt: 'none',
      client_id: login.searchParams.get('client_id'), redirect_uri: `${BASE}/em-sim/lti/launch`,
      login_hint: login.searchParams.get('login_hint'), lti_message_hint: login.searchParams.get('lti_message_hint'), state: 'st-1', nonce: `n-${Math.random()}`,
    });
    const res = await request(app).get('/api/lti/authorize').query(params).set('Cookie', cookie ?? cookieOf(start));
    const m = /name="id_token" value="([^"]+)"/.exec(res.text || '');
    return { start, login, params, res, cookie: cookieOf(start), idToken: m && m[1] };
  }
  async function agsToken({ scope = `${AGS_SCOPES.score} ${AGS_SCOPES.lineitemRead}`, jti = crypto.randomUUID(), cid = clientId, aud = ISSUER } = {}) {
    const assertion = jwt.sign({ iss: cid, sub: cid, aud, jti }, toolPair.privateKey, { algorithm: 'RS256', keyid: 'tool-k1', expiresIn: 300 });
    return request(app).post('/api/lti/token').type('form').send({
      grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion, scope,
    });
  }
  const score = (linkId, token, body) => request(app).post(`/api/lti/ags/links/${linkId}/lineitem/scores`).set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/vnd.ims.lis.v1.score+json').send(JSON.stringify({ timestamp: new Date().toISOString(), ...body }));

  beforeAll(async () => {
    const config = makeConfig({ APP_BASE_URL: BASE, LTI_ISSUER: ISSUER, ELGOS_LTI_PRIVATE_KEY: platformPem });
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    app = createApp({ config, stores, mailer: memoryMailer(), ltiFetch: fetchImpl });
    const tokens = sessionSigner(config, stores.authSessions);
    const slug = `lti-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'LTI uji') RETURNING id`, { replacements: { slug } });
    [[other]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Lain') RETURNING id`, { replacements: { slug: `${slug}-x` } });
    for (const [key, role, t] of [['hr', 'hr_admin', tenant.id], ['ani', 'learner', tenant.id], ['beni', 'learner', tenant.id], ['xl', 'learner', other.id]]) {
      const [[row]] = await db.query(`INSERT INTO users (tenant_id, email, name, role, status) VALUES (:t, :email, :name, :role, 'active') RETURNING id`,
        { replacements: { t, email: `${key}@lti.test`, name: `Nama ${key}`, role } });
      u[key] = row.id;
      tok[key] = await tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@lti.test` });
    }
    for (const t of [tenant.id, other.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t } });
      for (const k of ['module.tna', 'module.ld', 'learner.home', 'em.lti', 'tna.review_workspace']) await flag(k, true, t);
    }
    clientId = `em-${slug}`; otherClientId = `em-${slug}-x`;
    for (const [t, cid] of [[tenant.id, clientId], [other.id, otherClientId]]) {
      await db.query(`INSERT INTO lti_tools (tenant_id, name, client_id, deployment_id, login_url, launch_url, redirect_uris, jwks_url)
        VALUES (:t, 'EliteMentor (simulasi)', :cid, 'dep-1', '/em-sim/lti/login', '/em-sim/lti/launch', ARRAY['/em-sim/lti/launch'], :jwks)`, { replacements: { t, cid, jwks: TOOL_JWKS } });
    }
    [[{ id: planId }]] = await db.query(`INSERT INTO lna_training_plan_items (tenant_id, user_id, origin, status, program_tier, catalog_source, catalog_item_ref, catalog_item_title)
      VALUES (:t, :u, 'hr', 'new', 'basic', 'elitementor', 'SD-B1', 'Root Cause Analysis') RETURNING id`, { replacements: { t: tenant.id, u: u.ani } });
    [[{ id: trainingId }]] = await db.query(`INSERT INTO ld_trainings (tenant_id, title, mode, source, status, starts_on, ends_on, assessment_mode, assessment_ref, session_count)
      VALUES (:t, 'Workshop IaC', 'offline', 'manual', 'scheduled', current_date, current_date, 'elitementor', 'IAC-1512', 1) RETURNING id`, { replacements: { t: tenant.id } });
    await db.query(`INSERT INTO ld_participants (tenant_id, training_id, user_id) VALUES (:t, :tr, :u)`, { replacements: { t: tenant.id, tr: trainingId, u: u.ani } });
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.close();
  });

  const s = {};

  test('JWKS publik platform', async () => {
    const res = await request(app).get('/api/lti/jwks');
    expect(res.status).toBe(200);
    expect(res.body.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig' });
    expect(res.body.keys[0].d).toBeUndefined();
    s.jwk = res.body.keys[0];
  });

  test('HR menugaskan di EliteMentor (mode LTI): link dibuat, idempoten, tanpa adapter REST', async () => {
    const res = await request(app).post(`/api/tna/plan-items/${planId}/assign`).set(as('hr'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ assignmentStatus: 'sent' });
    const [links] = await db.query('SELECT id, kind, user_id, course_ref FROM lti_resource_links WHERE tenant_id = :t AND plan_item_id = :p', { replacements: { t: tenant.id, p: planId } });
    expect(links).toEqual([expect.objectContaining({ kind: 'plan_item', user_id: u.ani, course_ref: 'SD-B1' })]);
    expect(res.body.data.assignmentRef).toBe(links[0].id);
    s.link = links[0].id;
    expect((await request(app).post(`/api/tna/plan-items/${planId}/assign`).set(as('hr'))).status).toBe(200);
    const [again] = await db.query('SELECT count(*)::int AS n FROM lti_resource_links WHERE plan_item_id = :p', { replacements: { p: planId } });
    expect(again[0].n).toBe(1);
  });

  test('link offline dibuat lewat store; rencana belajar memuat tombol EliteMentor dan kartu offline', async () => {
    s.offline = (await stores.lti.ensureTrainingLink(tenant.id, { trainingId, createdBy: u.hr })).id;
    expect((await stores.lti.ensureTrainingLink(tenant.id, { trainingId, createdBy: u.hr })).id).toBe(s.offline);
    const res = await request(app).get('/api/my/learning-plan').set(as('ani'));
    expect(res.status).toBe(200);
    const online = res.body.data.find((c) => c.id === planId);
    expect(online.lti).toEqual({ linkId: s.link, label: 'Belajar dengan EliteMentor' });
    const off = res.body.data.find((c) => c.lti && c.lti.linkId === s.offline);
    expect(off).toMatchObject({ title: 'Workshop IaC', mode: 'Offline', code: 'IAC-1512', lti: { label: 'Ujian di EliteMentor' } });
    const beni = await request(app).get('/api/my/learning-plan').set(as('beni'));
    expect(beni.body.data).toEqual([]);
  });

  test('peluncuran online: URL login tool, authorize mem-POST id_token yang valid', async () => {
    const { start, login, res, idToken, params } = await launch('ani', s.link);
    expect(start.status).toBe(200);
    expect(login.origin + login.pathname).toBe(`${BASE}/em-sim/lti/login`);
    expect(login.searchParams.get('iss')).toBe(ISSUER);
    expect(start.headers['set-cookie'][0]).toMatch(/elgos_lti=.+HttpOnly.+SameSite=Lax/i);
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toBe(`default-src 'none'; script-src 'nonce-${/nonce="([^"]+)"/.exec(res.text)[1]}'; style-src 'unsafe-inline'; form-action ${BASE}; base-uri 'none'; frame-ancestors 'none'`);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toContain(`action="${BASE}/em-sim/lti/launch"`);
    expect(res.text).toContain('name="state" value="st-1"');
    const claims = jwt.verify(idToken, crypto.createPublicKey({ key: s.jwk, format: 'jwk' }), { algorithms: ['RS256'], audience: clientId, issuer: ISSUER });
    expect(claims).toMatchObject({ nonce: params.nonce, sub: login.searchParams.get('login_hint'), name: 'Nama ani', email: 'ani@lti.test' });
    expect(claims[CLAIM.resourceLink].id).toBe(s.link);
    expect(claims[CLAIM.deploymentId]).toBe('dep-1');
    expect(JSON.stringify(claims)).not.toContain(tenant.id);
    expect(claims[CLAIM.agsEndpoint].lineitem).toBe(`${BASE}/api/lti/ags/links/${s.link}/lineitem`);
    s.sub = claims.sub;
  });

  test('tiket hanya sekali pakai, butuh cookie pengikat, dan redirect_uri persis', async () => {
    const first = await launch('ani', s.link);
    const replay = await request(app).get('/api/lti/authorize').query(first.params).set('Cookie', first.cookie);
    expect(replay.status).toBe(400);
    expect(replay.text).toContain('Kembali ke ELGOS');
    expect(replay.text).not.toContain('id_token');
    expect((await launch('ani', s.link, { cookie: 'elgos_lti=palsu' })).res.status).toBe(400);
    expect((await launch('ani', s.link, { mutate: (p) => ({ ...p, redirect_uri: `${BASE}/em-sim/lti/launch/` }) })).res.status).toBe(400);
    expect((await launch('ani', s.link, { mutate: (p) => ({ ...p, redirect_uri: 'https://jahat.test/ambil' }) })).res.status).toBe(400);
    expect((await launch('ani', s.link, { mutate: (p) => ({ ...p, client_id: otherClientId }) })).res.status).toBe(400);
    expect((await launch('ani', s.link, { mutate: (p) => ({ ...p, login_hint: 'orang-lain' }) })).res.status).toBe(400);
  });

  test('tiket kedaluwarsa ditolak; POST form authorize diterima', async () => {
    const { start } = await launch('ani', s.link, { mutate: (p) => ({ ...p, nonce: '' }) });
    const hint = new URL(start.body.data.url).searchParams.get('lti_message_hint');
    await db.query("UPDATE lti_launch_tickets SET expires_at = now() - interval '1 minute' WHERE ticket_hash = encode(sha256(convert_to(:h, 'UTF8')), 'hex')", { replacements: { h: hint } });
    const login = new URL(start.body.data.url);
    const params = { scope: 'openid', response_type: 'id_token', response_mode: 'form_post', client_id: clientId, redirect_uri: `${BASE}/em-sim/lti/launch`,
      login_hint: login.searchParams.get('login_hint'), lti_message_hint: hint, state: 's', nonce: 'n' };
    expect((await request(app).post('/api/lti/authorize').type('form').send(params).set('Cookie', cookieOf(start))).status).toBe(400);
    const fresh = await request(app).post('/api/my/elitementor/launch').set(as('ani')).send({ linkId: s.link });
    const l2 = new URL(fresh.body.data.url);
    const ok = await request(app).post('/api/lti/authorize').type('form').set('Cookie', cookieOf(fresh))
      .send({ ...params, lti_message_hint: l2.searchParams.get('lti_message_hint') });
    expect(ok.status).toBe(200);
    expect(ok.text).toContain('id_token');
  });

  test('launch ditolak untuk link milik orang lain, tenant lain, atau flag mati', async () => {
    expect((await request(app).post('/api/my/elitementor/launch').set(as('beni')).send({ linkId: s.link })).status).toBe(404);
    expect((await request(app).post('/api/my/elitementor/launch').set(as('xl')).send({ linkId: s.link })).status).toBe(404);
    expect((await request(app).post('/api/my/elitementor/launch').set(as('ani')).send({ linkId: 'bukan-uuid' })).status).toBe(400);
    await flag('em.lti', false);
    expect((await request(app).post('/api/my/elitementor/launch').set(as('ani')).send({ linkId: s.link })).status).toBe(403);
    const res = await request(app).get('/api/my/learning-plan').set(as('ani'));
    expect(res.body.data.find((c) => c.id === planId).lti).toBeNull();
    await flag('em.lti', true);
  });

  test('token AGS: assertion tool valid, jti sekali pakai, scope disaring', async () => {
    const res = await agsToken();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: `${AGS_SCOPES.score} ${AGS_SCOPES.lineitemRead}` });
    s.token = res.body.access_token;
    const jti = crypto.randomUUID();
    expect((await agsToken({ jti })).status).toBe(200);
    expect((await agsToken({ jti })).status).toBe(401);
    expect((await agsToken({ aud: 'https://lain.test' })).status).toBe(401);
    expect((await agsToken({ scope: 'openid' })).status).toBe(400);
    const forged = jwt.sign({ iss: clientId, sub: clientId, aud: ISSUER, jti: 'x' }, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, { algorithm: 'RS256', keyid: 'tool-k1', expiresIn: 300 });
    expect((await request(app).post('/api/lti/token').type('form').send({ grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: forged, scope: AGS_SCOPES.score })).status).toBe(401);
  });

  test('skor online: progres lalu selesai lulus -> rencana belajar + Learning Delivery', async () => {
    expect((await score(s.link, s.token, { userId: s.sub, activityProgress: 'InProgress', gradingProgress: 'NotReady', progressPct: 40 })).status).toBe(204);
    let [[p]] = await db.query('SELECT status FROM lna_training_plan_items WHERE id = :id', { replacements: { id: planId } });
    expect(p.status).toBe('in_progress');
    expect((await score(s.link, s.token, { userId: s.sub, activityProgress: 'Completed', gradingProgress: 'FullyGraded', scoreGiven: 3, scoreMaximum: 3 })).status).toBe(204);
    [[p]] = await db.query('SELECT status FROM lna_training_plan_items WHERE id = :id', { replacements: { id: planId } });
    expect(p.status).toBe('completed');
    const [[part]] = await db.query(`SELECT lp.status, lp.score::float AS score, lp.progress_pct::float AS pct FROM ld_participants lp JOIN ld_trainings t ON t.id = lp.training_id
      WHERE t.tenant_id = :t AND t.source = 'elitementor' AND t.external_ref = 'SD-B1' AND lp.user_id = :u`, { replacements: { t: tenant.id, u: u.ani } });
    expect(part).toEqual({ status: 'completed', score: 100, pct: 100 });
  });

  test('skor offline: check-in = hadir, kuis selesai = skor asesmen', async () => {
    const off = await launch('ani', s.offline);
    expect(off.res.status).toBe(200);
    const claims = jwt.decode(off.idToken);
    expect(claims[CLAIM.custom]).toMatchObject({ mode: 'offline', session_code: 'IAC-1512' });
    expect((await score(s.offline, s.token, { userId: claims.sub, activityProgress: 'Started', gradingProgress: 'NotReady' })).status).toBe(204);
    let [[row]] = await db.query('SELECT attendance, score::float AS score FROM ld_participants WHERE training_id = :tr AND user_id = :u', { replacements: { tr: trainingId, u: u.ani } });
    expect(row).toEqual({ attendance: true, score: null });
    expect((await score(s.offline, s.token, { userId: claims.sub, activityProgress: 'Completed', gradingProgress: 'FullyGraded', scoreGiven: 2, scoreMaximum: 3 })).status).toBe(204);
    [[row]] = await db.query('SELECT attendance, score::float AS score, score_source FROM ld_participants WHERE training_id = :tr AND user_id = :u', { replacements: { tr: trainingId, u: u.ani } });
    expect(row).toEqual({ attendance: true, score: 67, score_source: 'elitementor' });
  });

  test('AGS menolak: token sesi ELGOS, userId asing, link tenant lain, scope kurang, skor tidak valid', async () => {
    expect((await score(s.link, tok.ani, { userId: s.sub, activityProgress: 'Started' })).status).toBe(401);
    expect((await score(s.link, s.token, { userId: 'asing', activityProgress: 'Started' })).status).toBe(403);
    const otherTok = (await agsToken({ cid: otherClientId })).body.access_token;
    expect((await score(s.link, otherTok, { userId: s.sub, activityProgress: 'Started' })).status).toBe(404);
    const readOnly = (await agsToken({ scope: AGS_SCOPES.lineitemRead })).body.access_token;
    expect((await score(s.link, readOnly, { userId: s.sub, activityProgress: 'Started' })).status).toBe(403);
    expect((await score(s.link, s.token, { userId: s.sub, activityProgress: 'Completed', gradingProgress: 'FullyGraded', scoreGiven: 9, scoreMaximum: 3 })).status).toBe(400);
    await db.query("UPDATE lti_tools SET status = 'disabled' WHERE client_id = :c", { replacements: { c: clientId } });
    expect((await score(s.link, s.token, { userId: s.sub, activityProgress: 'Started' })).status).toBe(401);
    await db.query("UPDATE lti_tools SET status = 'active' WHERE client_id = :c", { replacements: { c: clientId } });
  });
});
