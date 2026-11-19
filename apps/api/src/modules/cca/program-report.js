'use strict';
// Program nilai korporasi (mis. "Elitery's DNA 5C"): konfigurasi per tenant dan laporan agregat dari
// hasil per karyawan yang diimpor. Nama nilai, komponen, bobot, dan ambang status adalah konfigurasi, bukan konstanta.

const MAX_VALUES = 8;
const MAX_COMPONENTS = 10;
const KEY_RE = /^[a-z0-9-]{1,32}$/;

const isScore = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
const name = (x) => (typeof x === 'string' ? x.trim() : '');
const round = (n, d = 1) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const present = (x) => x !== null && x !== undefined;

/** Periksa dan rapikan config program. Return { value } atau { error }. */
function validateProgramConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return { error: 'config program wajib diisi' };
  const values = Array.isArray(config.values) ? config.values.map((v) => ({ name: name(v && v.name) })) : [];
  if (!values.length || values.some((v) => !v.name)) return { error: 'Daftar nilai wajib berisi minimal satu nama nilai' };
  if (values.length > MAX_VALUES) return { error: `Nilai maksimal ${MAX_VALUES}` };
  const components = Array.isArray(config.components) ? config.components.map((c) => ({ name: name(c && c.name), weight: Number(c && c.weight) })) : [];
  if (components.length > MAX_COMPONENTS) return { error: `Komponen maksimal ${MAX_COMPONENTS}` };
  if (components.some((c) => !c.name || !isScore(c.weight))) return { error: 'Tiap komponen butuh nama dan bobot 0-100' };
  if (components.length && Math.abs(components.reduce((s, c) => s + c.weight, 0) - 100) > 0.001) return { error: 'Jumlah bobot komponen harus 100' };
  const totalActivities = Number(config.totalActivities);
  if (!Number.isInteger(totalActivities) || totalActivities < 1 || totalActivities > 1000) return { error: 'Jumlah kegiatan harus bilangan bulat minimal 1' };
  const passScore = Number(config.passScore);
  if (!isScore(passScore)) return { error: 'Skor lulus harus 0-100' };
  const bands = Array.isArray(config.bands) ? config.bands.map((b) => ({ key: name(b && b.key), label: name(b && b.label), min: Number(b && b.min), description: name(b && b.description) || null })) : [];
  if (!bands.length || bands.some((b) => !KEY_RE.test(b.key) || !b.label || !isScore(b.min))) return { error: 'Tiap band status butuh key, label, dan min 0-100' };
  if (new Set(bands.map((b) => b.key)).size !== bands.length || new Set(bands.map((b) => b.min)).size !== bands.length) return { error: 'Key dan min band status tidak boleh kembar' };
  if (bands.some((b) => ['not_passed', 'in_progress'].includes(b.key))) return { error: 'Key band status tidak boleh not_passed atau in_progress' };
  bands.sort((a, b) => b.min - a.min);
  // band terendah = skor lulus, supaya setiap peserta lulus masuk tepat satu band
  if (bands[bands.length - 1].min !== passScore) return { error: 'Skor minimum band status terendah harus sama dengan skor lulus' };
  return { value: { values, components, totalActivities, passScore, bands } };
}

const completed = (r, config) => Number(r.activitiesDone) >= config.totalActivities;

/** Skor akhir dari berkas; bila kosong dihitung dari komponen berbobot (komponen kosong = 0). */
function finalScoreOf(r, config) {
  if (present(r.finalScore)) return Number(r.finalScore);
  const scores = r.componentScores || [];
  return round(config.components.reduce((s, c, i) => s + (present(scores[i]) ? Number(scores[i]) : 0) * c.weight, 0) / 100, 2);
}

/** 'in_progress' | 'not_passed' | key band tertinggi yang terpenuhi. */
function statusOf(r, config) {
  if (!completed(r, config)) return 'in_progress';
  const final = finalScoreOf(r, config);
  if (final < config.passScore) return 'not_passed';
  // validateProgramConfig mewajibkan min band terendah = passScore, jadi skor lulus selalu masuk satu band
  return config.bands.find((b) => final >= b.min).key;
}

/** Rata-rata skor nilai satu peserta (hanya nilai yang terisi), atau null. */
function valueAvg(r, config) {
  return mean(config.values.map((_, i) => (r.valueScores || [])[i]).filter(present).map(Number));
}

function divisionRow(label, rows, config) {
  const done = rows.filter((r) => completed(r, config));
  const passed = done.filter((r) => finalScoreOf(r, config) >= config.passScore);
  return {
    name: label,
    participants: rows.length,
    completed: done.length,
    completedPct: pct(done.length, rows.length),
    passed: passed.length,
    passedPct: pct(passed.length, rows.length),
    avgFinal: round(mean(done.map((r) => finalScoreOf(r, config)))),
    avgValueScore: round(mean(done.map((r) => valueAvg(r, config)).filter(present))),
  };
}

/**
 * program: { key, name, provider, cutoffDate, config, insight, recommendations }
 * results: [{ userId, division, activitiesDone, finalScore, valueScores, componentScores }]
 * Hasil hanya agregat; tidak ada data per karyawan.
 */
function buildReport(program, results) {
  const { config } = program;
  const n = results.length;
  const done = results.filter((r) => completed(r, config));
  const statuses = results.map((r) => statusOf(r, config));
  const count = (key) => statuses.filter((s) => s === key).length;
  const all = divisionRow('Semua divisi', results, config);

  // Ejaan divisi dari berkas HR bisa beda huruf besar/kecil; dikelompokkan tanpa membedakannya.
  // Label = ejaan terbanyak (seri: urutan kode karakter, huruf besar dulu), supaya tidak bergantung urutan baris.
  const byDivision = new Map();
  for (const r of results) {
    const label = String(r.division || 'Tanpa divisi').trim().replace(/\s+/g, ' ');
    const key = label.toLowerCase();
    if (!byDivision.has(key)) byDivision.set(key, { spellings: new Map(), rows: [] });
    const g = byDivision.get(key);
    g.spellings.set(label, (g.spellings.get(label) || 0) + 1);
    g.rows.push(r);
  }
  for (const g of byDivision.values()) {
    g.label = [...g.spellings.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0][0];
  }

  return {
    source: 'results',
    program: { key: program.key, name: program.name, provider: program.provider ?? null, cutoffDate: program.cutoffDate ?? null },
    kpis: { registered: n, completed: all.completed, completedPct: all.completedPct, passed: all.passed, passedPct: all.passedPct, avgValueScore: all.avgValueScore },
    statuses: [
      ...config.bands.map((b) => ({ key: b.key, label: b.label, description: b.description ?? null, min: b.min, count: count(b.key), pct: pct(count(b.key), n) })),
      { key: 'not_passed', label: 'Belum lulus', count: count('not_passed'), pct: pct(count('not_passed'), n) },
      { key: 'in_progress', label: 'Masih berjalan', count: count('in_progress'), pct: pct(count('in_progress'), n) },
    ],
    values: config.values.map((v, i) => ({
      name: v.name,
      avgCompleted: round(mean(done.map((r) => (r.valueScores || [])[i]).filter(present).map(Number))),
      avgAll: n ? round(results.reduce((s, r) => s + (present((r.valueScores || [])[i]) ? Number(r.valueScores[i]) : 0), 0) / n) : null,
    })),
    components: config.components.map((c, i) => {
      const did = results.filter((r) => present((r.componentScores || [])[i])).length;
      const avg = mean(done.map((r) => (r.componentScores || [])[i]).filter(present).map(Number));
      return { name: c.name, weight: c.weight, done: did, donePct: pct(did, n), avg: round(avg), contribution: avg === null ? null : round((avg * c.weight) / 100, 2) };
    }),
    total: { done: all.completed, donePct: all.completedPct, avgFinal: all.avgFinal },
    divisions: [...byDivision.values()].map(({ label, rows }) => divisionRow(label, rows, config))
      .sort((a, b) => b.participants - a.participants || a.name.localeCompare(b.name)),
    allDivisions: all,
    insight: program.insight ?? null,
    recommendations: program.recommendations || [],
  };
}

const count = (x) => (Number.isInteger(x) && x >= 0 ? x : undefined);
const optScore = (x) => (x === null || x === undefined || x === '' ? null : (isScore(Number(x)) ? Number(x) : undefined));

/**
 * Isian agregat dari laporan ringkasan (bila berkas per karyawan tidak tersedia). Hanya angka mentah yang
 * disimpan; persen dan kontribusi dihitung saat ditampilkan. Return { value } atau { error }.
 */
function normalizeManualReport(config, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Isi laporan agregat wajib diisi' };
  const registered = count(input.registered); const completedN = count(input.completed); const passed = count(input.passed);
  if (registered === undefined || completedN === undefined || passed === undefined) return { error: 'Terdaftar, selesai, dan lulus harus bilangan bulat 0 atau lebih' };
  if (completedN > registered || passed > completedN) return { error: 'Selesai tidak boleh melebihi terdaftar, dan lulus tidak boleh melebihi selesai' };
  const avgValueScore = optScore(input.avgValueScore); const avgFinal = optScore(input.avgFinal);
  if (avgValueScore === undefined || avgFinal === undefined) return { error: 'Rata-rata skor harus angka 0-100' };

  const keys = [...config.bands.map((b) => b.key), 'not_passed', 'in_progress'];
  const st = input.statuses && typeof input.statuses === 'object' ? input.statuses : {};
  const statuses = {};
  for (const k of keys) {
    statuses[k] = count(st[k] === undefined ? 0 : st[k]);
    if (statuses[k] === undefined) return { error: 'Jumlah karyawan per status harus bilangan bulat 0 atau lebih' };
  }
  if (keys.reduce((s, k) => s + statuses[k], 0) !== registered) return { error: 'Jumlah karyawan di semua status harus sama dengan jumlah terdaftar' };
  if (config.bands.reduce((s, b) => s + statuses[b.key], 0) !== passed) return { error: 'Jumlah karyawan di band status lulus harus sama dengan jumlah lulus' };
  if (statuses.in_progress !== registered - completedN || statuses.not_passed !== completedN - passed) {
    return { error: 'Belum selesai harus sama dengan terdaftar dikurangi selesai, dan tidak lulus sama dengan selesai dikurangi lulus' };
  }

  const vals = Array.isArray(input.values) ? input.values : [];
  if (vals.length !== config.values.length) return { error: `Isi skor untuk ${config.values.length} nilai sesuai urutan program` };
  const values = vals.map((x) => ({ avgCompleted: optScore(x && x.avgCompleted), avgAll: optScore(x && x.avgAll) }));
  if (values.some((x) => x.avgCompleted === undefined || x.avgAll === undefined)) return { error: 'Skor nilai harus angka 0-100' };

  const comps = Array.isArray(input.components) ? input.components : [];
  if (comps.length !== config.components.length) return { error: `Isi ${config.components.length} komponen sesuai urutan program` };
  const components = comps.map((x) => ({ done: count(x && x.done), avg: optScore(x && x.avg) }));
  if (components.some((x) => x.done === undefined || x.done > registered || x.avg === undefined)) return { error: 'Komponen butuh jumlah yang sudah mengerjakan (maksimal terdaftar) dan rata-rata 0-100' };

  const divs = Array.isArray(input.divisions) ? input.divisions : [];
  if (divs.length > 200) return { error: 'Divisi maksimal 200 baris' };
  const divisions = divs.map((d) => ({
    name: name(d && d.name).slice(0, 255), participants: count(d && d.participants), completed: count(d && d.completed), passed: count(d && d.passed),
    avgFinal: optScore(d && d.avgFinal), avgValueScore: optScore(d && d.avgValueScore),
  }));
  if (divisions.some((d) => !d.name || d.participants === undefined || d.completed === undefined || d.passed === undefined
    || d.completed > d.participants || d.passed > d.completed || d.avgFinal === undefined || d.avgValueScore === undefined)) {
    return { error: 'Tiap divisi butuh nama, jumlah peserta, selesai, lulus (tidak saling melebihi), dan skor 0-100 atau kosong' };
  }
  if (divisions.length && divisions.reduce((s, d) => s + d.participants, 0) !== registered) return { error: 'Jumlah peserta semua divisi harus sama dengan jumlah terdaftar' };
  return { value: { registered, completed: completedN, passed, avgValueScore, avgFinal, statuses, values, components, divisions } };
}

/** Laporan dari isian agregat, berbentuk sama dengan buildReport(). m = hasil normalizeManualReport yang tersimpan. */
function buildManualReport(program, m) {
  const { config } = program;
  const n = m.registered;
  const div = (d) => ({
    name: d.name, participants: d.participants, completed: d.completed, completedPct: pct(d.completed, d.participants),
    passed: d.passed, passedPct: pct(d.passed, d.participants), avgFinal: d.avgFinal, avgValueScore: d.avgValueScore,
  });
  const all = div({ name: 'Semua divisi', participants: n, completed: m.completed, passed: m.passed, avgFinal: m.avgFinal, avgValueScore: m.avgValueScore });
  const status = (key, extra) => ({ key, ...extra, count: m.statuses[key] || 0, pct: pct(m.statuses[key] || 0, n) });
  return {
    source: 'manual',
    program: { key: program.key, name: program.name, provider: program.provider ?? null, cutoffDate: program.cutoffDate ?? null },
    kpis: { registered: n, completed: all.completed, completedPct: all.completedPct, passed: all.passed, passedPct: all.passedPct, avgValueScore: m.avgValueScore },
    statuses: [
      ...config.bands.map((b) => status(b.key, { label: b.label, description: b.description ?? null, min: b.min })),
      status('not_passed', { label: 'Belum lulus' }),
      status('in_progress', { label: 'Masih berjalan' }),
    ],
    values: config.values.map((x, i) => ({ name: x.name, avgCompleted: (m.values[i] || {}).avgCompleted ?? null, avgAll: (m.values[i] || {}).avgAll ?? null })),
    components: config.components.map((c, i) => {
      const x = m.components[i] || { done: 0, avg: null };
      return { name: c.name, weight: c.weight, done: x.done, donePct: pct(x.done, n), avg: x.avg, contribution: x.avg === null ? null : round((x.avg * c.weight) / 100, 2) };
    }),
    total: { done: all.completed, donePct: all.completedPct, avgFinal: m.avgFinal },
    divisions: m.divisions.map(div).sort((a, b) => b.participants - a.participants || a.name.localeCompare(b.name)),
    allDivisions: all,
    insight: program.insight ?? null,
    recommendations: program.recommendations || [],
  };
}

module.exports = { normalizeManualReport, buildManualReport, MAX_VALUES, MAX_COMPONENTS, KEY_RE, validateProgramConfig, finalScoreOf, statusOf, buildReport };
