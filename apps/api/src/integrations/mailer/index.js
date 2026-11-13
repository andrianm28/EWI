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

function createMailer(config = {}) {
  if (config.provider === 'ses') return sesMailer(config);
  if (config.provider === 'memory') return memoryMailer();
  return logMailer();
}

module.exports = { createMailer, memoryMailer };
