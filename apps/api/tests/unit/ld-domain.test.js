// B14 Learning Delivery: aturan murni (status, kelompok, kelengkapan, KPI, insight, event webhook) dan port storage.
const {
  todayJakarta, progressOf, groupOf, assessmentStatus, readiness, upcomingChecks, health, decorate, kpis, buildInsights, normalizeEvent,
} = require('../../src/modules/ld/domain');
const { detectType, allowedFor, safeFilename, newKey, memoryStorage, diskStorage, createStorage } = require('../../src/integrations/storage');

const TODAY = '2026-12-10';
const online = (o = {}) => ({ id: 'on', title: 'Ticket Life Cycle', mode: 'online', source: 'elitementor', status: 'running', participants: 6, completed: 0, avgProgress: 50, ...o });
const offline = (o = {}) => ({ id: 'off', title: 'Workshop RCA', mode: 'offline', source: 'manual', status: 'scheduled', startsOn: '2026-12-15', endsOn: '2026-12-15', venue: 'Kantor', sessionCount: 1, sessionsDone: 0, materialsReady: true, assessmentMode: 'vendor_manual', participants: 6, ...o });

describe('todayJakarta', () => {
  it('memakai tanggal WIB, bukan UTC', () => {
    expect(todayJakarta(new Date('2026-12-09T18:30:00Z'))).toBe('2026-12-10');
    expect(todayJakarta(new Date('2026-12-09T16:59:00Z'))).toBe('2026-12-09');
  });
});

describe('progres dan kelompok', () => {
  it('online = rata-rata peserta; offline = sesi selesai / jumlah sesi', () => {
    expect(progressOf(online({ avgProgress: 61.6 }))).toBe(62);
    expect(progressOf(offline({ sessionCount: 4, sessionsDone: 2 }))).toBe(50);
    expect(progressOf(offline({ status: 'done' }))).toBe(100);
  });
  it('mengelompokkan berjalan, akan datang, selesai, batal', () => {
    expect(groupOf(offline(), TODAY)).toBe('upcoming');
    expect(groupOf(offline({ startsOn: '2026-12-10' }), TODAY)).toBe('running');
    expect(groupOf(offline({ status: 'done' }), TODAY)).toBe('done');
    expect(groupOf(offline({ status: 'cancelled' }), TODAY)).toBe('cancelled');
    expect(groupOf(online(), TODAY)).toBe('running');
    expect(groupOf(online({ completed: 6 }), TODAY)).toBe('done'); // online tuntas sendiri
    expect(groupOf(online({ participants: 0, completed: 0 }), TODAY)).toBe('running');
  });
  it('online tuntas bila semua peserta selesai atau gagal; peserta gagal tidak membuat pelatihan menggantung', () => {
    expect(groupOf(online({ participants: 6, completed: 4, failed: 2 }), TODAY)).toBe('done');
    expect(groupOf(online({ participants: 6, completed: 4, failed: 1 }), TODAY)).toBe('running');
  });
});

describe('health', () => {
  it('late bila batas lewat dan belum selesai', () => {
    expect(health(online({ startsOn: '2026-11-01', endsOn: '2026-12-09' }), TODAY)).toBe('late');
    expect(health(offline({ startsOn: '2026-12-01', endsOn: '2026-12-01' }), TODAY)).toBe('late'); // offline belum ditutup HR
  });
  it('watch online bila tertinggal lebih dari 15 poin dari jadwal linear', () => {
    // 1 Des - 21 Des, hari ke-9 dari 20 = 45% diharapkan
    expect(health(online({ startsOn: '2026-12-01', endsOn: '2026-12-21', avgProgress: 29 }), TODAY)).toBe('watch');
    expect(health(online({ startsOn: '2026-12-01', endsOn: '2026-12-21', avgProgress: 31 }), TODAY)).toBe('ok');
  });
  it('online tanpa tanggal lengkap selalu ok', () => {
    expect(health(online({ avgProgress: 0 }), TODAY)).toBe('ok');
    expect(health(online({ endsOn: '2026-12-31', avgProgress: 0 }), TODAY)).toBe('ok');
  });
  it('watch offline bila mulai <= 7 hari lagi dan belum siap', () => {
    expect(health(offline({ assessmentMode: 'none' }), TODAY)).toBe('watch');
    expect(health(offline({ assessmentMode: 'none', startsOn: '2026-12-25', endsOn: '2026-12-25' }), TODAY)).toBe('ok');
    expect(health(offline(), TODAY)).toBe('ok');
  });
  it('selesai dan batal tidak pernah perlu perhatian', () => {
    expect(health(offline({ status: 'done', endsOn: '2026-11-01', startsOn: '2026-11-01' }), TODAY)).toBe('ok');
  });
});

describe('asesmen dan kelengkapan', () => {
  it('status asesmen mengikuti cara dan jumlah skor peserta yang hadir', () => {
    expect(assessmentStatus(offline({ assessmentMode: 'none' }))).toBe('none');
    expect(assessmentStatus(offline({ scored: 0 }))).toBe('manual_pending');
    expect(assessmentStatus(offline({ scored: 6 }))).toBe('manual');
    expect(assessmentStatus(offline({ attendanceRecorded: 6, present: 5, scored: 5, scoredPresent: 5 }))).toBe('manual'); // yang tidak hadir tidak ditunggu
    expect(assessmentStatus(offline({ assessmentMode: 'elitementor', scored: 2 }))).toBe('awaiting');
    expect(assessmentStatus(offline({ assessmentMode: 'elitementor', scored: 6 }))).toBe('synced');
  });
  it('kelengkapan: enam cek, dokumentasi tidak wajib', () => {
    const r = readiness(offline({ venue: '', materialsReady: false, materialDocs: 1, attendanceRecorded: 4, present: 3, assessmentMode: 'elitementor', photoDocs: 0 }));
    expect(r.map((c) => `${c.key}:${c.state}`)).toEqual(['schedule:missing', 'materials:complete', 'participants:complete', 'attendance:missing', 'assessment:waiting', 'documentation:missing']);
    expect(r[5].optional).toBe(true);
    expect(r[3]).toMatchObject({ recorded: 4, present: 3 });
  });
  it('cek ringkas tab Akan datang: asesmen siap bila caranya sudah dipilih', () => {
    expect(upcomingChecks(offline()).every((c) => c.ok)).toBe(true);
    expect(upcomingChecks(offline({ assessmentMode: 'none', participants: 0 })).filter((c) => !c.ok).map((c) => c.key)).toEqual(['participants', 'assessment']);
  });
});

describe('KPI dan insight', () => {
  const rows = [
    online({ id: 'a', startsOn: '2026-11-01', endsOn: '2026-12-09', completed: 3 }), // late
    online({ id: 'b', title: 'Incident Intake', inactive: 2, avgProgress: 80 }),    // ok tapi ada yang tidak aktif
    offline({ id: 'c', assessmentMode: 'none' }),                                   // upcoming, watch
    offline({ id: 'd', status: 'done' }),
  ].map((r) => decorate(r, TODAY));
  it('menghitung KPI ringkasan', () => {
    expect(kpis(rows, 9)).toEqual({ running: 2, online: 2, offline: 0, upcoming: 1, activeLearners: 9, avgProgress: 65, attention: 2 });
    expect(kpis([], 0)).toMatchObject({ running: 0, avgProgress: 0, attention: 0 });
  });
  it('membuat insight dan saran tindakan dari aturan', () => {
    const { insights, actions } = buildInsights(rows, TODAY);
    expect(insights.map((i) => i.key)).toEqual(['late:a', 'inactive:b', 'assessment:c']);
    expect(insights[0]).toMatchObject({ source: 'EliteMentor', detail: expect.stringMatching(/3 dari 6 peserta belum selesai. Batas 09\/12\/2026/) });
    expect(actions.map((a) => `${a.kind}:${a.trainingId}`)).toEqual(['remind:a', 'remind:b', 'open_training:c']);
  });
  it('tidak ada insight bila semua sesuai jadwal', () => {
    expect(buildInsights([decorate(online(), TODAY), decorate(offline(), TODAY)], TODAY)).toEqual({ insights: [], actions: [] });
  });
});

describe('normalizeEvent: waktu dan skor', () => {
  const base = { id: 'e', type: 'learning.progress', organizationId: 1, course: { ref: 'C' }, user: { email: 'a@b.c' }, status: 'in_progress' };
  it('menolak occurredAt kosong atau jauh di depan', () => {
    expect(normalizeEvent({ ...base, occurredAt: null }).error).toMatch(/occurredAt/);
    expect(normalizeEvent({ ...base, occurredAt: new Date(Date.now() + 3600e3).toISOString() }).error).toMatch(/occurredAt/);
    expect(normalizeEvent({ ...base, occurredAt: new Date().toISOString() }).event).toBeTruthy();
  });
  it('asesmen: setelah kehadiran dicatat, hanya skor peserta yang hadir yang dihitung', () => {
    const row = { assessmentMode: 'vendor_manual', participants: 3, attendanceRecorded: 1, present: 1, scored: 2, scoredPresent: 0 };
    expect(assessmentStatus(row)).toBe('manual_pending');
    expect(assessmentStatus({ ...row, scoredPresent: 1 })).toBe('manual');
  });
});

describe('normalizeEvent', () => {
  const ok = { id: 'evt-1', type: 'learning.progress', organizationId: 42, course: { ref: 'ST-B4', title: 'Ticket Life Cycle', programTier: 'basic', dueAt: '2026-12-15' }, user: { email: 'A@Klien.co.id' }, progressPct: 78, status: 'in_progress', occurredAt: '2026-11-18T03:00:00Z' };
  it('merapikan event yang valid', () => {
    const { event } = normalizeEvent(ok);
    expect(event).toMatchObject({ id: 'evt-1', type: 'learning.progress', organizationId: 42, course: { ref: 'ST-B4', dueAt: '2026-12-15', programTier: 'basic' }, user: { email: 'a@klien.co.id', elitementorUserId: null }, progressPct: 78, status: 'in_progress', score: null });
    expect(event.occurredAt.toISOString()).toBe('2026-11-18T03:00:00.000Z');
  });
  it('menolak payload yang tidak lengkap atau di luar rentang', () => {
    expect(normalizeEvent(null).error).toBeTruthy();
    expect(normalizeEvent({ ...ok, id: '' }).error).toMatch(/id/);
    expect(normalizeEvent({ ...ok, type: 'lain' }).error).toMatch(/type/);
    expect(normalizeEvent({ ...ok, organizationId: 'x' }).error).toMatch(/organizationId/);
    expect(normalizeEvent({ ...ok, course: {} }).error).toMatch(/course.ref/);
    expect(normalizeEvent({ ...ok, user: {} }).error).toMatch(/user/);
    expect(normalizeEvent({ ...ok, progressPct: 140 }).error).toMatch(/progressPct/);
    expect(normalizeEvent({ ...ok, status: 'x' }).error).toMatch(/status/);
    expect(normalizeEvent({ ...ok, occurredAt: 'kemarin' }).error).toMatch(/occurredAt/);
    expect(normalizeEvent({ ...ok, type: 'assessment.result' }).error).toMatch(/score/);
    expect(normalizeEvent({ ...ok, type: 'assessment.result', score: 88, status: undefined }).event.score).toBe(88);
  });
  it('id organisasi dan id pengguna EliteMentor harus bilangan bulat positif dalam rentang integer Postgres', () => {
    for (const organizationId of ['', null, true, 0, -3, 2147483648, 1.5]) expect(normalizeEvent({ ...ok, organizationId }).error).toMatch(/organizationId/);
    expect(normalizeEvent({ ...ok, organizationId: '42' }).event.organizationId).toBe(42);
    for (const elitementorUserId of ['', true, 0, 2147483648]) expect(normalizeEvent({ ...ok, user: { elitementorUserId } }).error).toMatch(/user/);
    expect(normalizeEvent({ ...ok, user: { email: 'a@b.c', elitementorUserId: 2147483648 } }).error).toMatch(/elitementorUserId/);
    expect(normalizeEvent({ ...ok, user: { elitementorUserId: '77' } }).event.user.elitementorUserId).toBe(77);
  });
});

describe('storage', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(16)]);
  const pdf = Buffer.from('%PDF-1.7\n............');
  it('mengenali tipe dari isi berkas, bukan dari nama', () => {
    expect(detectType(jpeg)).toMatchObject({ mime: 'image/jpeg', media: 'photo' });
    expect(detectType(png).mime).toBe('image/png');
    expect(detectType(mp4)).toMatchObject({ mime: 'video/mp4', media: 'video' });
    // HEIC memakai kotak ftyp yang sama tetapi bukan MP4
    expect(detectType(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(16)]))).toBeNull();
    expect(detectType(pdf).mime).toBe('application/pdf');
    expect(detectType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(detectType(Buffer.from('MZ'))).toBeNull();
  });
  it('PDF hanya untuk materi; foto dan video sesuai jenisnya', () => {
    expect(allowedFor('photo', detectType(jpeg))).toBe(true);
    expect(allowedFor('photo', detectType(mp4))).toBe(false);
    expect(allowedFor('video', detectType(mp4))).toBe(true);
    expect(allowedFor('photo', detectType(pdf))).toBe(false);
    expect(allowedFor('material', detectType(pdf))).toBe(true);
    expect(allowedFor('material', null)).toBe(false);
  });
  it('nama berkas dibersihkan dari path dan karakter berbahaya', () => {
    expect(safeFilename('../../etc/passwd')).toBe('passwd');
    expect(safeFilename('C:\\foto\\kelas "A".jpg')).toBe('kelas A.jpg');
    expect(safeFilename('a\r\nSet-Cookie: x.jpg')).toBe('aSet-Cookie x.jpg');
    expect(safeFilename('')).toBe('berkas');
  });
  it('adapter menolak kunci di luar pola tenant/uuid', async () => {
    const t = '11111111-1111-4111-8111-111111111111';
    const mem = memoryStorage();
    const key = newKey(t);
    await mem.put(key, jpeg);
    expect((await mem.get(key)).equals(jpeg)).toBe(true);
    await mem.remove(key);
    expect(await mem.get(key)).toBeNull();
    const disk = diskStorage(require('os').tmpdir());
    await expect(disk.put('../../etc/x', jpeg)).rejects.toThrow(/tidak valid/);
    await expect(disk.get(`${t}/../../../etc/passwd`)).rejects.toThrow(/tidak valid/);
    expect(await disk.get(newKey(t))).toBeNull();
    expect(createStorage({ dir: '' })).toBeNull();
  });
});
