// Shared account-usage bar math + popover markup — the desktop sidebar-foot
// widget (shell/sidebar.js) and the mobile header's compact usage widget both
// need the same tier thresholds and the same popover content, just mounted into
// different chrome (popover vs. bottom sheet). D3: thresholds unify on 70/90.

import { fmtResetAt } from './formatting.js';

export const WARN_PCT = 70;
export const HOT_PCT = 90;

export function usageTier(pct) {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return null;
  if (pct >= HOT_PCT) return 'hot';
  if (pct >= WARN_PCT) return 'warn';
  return 'ok';
}

export function clampPct(pct) {
  return Math.min(100, Math.max(0, pct));
}

export function fmtUsd(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `$${n.toFixed(2)}`;
}

export function fmtDurationMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' :
    '&#39;'
  ));
}

function windowBlockHtml(label, win) {
  const pct = win?.used_percentage;
  const hasPct = typeof pct === 'number' && Number.isFinite(pct);
  const clamped = hasPct ? clampPct(pct) : 0;
  const tier = hasPct ? usageTier(clamped) : 'ok';
  return `
    <div class="o-usage-pop-block">
      <div class="o-usage-pop-row">
        <span class="o-usage-pop-k">${escapeHtml(label)}</span>
        <span class="o-usage-pop-v">${hasPct ? `${Math.round(clamped)}% used · ${escapeHtml(fmtResetAt(win.resets_at))}` : 'no data yet'}</span>
      </div>
      <div class="o-usage-pop-bar"><span class="o-usage-pop-fill${tier === 'ok' ? '' : ` ${tier}`}" style="width:${clamped}%"></span></div>
    </div>`;
}

function breakdownHtml(breakdown) {
  if (!breakdown) return '';
  const rows = (breakdown.perModel ?? [])
    .map((m) => `<span>${escapeHtml(m.model)}</span><span class="val">${fmtUsd(m.costUsd)}</span>`)
    .join('');
  const burn = typeof breakdown.burnRatePerHour === 'number' ? `${fmtUsd(breakdown.burnRatePerHour)}/h` : '—';
  const runway = fmtDurationMs(breakdown.estimatedRunwayMs) ?? '—';
  return `
    <div class="o-usage-pop-block">
      <div class="o-usage-pop-meta">
        <span>Burn rate: ${burn}</span>
        <span>Est. runway: ${runway}</span>
      </div>
      ${rows ? `<div class="o-usage-pop-breakdown">${rows}</div>` : ''}
    </div>`;
}

// Shared between the desktop sidebar-foot popover and the mobile header's usage
// sheet — same content, different container chrome around it.
// The job launch queue. Its pause/resume is a control of its own (queueToggle): a sidebar nav
// item on desktop, a button in the mobile usage sheet. The line under the meter carries only
// what a hold means — how many wait, why, when it opens, and Run all — so it shows only while
// the queue is held by the budget or busy slots, or paused. Null when there is nothing to say,
// including before the daemon has reported the queue at all.
export function launchQueueParts(q) {
  if (!q) return null;
  const waiting = q.parked ? `${q.parked} waiting` : null;
  if (q.paused) {
    return {
      state: 'paused', head: 'Job queue paused',
      why: waiting ? `${waiting} · nothing starts on its own` : 'Nothing starts on its own',
      runAll: !!q.parked,
    };
  }
  if (!q.parked) return null;
  const why = String(q.reason ?? '').replace(/^Waiting — /, '');
  return {
    state: 'held', head: `Held · ${waiting}`,
    why: q.opensAt ? `${why} · opens ${fmtResetAt(q.opensAt / 1000)}` : why,
    runAll: true,
  };
}

// Same stroke style as the sidebar's own icons (shell/sidebar.js svg()), so the toggle sits in
// that nav as one of them.
function icon(path) {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
export const iconPause = () => icon('<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>');
export const iconPlay = () => icon('<path d="M8 5.5v13l10.5-6.5z"/>');

// What the pause/resume control shows: pause while running, play while paused. `title` is the
// whole state in one line, for the collapsed sidebar where only the icon is left.
export function queueToggle(q) {
  const paused = !!q?.paused;
  const waiting = q?.parked ? ` · ${q.parked} waiting` : '';
  return paused
    ? { action: 'resume', label: 'Resume queue', icon: iconPlay(), paused, title: `Job queue paused${waiting} — resume it` }
    : { action: 'pause', label: 'Pause queue', icon: iconPause(), paused, title: `Job queue running${waiting} — pause it` };
}

export function launchQueueHtml(q, { toggle = false } = {}) {
  const p = launchQueueParts(q);
  const t = toggle && q ? queueToggle(q) : null;
  if (!p && !t) return '';
  const buttons = [
    ...(t ? [`<button type="button" class="o-usage-queue-run" data-queue-action="${t.action}" aria-label="${t.label}">${t.icon}<span>${t.paused ? 'Resume' : 'Pause'}</span></button>`] : []),
    ...(p?.runAll ? ['<button type="button" class="o-usage-queue-run" data-queue-action="run-all">Run all</button>'] : []),
  ].join('');
  return `
    <div class="o-usage-queue" data-state="${p?.state ?? 'running'}">
      <div class="o-usage-queue-head"><span>${escapeHtml(p?.head ?? 'Job queue running')}</span><span class="o-usage-queue-actions">${buttons}</span></div>
      ${p?.why ? `<div class="o-usage-queue-why">${escapeHtml(p.why)}</div>` : ''}
    </div>`;
}

// The action a click inside the queue line asked for, if any — every host (sidebar, popover,
// mobile sheet) delegates through this so the markup's attribute lives in one file.
export function queueActionFor(target) {
  return target?.closest?.('[data-queue-action]')?.dataset.queueAction ?? null;
}

export function usagePopoverHtml(au, queue, { queueToggle: withToggle = false } = {}) {
  return `
    <div class="o-usage-pop-hdr"><h4>Account usage</h4></div>
    ${launchQueueHtml(queue, { toggle: withToggle })}
    ${windowBlockHtml('5-hour window', au?.five_hour)}
    ${windowBlockHtml('Weekly window', au?.seven_day)}
    ${breakdownHtml(au?.breakdown)}
  `;
}
