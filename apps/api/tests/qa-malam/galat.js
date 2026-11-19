'use strict';
// B18 QA malam: galat berkode dari pelaksana. Kode QA_* dibaca cli.js untuk memilih kode keluar dan pesan singkat.
const galatQa = (code, pesan) => Object.assign(new Error(pesan), { code });

module.exports = { galatQa };
