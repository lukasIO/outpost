// @vitest-environment jsdom
import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { checkPlanDiagram, d2ThemeFor, diagramRefusal, renderDiagram } from '../../src/work/plan-diagram.js';

const hasD2 = (() => { try { execFileSync('d2', ['--version']); return true; } catch { return false; } })();

describe('diagramRefusal', () => {
  it('refuses every d2 import spelling, since `..` walks out of any cwd', () => {
    for (const src of ['x: @../secret', 'x:@f', '...@f', 'x: {...@f}', '@f', 'a -> b\n  @f']) {
      expect(diagramRefusal(src), src).toMatch(/imports/);
    }
  });

  it('refuses icons, which d2 fetches over the network', () => {
    expect(diagramRefusal('a: {icon: https://example.com/x.svg}')).toMatch(/icon/);
    expect(diagramRefusal('a.icon: https://example.com/x.svg')).toMatch(/icon/);
  });

  it('lets an @ inside ordinary label text through', () => {
    expect(diagramRefusal('a: "user@host"\nb: mail me @ noon\na -> b')).toBeNull();
  });

  it('caps the source length', () => {
    expect(diagramRefusal('a\n'.repeat(10_001))).toMatch(/cap/);
  });
});

describe('d2ThemeFor', () => {
  it('maps every PWA theme to its own light theme, so none silently falls back', async () => {
    // @ts-expect-error PWA modules are plain JS; tests import them at runtime.
    const { VALID_THEMES } = await import('../../src/pwa/state/settings.js');
    const ids = (VALID_THEMES as string[]).map((t) => d2ThemeFor(t, 'light'));
    expect(new Set(ids).size).toBe(ids.length);
    expect(d2ThemeFor('plasma', 'light')).toBe(102);
    expect(d2ThemeFor('plasma', 'dark')).toBe(200);
  });

  it('falls back to halcyon for an unknown theme or a missing mode', () => {
    expect(d2ThemeFor('nope', 'dark')).toBe(d2ThemeFor('halcyon', 'dark'));
    expect(d2ThemeFor(null, null)).toBe(d2ThemeFor('halcyon', 'light'));
  });
});

describe('checkPlanDiagram', () => {
  it('leaves findings without a diagram alone', async () => {
    const f: { findings: string; diagram?: unknown } = { findings: 'x' };
    await checkPlanDiagram(f);
    expect(f).toEqual({ findings: 'x' });
  });

  it('drops a blank diagram rather than storing it', async () => {
    const f: { diagram?: unknown } = { diagram: '  ' };
    await checkPlanDiagram(f);
    expect('diagram' in f).toBe(false);
  });

  it('rejects a refused source before d2 runs', async () => {
    await expect(checkPlanDiagram({ diagram: 'x: @../s' })).rejects.toThrow(/did not compile: .*imports/);
  });

  it.skipIf(!hasD2)('rejects a source that does not compile, carrying d2\'s line:col', async () => {
    await expect(checkPlanDiagram({ diagram: 'a -> b: {\n' })).rejects.toThrow(/did not compile: .*-:1:\d+/);
  });

  it.skipIf(!hasD2)('accepts a valid source and renders both modes', async () => {
    const f = { diagram: 'a -> b: submit_plan' };
    await checkPlanDiagram(f);
    expect(f.diagram).toBe('a -> b: submit_plan');
    const [light, dark] = await Promise.all([renderDiagram(f.diagram, d2ThemeFor('plasma', 'light')), renderDiagram(f.diagram, d2ThemeFor('plasma', 'dark'))]);
    expect(light).toMatch(/^<svg/);
    expect(light).not.toBe(dark);
  });

  it.skipIf(!hasD2)('paints the canvas in the given bg, over the model\'s own override, and ignores a malformed one', async () => {
    const src = 'vars: {d2-config: {theme-overrides: {N7: "#111111"}}}\na -> b';
    expect(await renderDiagram(src, 100, '#faf7ef')).toContain('.fill-N7{fill:#faf7ef;}');
    expect(await renderDiagram('a -> b', 100, 'red"}}}\nx: @../s')).toContain('.fill-N7{fill:#FFFFFF;}');
  });
});
