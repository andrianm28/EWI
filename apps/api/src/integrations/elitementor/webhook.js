'use strict';
// Webhook masuk dari EliteMentor (progres, kelulusan program, sync back).
// Header: X-EM-Timestamp (detik epoch) dan X-EM-Signature = hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`)).
const crypto = require('crypto');
const express = require('express');

const TOLERANCE_SECONDS = 300;

function sign(secret, timestamp, rawBody) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

function verify(secret, timestamp, rawBody, signature, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(sign(secret, timestamp, rawBody), 'hex');
  const given = Buffer.from(String(signature), 'hex');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** handler(event) dipanggil untuk event yang lolos verifikasi. Penyimpanan idempoten menyusul (B21). */
function webhookRouter({ secret, handler = async () => {} }) {
  const r = express.Router();
  r.post('/', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res, next) => {
    try {
      const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
      if (!verify(secret, req.get('x-em-timestamp'), raw, req.get('x-em-signature'))) {
        return res.status(401).json({ error: { code: 'BAD_SIGNATURE', message: 'Tanda tangan webhook tidak valid' } });
      }
      await handler(JSON.parse(raw));
      return res.status(202).json({ received: true });
    } catch (e) { return next(e); }
  });
  return r;
}

module.exports = { sign, verify, webhookRouter };
