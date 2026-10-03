import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// PWA theme (state/settings.js VALID_THEMES) → d2 theme id per mode. Every d2 light theme has a
// white background and d2 has only two dark ones, so this matches on the accent's hue, not on the
// background. 201's fills are saturated blue, so only the blue/cyan-accent themes take it; every
// other dark mode gets 200, whose grey-mauve sits quietly under any accent.
const D2_THEMES: Record<string, { light: number; dark: number }> = {
  halcyon: { light: 0, dark: 201 },     // Neutral Default
  almanac: { light: 100, dark: 200 },   // Vanilla Nitro Cola
  terminal: { light: 300, dark: 200 },  // Terminal — mono type over hue
  nordic: { light: 4, dark: 201 },      // Cool Classics
  ink: { light: 302, dark: 200 },       // Origami
  botanical: { light: 104, dark: 200 }, // Everglade Green
  plasma: { light: 102, dark: 200 },    // Shirley Temple
  atlas: { light: 105, dark: 200 },     // Buttered Toast
  library: { light: 103, dark: 200 },   // Earth Tones
};

// Unknown names fall back to halcyon, the default theme — the query string is the caller's.
export function d2ThemeFor(theme: string | null, mode: string | null): number {
  const t = D2_THEMES[theme ?? ''] ?? D2_THEMES.halcyon!;
  return mode === 'dark' ? t.dark : t.light;
}
const MAX_SOURCE = 20_000;
const CACHE_MAX = 50;

// The source is model-written and d2 runs on the daemon's host, so two d2 features are refused
// before it ever runs. An import (`x: @f`, `...@f`) reads a .d2 file from disk and `..` walks
// out of any cwd, so a diagram label could carry a local file into the PWA. An `icon:` is a URL
// d2 fetches at render time — a network request whose target the model picks. The empty cwd
// below is the second layer, not the first: it does nothing against `@../../`.
export function diagramRefusal(src: string): string | null {
  if (src.length > MAX_SOURCE) return `findings.diagram is ${src.length} characters; the cap is ${MAX_SOURCE}. Draw only the flow the change touches.`;
  if (/(?:^|[:{;[]|\.\.\.)\s*@/m.test(src)) return 'findings.diagram may not use d2 imports (`@file`, `...@file`): write the whole diagram inline.';
  if (/\bicon\s*:/.test(src)) return 'findings.diagram may not use `icon:` (d2 fetches it over the network): use a plain shape and a label.';
  return null;
}

let emptyCwd: string | undefined;
const cache = new Map<string, Promise<string>>();

// Throws on a refusal, a compile error (message is d2's own, line:col included), or a missing
// binary (`code === 'ENOENT'` — callers treat that as "no diagrams on this host", not a bad plan).
// `bg` replaces the theme's canvas colour (N7) so the diagram sits flush on the PWA card instead of
// on d2's white or near-black slab. It comes off a query string, so anything but `#rrggbb` is
// ignored. Appended rather than prepended: d2 merges a repeated `vars` map and the last one wins,
// so the model's own `theme-overrides` can't undo it, and its line numbers in errors stay put.
export function renderDiagram(src: string, themeId: number, bg?: string | null): Promise<string> {
  const refusal = diagramRefusal(src);
  if (refusal) return Promise.reject(new Error(refusal));
  if (bg && /^#[0-9a-f]{6}$/i.test(bg)) src += `\nvars: {d2-config: {theme-overrides: {N7: "${bg}"}}}\n`;
  const key = `${themeId}\0${src}`;
  const hit = cache.get(key);
  if (hit) return hit;
  emptyCwd ??= mkdtempSync(join(tmpdir(), 'outpost-d2-'));
  const p = new Promise<string>((resolve, reject) => {
    const child = execFile('d2', ['--layout', 'tala', '--theme', String(themeId), '--pad', '16', '--omit-version', '--no-xml-tag', '-', '-'],
      { cwd: emptyCwd, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (!err) return resolve(stdout);
        const msg = String(stderr).split('\n').find((l) => l.startsWith('err:'))?.replace(/^err:\s*/, '');
        reject(Object.assign(new Error(msg ?? err.message), { code: (err as NodeJS.ErrnoException).code }));
      });
    child.stdin?.end(src);
  });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return p;
}

// submit_plan's check: a diagram that won't compile is the model's to fix, so it comes back as the
// tool error. A host without d2 drops the diagram instead — planning must not hinge on an extra.
export async function checkPlanDiagram(findings: { diagram?: unknown } | undefined): Promise<void> {
  if (!findings || findings.diagram === undefined) return;
  if (typeof findings.diagram !== 'string' || !findings.diagram.trim()) { delete findings.diagram; return; }
  try {
    await renderDiagram(findings.diagram, d2ThemeFor(null, 'light'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('[plan-diagram] d2 is not installed; dropping findings.diagram (brew install d2)');
      delete findings.diagram;
      return;
    }
    throw new Error(`findings.diagram did not compile: ${(err as Error).message}. Fix the d2 source and submit the plan again.`);
  }
}
