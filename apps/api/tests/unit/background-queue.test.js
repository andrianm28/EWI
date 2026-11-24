// Audit 24 Nov (8-11): antrean latar link email.
const { createBackgroundQueue } = require('../../src/core/background-queue');

describe('antrean latar', () => {
  it('pekerjaan dengan kunci sama berurutan, kunci berbeda boleh bersamaan', async () => {
    const q = createBackgroundQueue();
    const log = [];
    const job = (name, ms) => async () => { log.push(`mulai ${name}`); await new Promise((r) => { setTimeout(r, ms); }); log.push(`selesai ${name}`); };
    q.run('a', job('a1', 30));
    q.run('a', job('a2', 1));
    q.run('b', job('b1', 1));
    await q.drain();
    expect(log.indexOf('selesai a1')).toBeLessThan(log.indexOf('mulai a2'));
    expect(log.indexOf('selesai b1')).toBeLessThan(log.indexOf('selesai a1'));
  });

  it('galat diteruskan ke onError dengan kunci; penolakan bukan Error tidak menjatuhkan proses', async () => {
    const errors = [];
    const q = createBackgroundQueue({ onError: (e, key) => errors.push([key, e && e.message]) });
    q.run('x', async () => { throw new Error('gagal'); });
    q.run('y', () => Promise.reject(undefined));
    const crashing = createBackgroundQueue({ onError: () => { throw new Error('logger rusak'); } });
    crashing.run('z', async () => { throw new Error('gagal'); });
    await q.drain();
    await crashing.drain();
    expect(errors).toEqual([['x', 'gagal'], ['y', undefined]]);
  });

  it('drain menunggu pekerjaan yang ditambahkan selama menunggu', async () => {
    const q = createBackgroundQueue();
    let done = false;
    q.run('a', async () => { q.run('b', async () => { done = true; }); });
    await q.drain();
    expect(done).toBe(true);
  });
});
