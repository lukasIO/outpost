// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
// @ts-expect-error PWA modules are plain JS; tests import them at runtime.
import { launchQueueParts, launchQueueHtml, queueActionFor } from '../../src/pwa/utils/usage-bar.js';

describe('launch-queue line under the usage meter', () => {
  it('shows nothing before the daemon reports the queue', () => {
    expect(launchQueueParts(null)).toBeNull();
    expect(launchQueueHtml(undefined)).toBe('');
  });

  it('offers Pause while running with nothing waiting', () => {
    const p = launchQueueParts({ paused: false, parked: 0, reason: null, opensAt: null });
    expect(p).toMatchObject({ state: 'running', head: 'Job queue running', why: null, actions: [['pause', 'Pause']] });
  });

  it('says how many a budget hold keeps, why, when it opens, and offers Run all and Pause', () => {
    const p = launchQueueParts({ paused: false, parked: 6, reason: 'Waiting — 7d on course for 140% by reset (60% used, 4d left)', opensAt: Date.now() + 4 * 3600_000 });
    expect(p.head).toBe('Held · 6 waiting');
    expect(p.why).toMatch(/^7d on course for 140% by reset \(60% used, 4d left\) · opens in [34]h/);
    expect(p.actions.map(([a]: string[]) => a)).toEqual(['run-all', 'pause']);
  });

  it('offers Resume when paused, and Run all only while something waits', () => {
    expect(launchQueueParts({ paused: true, parked: 0, reason: null, opensAt: null }).actions).toEqual([['resume', 'Resume']]);
    const p = launchQueueParts({ paused: true, parked: 2, reason: 'Job queue paused', opensAt: null });
    expect(p).toMatchObject({ state: 'paused', head: 'Job queue paused', why: '2 waiting · nothing starts on its own' });
    expect(p.actions.map(([a]: string[]) => a)).toEqual(['resume', 'run-all']);
  });

  it('routes a click through the button\'s action attribute', () => {
    const host = document.createElement('div');
    host.innerHTML = launchQueueHtml({ paused: true, parked: 1, reason: 'Job queue paused', opensAt: null });
    const resume = host.querySelector('[data-queue-action="resume"]')!;
    expect(queueActionFor(resume)).toBe('resume');
    expect(queueActionFor(host.querySelector('.o-usage-queue-why'))).toBeNull();
  });
});

// request() prefixes /api/work itself; a path that repeats it 404s (Run all shipped that way once).
describe('queue control requests', () => {
  it('hit the daemon\'s launch-queue routes', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => { urls.push(url); return new Response('{}', { status: 200 }); }) as never;
    // @ts-expect-error PWA modules are plain JS; tests import them at runtime.
    const { workApi } = await import('../../src/pwa/net/work.js');
    await workApi.runAllQueued();
    await workApi.pauseQueue();
    await workApi.resumeQueue();
    expect(urls).toEqual(['/api/work/launch-queue/run-all', '/api/work/launch-queue/pause', '/api/work/launch-queue/resume']);
  });
});
