'use strict';
// PK-16: batas laju untuk rute login. Jendela tetap per kunci (mis. "ip:1.2.3.4" atau "akun:tenant:email").
// Disimpan di memori proses: API ELGOS berjalan sebagai satu proses per lingkungan di etavm2. Bila nanti
// dijalankan lebih dari satu replika, ganti `store` dengan penyimpanan bersama (Postgres/Redis).
const { tooManyRequests } = require('../errors');

function memoryRateStore() {
  const buckets = new Map();
  return {
    buckets,
    hit(key, windowMs, nowMs) {
      let b = buckets.get(key);
      if (!b || b.resetAt <= nowMs) { b = { count: 0, resetAt: nowMs + windowMs }; buckets.set(key, b); }
      b.count += 1;
      return b;
    },
    peek(key, nowMs) {
      const b = buckets.get(key);
      return b && b.resetAt > nowMs ? b : null;
    },
    reset(key) { buckets.delete(key); },
    sweep(nowMs) { for (const [k, b] of buckets) if (b.resetAt <= nowMs) buckets.delete(k); },
  };
}

/**
 * limiter.consume(key) menambah hitungan dan melempar 429 bila melewati batas.
 * limiter.blocked(key) memeriksa tanpa menambah (dipakai untuk batas kegagalan per akun).
 */
function createRateLimiter({ windowMs, max, store = memoryRateStore(), now = () => Date.now(), message } = {}) {
  let lastSweep = 0;
  const sweep = (t) => { if (t - lastSweep > windowMs) { store.sweep(t); lastSweep = t; } };
  const fail = (b, t) => {
    const err = tooManyRequests(message);
    err.retryAfter = Math.max(1, Math.ceil((b.resetAt - t) / 1000));
    return err;
  };
  return {
    windowMs,
    max,
    consume(key) {
      const t = now(); sweep(t);
      const b = store.hit(key, windowMs, t);
      if (b.count > max) throw fail(b, t);
    },
    record(key) { const t = now(); sweep(t); store.hit(key, windowMs, t); },
    check(key) {
      const t = now();
      const b = store.peek(key, t);
      if (b && b.count >= max) throw fail(b, t);
    },
    reset(key) { store.reset(key); },
  };
}

/** Middleware Express: batas per alamat IP (req.ip, ikut setelan trust proxy). */
function limitByIp(limiter, scope) {
  return (req, res, next) => {
    try {
      limiter.consume(`${scope}:ip:${req.ip}`);
      return next();
    } catch (e) {
      if (e.retryAfter) res.set('Retry-After', String(e.retryAfter));
      return next(e);
    }
  };
}

module.exports = { createRateLimiter, memoryRateStore, limitByIp };
