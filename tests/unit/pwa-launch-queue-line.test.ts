// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
// @ts-expect-error PWA modules are plain JS; tests import them at runtime.
import { launchQueueParts, launchQueueHtml, queueActionFor, queueToggle, iconPause, iconPlay } from '../../src/pwa/utils/usage-bar.js';

describe('launch-queue line under the usage meter', () => {
  it('shows nothing before the daemon reports the queue, or while it just runs', () => {
    expect(launchQueueParts(null)).toBeNull();
    expect(launchQueueHtml(undefined)).toBe('');
    expect(launchQueueParts({ paused: false, parked: 0, reason: null, opensAt: null })).toBeNull();
    expect(launchQueueHtml({ paused: false, parked: 0, reason: null, opensAt: null })).toBe('');
  });

  it('says how many a budget hold keeps, why and when it opens, with Run all and no toggle', () => {
    const q = { paused: false, parked: 6, reason: 'Waiting — 7d on course for 140% by reset (60% used, 4d left)', opensAt: Date.now() + 4 * 3600_000 };
    const p = launchQueueParts(q);
    expect(p.head).toBe('Held · 6 waiting');
    expect(p.why).toMatch(/^7d on course for 140% by reset \(60% used, 4d left\) · opens in [34]h/);
    const html = launchQueueHtml(q);
    expect(html).toContain('data-queue-action="run-all"');
    expect(html).not.toContain('data-queue-action="pause"');
  });

  it('says it is paused, with Run all only while something waits', () => {
    expect(launchQueueParts({ paused: true, parked: 0, reason: null, opensAt: null })).toMatchObject({ state: 'paused', runAll: false });
    const p = launchQueueParts({ paused: true, parked: 2, reason: 'Job queue paused', opensAt: null });
    expect(p).toMatchObject({ head: 'Job queue paused', why: '2 waiting · nothing starts on its own', runAll: true });
  });

  it('carries the toggle only where asked (the mobile sheet), even while the queue just runs', () => {
    const html = launchQueueHtml({ paused: false, parked: 0, reason: null, opensAt: null }, { toggle: true });
    expect(html).toContain('data-queue-action="pause"');
    expect(html).toContain('<svg');
  });

  it('routes a click through the button\'s action attribute', () => {
    const host = document.createElement('div');
    host.innerHTML = launchQueueHtml({ paused: true, parked: 1, reason: 'Job queue paused', opensAt: null }, { toggle: true });
    expect(queueActionFor(host.querySelector('[data-queue-action="resume"] svg'))).toBe('resume');
    expect(queueActionFor(host.querySelector('.o-usage-queue-why'))).toBeNull();
  });
});

describe('queueToggle — the sidebar nav item', () => {
  it('is a pause icon while running and a play icon while paused, with the whole state as its title', () => {
    const running = queueToggle({ paused: false, parked: 0, reason: null, opensAt: null });
    expect(running).toMatchObject({ action: 'pause', label: 'Pause queue', paused: false, title: 'Job queue running — pause it' });
    expect(running.icon).toBe(iconPause());
    const paused = queueToggle({ paused: true, parked: 3, reason: 'Job queue paused', opensAt: null });
    expect(paused).toMatchObject({ action: 'resume', label: 'Resume queue', paused: true, title: 'Job queue paused · 3 waiting — resume it' });
    expect(paused.icon).toBe(iconPlay());
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
