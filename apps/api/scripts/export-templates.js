'use strict';
// Tulis template impor ELGOS (R3-3) ke folder, mis. untuk dibagikan ke klien sebelum POC:
//   node scripts/export-templates.js ./out
const fs = require('fs');
const path = require('path');
const { KINDS } = require('../src/modules/imports/kinds');
const { templateXlsx } = require('../src/modules/imports/template');

(async () => {
  const dir = path.resolve(process.argv[2] || 'templates');
  fs.mkdirSync(dir, { recursive: true });
  for (const [i, kind] of KINDS.entries()) {
    const file = path.join(dir, `${i + 1}-template-elgos-${kind.key}.xlsx`);
    fs.writeFileSync(file, await templateXlsx(kind));
    console.log(file);
  }
})().catch((e) => { console.error(e); process.exit(1); });
