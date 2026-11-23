// Memotret setiap layar + state mockup Pak Eji. Pakai: node catalog.cjs [--mockup <Main.dc.html>] <outdir>
// Mockup klien tidak disimpan di repo (audit PR 39 butir 39-5); lokasinya dari --mockup, env MOCKUP_FILE, atau bawaan
// folder proyek. Lihat README.md di folder ini.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const DEFAULT_MOCKUP = '/mnt/project-files/mockup-pak-eji/Main.dc.html';
const args = process.argv.slice(2);
const flag = args.indexOf('--mockup');
const mockupFile = flag >= 0 ? args.splice(flag, 2)[1] : (process.env.MOCKUP_FILE || DEFAULT_MOCKUP);
if (!mockupFile || !fs.existsSync(mockupFile)) {
  console.error(`Mockup tidak ditemukan: ${mockupFile || '(kosong)'}. Isi --mockup <path> atau MOCKUP_FILE.`);
  process.exit(1);
}
const out = args[0] || 'shots'; fs.mkdirSync(out, { recursive: true });
// Mockup memuat ./support.js relatif terhadap dirinya: salin keduanya ke folder sementara
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mockup-render-'));
fs.copyFileSync(mockupFile, path.join(work, 'Main.dc.html'));
fs.copyFileSync(path.join(__dirname, 'support.js'), path.join(work, 'support.js'));
const base = (role) => ({ acct: role === 'karyawan_hr' ? 'hr' : role, role: role === 'karyawan_hr' ? 'karyawan' : role });
const S = [];
const add = (role, screen, extra = {}, name) => S.push({ name: name || `${role}--${screen}${Object.keys(extra).length ? '--' + Object.values(extra).map(v => typeof v === 'object' ? 'x' : v).join('-') : ''}`, st: { ...base(role), screen, ...extra } });
S.push({ name: 'login--cred', st: {} }); S.push({ name: 'login--otp', st: { loginStep: 'otp' } });
for (const r of ['hr', 'atasan']) {
  add(r, 'dash');
  ['dash','kamus','kur','peg'].forEach(t => add(r, 'dna', { dnaTab: t }));
  ['dash','komp','okr'].forEach(t => add(r, 'tna', { tnaTab: t }));
  add(r, 'gap'); add(r, 'review'); add(r, 'ina');
  ['dash','comp','biz','ai'].forEach(t => add(r, 'lim', { limTab: t }));
  ['map','path','dec'].forEach(t => add(r, 'cp', { cpTab: t }));
}
['vm','val'].forEach(t => add('hr', 'cc', { ccTab: t }));
add('hr', 'cc', { ccTab: 'aiv', aivStep: 'list' }); add('atasan', 'aiv', { aivStep: 'list' });
['lib','prog','req'].forEach(s => add('hr', s)); [1,2,3,4].forEach(n => add('hr', 'lidev', { devStep: n }));
['dash','run','soon','off'].forEach(t => add('hr', 'ld', { ldTab: t }));
add('hr', 'lim', { limTab: 'ai', limStep: 'bench' }); add('hr', 'lim', { limTab: 'ai', limStep: 'biz' }); add('hr', 'lim', { limTab: 'ai', limStep: 'sum' });
add('karyawan', 'my'); add('karyawan', 'aiv', { aivStep: 'list' }); add('karyawan', 'iv', { ivStep: 'consent' }); add('karyawan', 'iv', { ivStep: 'consent', consentErr: true });
add('karyawan', 'li'); add('karyawan', 'em', { emCode: 'ST-B4', emStep: 'learn' }); add('karyawan', 'em', { emCode: 'ST-A2', emStep: 'checkin' });
add('karyawan_hr', 'my', {}, 'hr-as-karyawan--my');
['users','jobs','cfg'].forEach(s => add('admin', s)); add('admin', 'users', { invited: true });
add('super', 'tenants'); add('super', 'platform');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.join(work, 'Main.dc.html')); await p.waitForFunction(() => window.__dcReady);
  const init = await p.evaluate(() => JSON.stringify(window.__dc.state));
  for (const s of S) { await p.evaluate(([i, st]) => { window.__dc.state = JSON.parse(i); window.__dc.setState(st); window.scrollTo(0,0); }, [init, s.st]);
    await p.waitForTimeout(80); await p.screenshot({ path: `${out}/${s.name}.png`, fullPage: true });
    require('fs').writeFileSync(`${out}/${s.name}.txt`, await p.evaluate(() => document.body.innerText)); }
  console.log(S.length, 'state'); await b.close(); fs.rmSync(work, { recursive: true, force: true }); })();
