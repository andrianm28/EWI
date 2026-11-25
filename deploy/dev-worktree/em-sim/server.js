'use strict';
// EliteMentor (simulasi): Tool LTI 1.3 tiruan untuk stack dev/demo ELGOS. BUKAN kode produk dan bukan EliteMentor asli.
// Meniru kontrak tool EliteMentor (lti-dashboard-backend src/lti/oidc.js + jwt.js): GET|POST /lti/login -> redirect ke
// authorize platform; POST /lti/launch memverifikasi id_token RS256 lewat JWKS platform (kid, iss, aud, nonce,
// deployment_id, message_type, version); GET /lti/keys. Nilai balik lewat LTI AGS (token client_credentials + JWT assertion).
// Spek: docs/designs/em-lti-platform.md §6. Tanpa dependensi (Node 24). Semua state di memori.
const http = require('node:http');
const crypto = require('node:crypto');
const { MODULES, moduleFor } = require('./content');

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const PORT = Number(env('PORT', 4300));
const BASE_PATH = env('BASE_PATH', '/em-sim').replace(/\/+$/, '');
const ISSUER = env('PLATFORM_ISSUER', 'https://elgos-dev.local').replace(/\/+$/, '');
const CLIENT_ID = env('CLIENT_ID', 'elitementor-sim');
const DEPLOYMENT_ID = env('DEPLOYMENT_ID', 'elgos-demo');
const AUTH_URL = env('PLATFORM_AUTH_URL', '/api/lti/authorize'); // dibuka browser (origin yang sama lewat nginx)
const INTERNAL = env('ELGOS_INTERNAL_URL', 'http://api:4100').replace(/\/+$/, ''); // dipanggil server
const JWKS_URL = env('PLATFORM_JWKS_URL', `${INTERNAL}/api/lti/jwks`);
const TOKEN_URL = env('PLATFORM_TOKEN_URL', `${INTERNAL}/api/lti/token`);
const TOKEN_AUD = env('PLATFORM_TOKEN_AUD', ISSUER);
const TTL_MS = 2 * 60 * 60 * 1000;
const SCOPE_SCORE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';
const C = 'https://purl.imsglobal.org/spec/lti/claim';

// ---------- kunci tool + JWT RS256 tanpa pustaka ----------
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const toolKid = crypto.randomBytes(8).toString('hex');
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const b64json = (o) => b64u(JSON.stringify(o));
function signJwt(payload) {
  const head = b64json({ alg: 'RS256', typ: 'JWT', kid: toolKid });
  const body = b64json(payload);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey);
  return `${head}.${body}.${b64u(sig)}`;
}
let jwksCache = { at: 0, keys: [] };
async function platformKey(kid) {
  if (Date.now() - jwksCache.at > 5 * 60 * 1000 || !jwksCache.keys.some((k) => k.kid === kid)) {
    const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`JWKS platform ${res.status}`);
    jwksCache = { at: Date.now(), keys: (await res.json()).keys || [] };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error(`Tidak ada kunci platform untuk kid ${kid}`);
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}
async function verifyIdToken(token) {
  const [h, p, s] = String(token || '').split('.');
  if (!h || !p || !s) throw new Error('id_token bukan JWT');
  const header = JSON.parse(Buffer.from(h, 'base64url'));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('alg/kid id_token tidak didukung');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), await platformKey(header.kid), Buffer.from(s, 'base64url'));
  if (!ok) throw new Error('Tanda tangan id_token tidak valid');
  const c = JSON.parse(Buffer.from(p, 'base64url'));
  const now = Math.floor(Date.now() / 1000);
  if (c.iss !== ISSUER) throw new Error(`iss tidak cocok: ${c.iss}`);
  if (![].concat(c.aud).includes(CLIENT_ID)) throw new Error('aud tidak cocok');
  if (!c.exp || c.exp < now - 30) throw new Error('id_token kedaluwarsa');
  if (c[`${C}/deployment_id`] !== DEPLOYMENT_ID) throw new Error('deployment_id tidak dikenal');
  if (c[`${C}/message_type`] !== 'LtiResourceLinkRequest') throw new Error('message_type tidak didukung');
  if (c[`${C}/version`] !== '1.3.0') throw new Error('versi LTI harus 1.3.0');
  return c;
}

// ---------- state ----------
const states = new Map(); // state -> { nonce, at }
const sessions = new Map(); // sid -> sesi belajar
function sweep() {
  const cut = Date.now() - TTL_MS;
  for (const [k, v] of states) if (v.at < Date.now() - 10 * 60 * 1000) states.delete(k);
  for (const [k, v] of sessions) if (v.at < cut) sessions.delete(k);
}

// ---------- AGS ----------
let agsToken = { value: null, exp: 0 };
async function accessToken() {
  if (agsToken.value && agsToken.exp - 60_000 > Date.now()) return agsToken.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({ iss: CLIENT_ID, sub: CLIENT_ID, aud: TOKEN_AUD, iat: now, exp: now + 300, jti: crypto.randomUUID() });
  const res = await fetch(TOKEN_URL, {
    method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion, scope: SCOPE_SCORE }),
  });
  if (!res.ok) throw new Error(`Token AGS ditolak: ${res.status} ${await res.text()}`);
  const body = await res.json();
  agsToken = { value: body.access_token, exp: Date.now() + (body.expires_in || 3600) * 1000 };
  return agsToken.value;
}
/** URL lineitem dari klaim adalah URL publik; simulator memanggilnya lewat jaringan internal compose. */
const internalUrl = (u) => { const x = new URL(u, INTERNAL); return `${INTERNAL}${x.pathname}${x.search}`; };
async function sendScore(sess, body) {
  const url = `${internalUrl(sess.lineitem)}/scores`;
  try {
    const res = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/vnd.ims.lis.v1.score+json' },
      body: JSON.stringify({ userId: sess.sub, timestamp: new Date().toISOString(), gradingProgress: 'NotReady', ...body }),
    });
    sess.sync = res.ok ? 'ok' : `gagal (${res.status})`;
    if (!res.ok) console.error(`[em-sim] skor ditolak ${res.status}: ${await res.text()}`);
  } catch (e) {
    sess.sync = 'gagal'; console.error(`[em-sim] skor gagal: ${e.message}`);
  }
}

// ---------- HTTP util ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 64 * 1024) { reject(new Error('body terlalu besar')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))));
    req.on('error', reject);
  });
}
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((p) => p.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const cookie = (name, value, maxAge) => `${name}=${encodeURIComponent(value)}; Path=${BASE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
const SECURITY = { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' };
function send(res, status, html, headers = {}) { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY, ...headers }); res.end(html); }
function redirect(res, status, location, headers = {}) { res.writeHead(status, { Location: location, ...SECURITY, ...headers }); res.end(); }

// ---------- halaman ----------
const CSS = `:root{color-scheme:light;--ink:#1d1d1f;--muted:#5b5b66;--line:#d9d9e0;--brand:#0b5cad;--bg:#f6f7f9;--ok:#e7f4ea;--err:#fbe9e9}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
header{background:#fff;border-bottom:1px solid var(--line);padding:12px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.logo{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:8px;background:var(--brand);color:#fff;font-weight:700;font-size:12px}
.sim{font-size:12px;background:#fff4d6;border:1px solid #e6c766;border-radius:999px;padding:2px 10px}
main{max-width:960px;margin:0 auto;padding:16px}h1{font-size:1.5rem;margin:8px 0}.muted{color:var(--muted)}
.grid{display:grid;grid-template-columns:minmax(0,240px) minmax(0,1fr);gap:16px;align-items:start}@media (max-width:720px){.grid{grid-template-columns:1fr}}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}
ol.steps{list-style:none;margin:0;padding:0;display:grid;gap:8px}ol.steps li{display:flex;gap:8px;align-items:center}
ol.steps b{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;border:1px solid var(--line);font-size:12px}
ol.steps li[aria-current] b{background:var(--brand);color:#fff;border-color:var(--brand)}ol.steps li.done b{background:var(--ok)}
.chat{display:grid;gap:8px;margin:0;padding:0;list-style:none}.msg{padding:8px 12px;border-radius:12px;max-width:85%}
.msg small{display:block;font-weight:600;font-size:12px}.ai{background:#eef3fb}.me{background:#f0f0f3;justify-self:end}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}button,.btn{font:inherit;border-radius:999px;padding:8px 16px;border:1px solid var(--brand);background:var(--brand);color:#fff;cursor:pointer;text-decoration:none;display:inline-block}
button.o,.btn.o{background:#fff;color:var(--brand)}button:focus-visible,.btn:focus-visible,input:focus-visible{outline:3px solid #f2a900;outline-offset:2px}
input[type=text]{font:inherit;padding:8px 12px;border:1px solid var(--line);border-radius:8px;min-width:0;flex:1}
fieldset{border:0;padding:0;margin:16px 0 0}legend{font-weight:600;margin-bottom:8px}.note{padding:12px;border-radius:8px;margin-top:16px}.note.ok{background:var(--ok)}.note.e{background:var(--err)}
label{display:block;font-weight:600;margin-top:16px}`;

function layout(title, body, returnUrl) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · EliteMentor (simulasi)</title><style>${CSS}</style></head><body>
<header><div style="display:flex;gap:8px;align-items:center"><span class="logo" aria-hidden="true">EM</span><b>EliteMentor</b><span class="sim">simulasi untuk demo ELGOS</span></div>
${returnUrl ? `<a class="btn o" href="${esc(returnUrl)}">Kembali ke ELGOS</a>` : ''}</header><main>${body}</main></body></html>`;
}

function stepsOf(sess) {
  const names = sess.offline ? ['Check-in', 'Ujian', 'Hasil'] : ['Materi', 'Tanya jawab', 'Mini quiz', 'Hasil'];
  const at = sess.offline ? { checkin: 0, quiz: 1, result: 2 }[sess.step] : { learn: 0, qa: 1, quiz: 2, result: 3 }[sess.step];
  return `<ol class="steps">${names.map((n, i) => `<li class="${i < at ? 'done' : ''}"${i === at ? ' aria-current="step"' : ''}><b>${i + 1}</b><span>${n}</span></li>`).join('')}</ol>`;
}

function learnPage(sess) {
  const m = sess.module;
  const turns = sess.turns.map((t) => `<li class="msg ${t.me ? 'me' : 'ai'}"><small>${t.me ? 'Anda' : 'EliteMentor'}</small>${esc(t.text)}</li>`).join('');
  let action = '';
  const form = (inner) => `<form method="post" action="${BASE_PATH}/belajar">${inner}</form>`;
  if (sess.step === 'learn') {
    action = `<div class="row">${form('<button class="o" name="aksi" value="video">Putar video interaktif</button>')}${form('<button class="o" name="aksi" value="baca">Buka bahan bacaan</button>')}${form('<button name="aksi" value="ke_qa">Lanjut ke tanya jawab</button>')}</div>`;
  } else if (sess.step === 'qa') {
    action = `${form(`<label for="tanya">Pertanyaan untuk EliteMentor</label><div class="row" style="margin-top:4px"><input type="text" id="tanya" name="tanya" required maxlength="300" autocomplete="off" placeholder="Tanyakan apa pun tentang modul ini"><button name="aksi" value="tanya">Kirim</button></div>`)}
      <div class="row">${m.chips.map((c) => form(`<input type="hidden" name="tanya" value="${esc(c)}"><button class="o" name="aksi" value="tanya">${esc(c)}</button>`)).join('')}</div>
      <div class="row">${form('<button name="aksi" value="ke_kuis">Lanjut ke mini quiz</button>')}</div>`;
  } else if (sess.step === 'checkin') {
    const err = sess.checkinError ? `<p id="kode-galat" class="note e" role="alert">Kode sesi tidak cocok. Minta kode kepada instruktur.</p>` : '';
    action = form(`<label for="kode">Kode sesi dari instruktur</label>
      <p id="kode-bantu" class="muted" style="margin:4px 0">Demo: kode sesi ${esc(sess.sessionCode)}.</p>${err}
      <div class="row" style="margin-top:4px"><input type="text" id="kode" name="kode" required maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false"
      aria-describedby="kode-bantu${sess.checkinError ? ' kode-galat' : ''}"${sess.checkinError ? ' aria-invalid="true"' : ''}><button name="aksi" value="checkin">Check-in dan mulai ujian</button></div>`);
  } else if (sess.step === 'quiz') {
    const [q, opts] = m.quiz[sess.answers.length];
    action = form(`<fieldset><legend>Pertanyaan ${sess.answers.length + 1} dari ${m.quiz.length}: ${esc(q)}</legend>
      <p class="muted" style="margin:0 0 8px">Satu kesempatan per pertanyaan.</p><div class="row" style="margin-top:0">${opts.map((o, i) => `<button class="o" name="jawab" value="${i}">${esc(o)}</button>`).join('')}</div>
      <input type="hidden" name="aksi" value="jawab"></fieldset>`);
  } else if (sess.step === 'result') {
    const pass = sess.score >= 70;
    action = `<div class="note ${pass ? 'ok' : 'e'}" role="status"><b>${pass ? 'Lulus.' : 'Belum lulus.'}</b> Skor ${sess.score} dari 100.
      ${sess.sync === 'ok' ? 'Skor sudah dikirim ke ELGOS (Learning Delivery).' : `Pengiriman skor ke ELGOS ${esc(sess.sync || 'belum dilakukan')}.`}</div>
      <div class="row">${sess.returnUrl ? `<a class="btn" href="${esc(sess.returnUrl)}">Kembali ke Rencana belajar</a>` : ''}${form('<button class="o" name="aksi" value="ulang">Ulangi demo</button>')}</div>`;
  }
  return layout(m.name, `<p class="muted" style="margin:0">Rencana belajar › EliteMentor</p>
    <h1>${esc(m.name)}</h1><p class="muted" style="margin:0 0 16px">${esc(m.where)} · ${esc(sess.code)}</p>
    <div class="grid"><div class="card"><h2 class="muted" style="font-size:.875rem;margin:0 0 8px">Langkah</h2>${stepsOf(sess)}
      <p class="muted" style="font-size:.8125rem">Progres dan skor disinkronkan ke ELGOS (Learning Delivery) lewat LTI AGS.</p></div>
    <section class="card" aria-labelledby="chat-judul"><h2 id="chat-judul" style="font-size:1rem;margin:0 0 12px">Percakapan dengan EliteMentor</h2>
      <ol class="chat" role="log" aria-live="polite">${turns}</ol>${action}</section></div>`, sess.returnUrl);
}

function errorPage(message) {
  return layout('Peluncuran gagal', `<h1>EliteMentor tidak bisa dibuka</h1><p class="note e" role="alert">${esc(message)}</p><p>Kembali ke ELGOS dan tekan tombol EliteMentor sekali lagi.</p>`);
}

// ---------- alur belajar ----------
function startSession(c) {
  const custom = c[`${C}/custom`] || {};
  const code = custom.course_code || (c[`${C}/context`] || {}).label || 'MODUL';
  const offline = custom.mode === 'offline';
  const m = moduleFor(code, { offline, title: (c[`${C}/resource_link`] || {}).title });
  return {
    at: Date.now(), sub: c.sub, name: c.name, code, offline, module: m, sessionCode: custom.session_code || code,
    lineitem: (c['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'] || {}).lineitem,
    returnUrl: (c[`${C}/launch_presentation`] || {}).return_url,
    step: offline ? 'checkin' : 'learn', answers: [], turns: [{ text: `Halo ${c.name || ''}. ${m.intro}`.replace('Halo . ', 'Halo. ') }],
  };
}

async function act(sess, f) {
  const say = (text, me = false) => sess.turns.push({ text, me });
  const m = sess.module;
  switch (f.aksi) {
    case 'video': say('Putar video interaktif', true); say(m.video); await sendScore(sess, { activityProgress: 'InProgress', progressPct: 30 }); break;
    case 'baca': say('Buka bahan bacaan', true); say(m.read); await sendScore(sess, { activityProgress: 'InProgress', progressPct: 45 }); break;
    case 'ke_qa': if (sess.step === 'learn') { sess.step = 'qa'; say('Silakan bertanya. Saya menjawab dari materi modul ini.'); await sendScore(sess, { activityProgress: 'InProgress', progressPct: 60 }); } break;
    case 'tanya': {
      const q = String(f.tanya || '').trim().slice(0, 300);
      if (!q || sess.step !== 'qa') break;
      const hit = m.qa.find(([k]) => q.toLowerCase().includes(k));
      say(q, true); say(hit ? hit[1] : 'Pertanyaan bagus. Dari materi modul ini, kuncinya adalah mencatat setiap langkah dan memastikan hasilnya dikonfirmasi pemangku kepentingan.');
      break;
    }
    case 'ke_kuis': if (sess.step === 'qa') { sess.step = 'quiz'; say(`Mini quiz dimulai, ${m.quiz.length} pertanyaan.`); await sendScore(sess, { activityProgress: 'InProgress', progressPct: 80 }); } break;
    case 'checkin':
      if (sess.step !== 'checkin') break;
      if (String(f.kode || '').trim().toUpperCase() === String(sess.sessionCode).toUpperCase()) {
        sess.checkinError = false; sess.step = 'quiz';
        say(`Check-in berhasil. Kehadiran Anda tercatat di ELGOS. Ujian dimulai, ${m.quiz.length} pertanyaan.`);
        await sendScore(sess, { activityProgress: 'Started' });
      } else sess.checkinError = true;
      break;
    case 'jawab': {
      if (sess.step !== 'quiz') break;
      const i = Number(f.jawab); const [, opts, right] = m.quiz[sess.answers.length];
      if (!Number.isInteger(i) || !opts[i]) break;
      say(opts[i], true); sess.answers.push(i === right);
      say(i === right ? 'Benar.' : `Kurang tepat. Jawaban yang benar: ${opts[right]}.`);
      if (sess.answers.length === m.quiz.length) {
        const correct = sess.answers.filter(Boolean).length;
        sess.score = Math.round((correct / m.quiz.length) * 100); sess.step = 'result';
        await sendScore(sess, { activityProgress: 'Completed', gradingProgress: 'FullyGraded', scoreGiven: correct, scoreMaximum: m.quiz.length, comment: 'Mini quiz EliteMentor (simulasi)' });
      }
      break;
    }
    case 'ulang': Object.assign(sess, startSession({ ...sess.claims })); break;
    default: break;
  }
}

// ---------- router ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://em-sim');
  const path = url.pathname.startsWith(BASE_PATH) ? url.pathname.slice(BASE_PATH.length) || '/' : url.pathname;
  sweep();
  if (path === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"status":"ok"}'); }
  if (path === '/lti/keys') {
    const { kty, n, e } = publicKey.export({ format: 'jwk' });
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ keys: [{ kty, n, e, kid: toolKid, alg: 'RS256', use: 'sig' }] }));
  }
  if (path === '/lti/login' && (req.method === 'GET' || req.method === 'POST')) {
    const p = req.method === 'POST' ? await readBody(req) : Object.fromEntries(url.searchParams);
    if (String(p.iss || '').replace(/\/+$/, '') !== ISSUER || (p.client_id && p.client_id !== CLIENT_ID)) return send(res, 400, errorPage('Platform tidak terdaftar di EliteMentor (simulasi).'));
    if (!p.login_hint || !p.target_link_uri) return send(res, 400, errorPage('Permintaan login LTI tidak lengkap.'));
    const target = new URL(p.target_link_uri);
    if (target.pathname !== `${BASE_PATH}/lti/launch`) return send(res, 400, errorPage('target_link_uri bukan alamat EliteMentor (simulasi).'));
    const state = crypto.randomBytes(16).toString('hex'); const nonce = crypto.randomBytes(16).toString('hex');
    states.set(state, { nonce, at: Date.now() });
    const auth = new URL(AUTH_URL, target.origin);
    for (const [k, v] of Object.entries({ scope: 'openid', response_type: 'id_token', response_mode: 'form_post', prompt: 'none', client_id: CLIENT_ID,
      redirect_uri: target.toString(), login_hint: p.login_hint, state, nonce, ...(p.lti_message_hint ? { lti_message_hint: p.lti_message_hint } : {}) })) auth.searchParams.set(k, v);
    return redirect(res, 302, auth.toString(), { 'Set-Cookie': cookie('em_state', state, 600) });
  }
  if (path === '/lti/launch' && req.method === 'POST') {
    const f = await readBody(req);
    const st = states.get(f.state);
    if (!st || cookies(req).em_state !== f.state) return send(res, 400, errorPage('State peluncuran tidak cocok atau kedaluwarsa.'));
    states.delete(f.state);
    let claims;
    try { claims = await verifyIdToken(f.id_token); if (claims.nonce !== st.nonce) throw new Error('nonce tidak cocok'); } catch (e) {
      console.error(`[em-sim] launch ditolak: ${e.message}`); return send(res, 401, errorPage(`id_token ditolak: ${e.message}`));
    }
    const sid = crypto.randomBytes(24).toString('hex');
    const sess = startSession(claims); sess.claims = claims; sessions.set(sid, sess);
    if (!sess.offline) await sendScore(sess, { activityProgress: 'Started', progressPct: 10 });
    console.log(`[em-sim] launch ok: ${sess.code} (${sess.offline ? 'offline' : 'online'})`);
    return redirect(res, 303, `${BASE_PATH}/belajar`, { 'Set-Cookie': [cookie('em_sess', sid, TTL_MS / 1000), cookie('em_state', '', 0)] });
  }
  if (path === '/belajar') {
    const sess = sessions.get(cookies(req).em_sess);
    if (!sess) return send(res, 401, errorPage('Sesi EliteMentor tidak ditemukan atau sudah berakhir.'));
    sess.at = Date.now();
    if (req.method === 'POST') { await act(sess, await readBody(req)); return redirect(res, 303, `${BASE_PATH}/belajar`); }
    return send(res, 200, learnPage(sess));
  }
  if (path === '/' || path === '') return send(res, 200, layout('Beranda', `<h1>EliteMentor (simulasi)</h1><p>Simulator Tool LTI 1.3 untuk demo ELGOS. Buka modul dari Rencana belajar di ELGOS.</p><p class="muted">Modul tersedia: ${Object.keys(MODULES).map(esc).join(', ')}.</p>`));
  return send(res, 404, errorPage('Halaman tidak ditemukan.'));
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => { console.error('[em-sim]', e); if (!res.headersSent) send(res, 500, errorPage('Terjadi kesalahan di simulator.')); else res.end(); });
}).listen(PORT, () => console.log(`[em-sim] EliteMentor (simulasi) di :${PORT}${BASE_PATH}, issuer ${ISSUER}, client ${CLIENT_ID}`));
