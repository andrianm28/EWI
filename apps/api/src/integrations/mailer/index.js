'use strict';
// T4: kanal undangan di POC = email. Pengirim (R2-5, domain) belum diputuskan -> MAIL_FROM dari env.
// Penyedia: 'ses' (Amazon SES v2), 'log' (dev/staging: isi email ke log, tidak terkirim), 'memory' (test).

function logMailer() {
  return {
    name: 'log',
    async send(msg) { console.log(`[mail:log] ke ${msg.to} · ${msg.subject}\n${msg.text}`); },
  };
}

function memoryMailer() {
  const sent = [];
  return { name: 'memory', sent, async send(msg) { sent.push(msg); } };
}

function sesMailer({ from, region }) {
  // dimuat saat dipakai agar test/dev tanpa AWS tidak memerlukannya
  const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
  const client = new SESv2Client({ region });
  return {
    name: 'ses',
    async send({ to, subject, text, html }) {
      await client.send(new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' }, ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}) } } },
      }));
    },
  };
}

function recipientDomain(to) {
  const m = /@([^@>\s]+)>?\s*$/.exec(String(to || ''));
  return m ? m[1].toLowerCase() : '';
}

/**
 * PK-07 / I-5: batasi penerima ke domain yang diizinkan (MAIL_ALLOWED_DOMAINS). Subdomain ikut diizinkan.
 * Email ke domain lain tidak dikirim dan tidak melempar error (alur undangan di staging tetap jalan);
 * hanya dicatat ke log tanpa isi email (isi berisi link masuk).
 */
function withDomainAllowlist(mailer, allowedDomains = [], logger = console) {
  if (!allowedDomains.length) return mailer;
  const allowed = (d) => allowedDomains.some((a) => d === a || d.endsWith(`.${a}`));
  return {
    ...mailer,
    name: mailer.name,
    allowedDomains,
    async send(msg) {
      const domain = recipientDomain(msg.to);
      if (!allowed(domain)) {
        logger.warn(`[mail:diblokir] domain "${domain || '?'}" tidak ada di MAIL_ALLOWED_DOMAINS; email "${msg.subject}" tidak dikirim`);
        return { blocked: true };
      }
      return mailer.send(msg);
    },
  };
}

function createMailer(config = {}) {
  let base;
  if (config.provider === 'ses') base = sesMailer(config);
  else if (config.provider === 'memory') base = memoryMailer();
  else base = logMailer();
  return withDomainAllowlist(base, config.allowedDomains || []);
}

module.exports = { createMailer, memoryMailer, withDomainAllowlist, recipientDomain };
