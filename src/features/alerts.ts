import { sepAtJD, ternaryMinimum } from '@/core/astronomy';
import { ALERT_COOLDOWN_JD } from '@/core/constants';
import type { DSOObject } from '@/data/dso-catalog';
import type { Site } from '@/data/cities';
import type { AlertDeps } from '@/core/types';
import type { AppState } from '@/core/state';

export interface AlertEntry {
  dsoName: string;
  siteName: string;
  separation: string;
  dateStr: string;
  jd: number;
  group: string;
  groupColor: string;
}

interface AlertState {
  lastMinJD: number;
  lastMinSep: number;
}

interface DistributionResult {
  name: string;
  group: string;
  jd: number;
  sep: number;
  year: number;
}

export interface AlertChecker {
  readonly name: string;
  check(gmst: number, T: number, jd: number): AlertEntry[];
}

export class AlertSystem {
  #state: AppState;
  #siteMap: Record<string, Site>;
  #deps: AlertDeps;
  #alertState: Record<string, AlertState>;
  #alertLog: AlertEntry[];
  #prevJD: number | null;
  #checkers: AlertChecker[] = [];
  #cachedAlertPrecEl: HTMLInputElement | null | undefined;
  #cachedAlertSiteEl: HTMLSelectElement | null | undefined;

  constructor(state: AppState, siteMap: Record<string, Site>, deps: AlertDeps) {
    this.#state = state;
    this.#siteMap = siteMap;
    this.#deps = deps;
    this.#alertState = {};
    this.#alertLog = [];
    this.#prevJD = null;

    // Register the default DSO transit checker
    this.registerChecker({
      name: 'dso-transit',
      check: (gmst: number, T: number, _jd: number): AlertEntry[] => {
        return this.#checkDSOTransits(gmst, T);
      },
    });
  }

  registerChecker(checker: AlertChecker): void {
    this.#checkers.push(checker);
  }

  checkAlerts(gmst: number, T: number): void {
    if (!this.#state.isVisible('alertEnabled')) return;
    const jd = this.#state.getAstroJD();
    for (const checker of this.#checkers) {
      const entries = checker.check(gmst, T, jd);
      entries.forEach(e => {
        this.#alertLog.unshift(e);
        this.#showAlertCard(e);
      });
      if (entries.length > 0) this.#renderLogList();
    }
  }

  // Legacy entry point — delegates to checkAlerts
  checkTransitAlerts(gmst: number, T: number): void {
    this.checkAlerts(gmst, T);
  }

  #checkDSOTransits(_gmst: number, _T: number): AlertEntry[] {
    if (this.#cachedAlertPrecEl === undefined) this.#cachedAlertPrecEl = document.getElementById('alertPrecision') as HTMLInputElement | null;
    if (this.#cachedAlertSiteEl === undefined) this.#cachedAlertSiteEl = document.getElementById('alertSite') as HTMLSelectElement | null;
    const precision = parseFloat(this.#cachedAlertPrecEl?.value ?? '') || 0.5;
    const siteKey = this.#cachedAlertSiteEl?.value;
    if (!siteKey) return [];
    const site = this.#siteMap[siteKey];
    if (!site) return [];

    const jdNow = this.#state.getAstroJD();

    if (this.#prevJD === null) { this.#prevJD = jdNow; return []; }

    let jdA = this.#prevJD, jdB = jdNow;
    if (jdA === jdB) return [];
    if (jdA > jdB) { const tmp = jdA; jdA = jdB; jdB = tmp; }
    this.#prevJD = jdNow;

    const { jdToDateString, dsoGroups, dsoGroupState } = this.#deps;
    const entries: AlertEntry[] = [];

    try {
      dsoGroups.forEach(g => {
        if (!dsoGroupState[g.id]) return;
        g.objects.forEach(obj => {
          const key = `${siteKey}:${obj.name}`;

          const sepA = sepAtJD(obj, site.lon, site.lat, jdA);
          const sepB = sepAtJD(obj, site.lon, site.lat, jdB);
          const sepMid = sepAtJD(obj, site.lon, site.lat, (jdA + jdB) / 2);
          const quickMin = Math.min(sepA, sepB, sepMid);

          const intervalDeg = Math.abs(jdB - jdA) * 361;
          if (quickMin - intervalDeg > precision) return;

          const { jdMin, sepMin } = ternaryMinimum(obj, site.lon, site.lat, jdA, jdB, 56);

          if (sepMin > precision) return;

          const cooldown = ALERT_COOLDOWN_JD;
          const st = this.#alertState[key];
          if (st && Math.abs(jdMin - st.lastMinJD) < cooldown) return;

          this.#alertState[key] = { lastMinJD: jdMin, lastMinSep: sepMin };

          const dateStr = jdToDateString(jdMin);
          entries.push({
            dsoName: obj.name,
            siteName: site.name,
            separation: sepMin.toFixed(6),
            dateStr,
            jd: jdMin,
            group: g.label,
            groupColor: g.color,
          });
        });
      });
    } catch (e) {
      console.warn('[alerts] checkDSOTransits error', e);
    }

    return entries;
  }

  #showAlertCard(entry: AlertEntry): void {
    const panel = document.getElementById('alertPanel');
    if (!panel) return;
    const card = document.createElement('div');
    card.className = 'alert-card';
    card.innerHTML = `
      <div class="alert-icon">\u2726</div>
      <div class="alert-body">
        <div class="alert-title">Rencontre \u2014 ${entry.dsoName}</div>
        <div class="alert-detail">
          \u00C0 ${entry.separation}\u00B0 du z\u00E9nith de ${entry.siteName}<br>
          ${entry.dateStr}
        </div>
      </div>
      <span class="alert-close">\u2715</span>
    `;
    card.querySelector('.alert-close')?.addEventListener('click', () => card.remove());
    panel.insertBefore(card, panel.firstChild);
    setTimeout(() => { if (card.parentNode) card.remove(); }, 12000);
    while (panel.children.length > 5) panel.lastChild?.remove();
  }

#renderLogList(logListEl?: HTMLElement | null, onJump?: (jd: number) => void): void {
  const el = logListEl || document.getElementById('logList');
  if (!el) return;
  if (this.#alertLog.length === 0) {
    el.innerHTML = '<div class="log-empty">Aucune rencontre enregistrée</div>';
    return;
  }
  el.innerHTML = this.#alertLog.map((e, i) => `
    <div class="log-entry">
      <div class="log-entry-title">✦ ${e.dsoName} <span class="log-entry-group" style="color:${e.groupColor || '#aaa'}">${e.group || ''}</span></div>
      <div class="log-entry-detail">
        Séparation : <b class="log-sep-value">${e.separation}°</b> · Zénith de <b>${e.siteName}</b><br>
        Date : ${e.dateStr}<br>
        <a class="log-jump" data-idx="${i}">→ Revenir à ce moment</a>
      </div>
    </div>
  `).join('');

  if (onJump) {
    el.querySelectorAll<HTMLElement>('.log-jump').forEach(link => {
      link.addEventListener('click', () => {
        const idx = parseInt(link.dataset.idx ?? '', 10);
        const entry = this.#alertLog[idx];
        if (entry) onJump(entry.jd);
      });
    });
  }
}

renderLogList(logListEl?: HTMLElement | null, onJump?: (jd: number) => void): void {
  this.#renderLogList(logListEl, onJump);
}

  exportCSV(): void {
    const rows = ['Objet,Groupe,Site,S\u00E9paration (\u00B0),Date UTC,JD'];
    this.#alertLog.forEach(e => {
      rows.push(`"${e.dsoName}","${e.group}","${e.siteName}",${e.separation},"${e.dateStr}",${e.jd.toFixed(5)}`);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rencontres_celestes.csv';
    a.click();
  }

  clearLog(): void {
    this.#alertLog = [];
    this.#alertState = {};
    this.#prevJD = null;
  }

  // ── Run long-range distribution (Giza analysis) ─────────────────
  runFullDistribution(): void {
    const SITE_LON = 31.1343;
    const SITE_LAT = 29.9792;
    const PRECISION = 5.0;
    const COARSE_STEP = 180;
    const COOLDOWN = 300;

    const JD_START = 2451545.0 + (-25000 - 2000) * 365.25;
    const JD_END = 2451545.0 + (2100 - 2000) * 365.25;

    const { dsoGroups } = this.#deps;

    const results: DistributionResult[] = [];
    const lastMin: Record<string, number> = {};
    const prevData: Record<string, { sep: number | null; jd: number | null }> = {};

    const allObjects: { obj: DSOObject; group: string }[] = [];
    dsoGroups.forEach(g => g.objects.forEach(obj => {
      allObjects.push({ obj, group: g.label });
      prevData[obj.name] = { sep: null, jd: null };
    }));

    const totalObj = allObjects.length;
    const CHUNK = 500;
    let jd = JD_START;

    function processChunk(): void {
      const jdEnd = Math.min(jd + CHUNK * COARSE_STEP, JD_END);

      while (jd <= jdEnd) {
        allObjects.forEach(({ obj, group }) => {
          const key = obj.name;
          const sep = sepAtJD(obj, SITE_LON, SITE_LAT, jd);
          const prev = prevData[key];

          if (prev.sep !== null && prev.jd !== null && sep > prev.sep) {
            const { jdMin, sepMin } = ternaryMinimum(
              obj, SITE_LON, SITE_LAT, prev.jd, jd
            );
            if (sepMin <= PRECISION) {
              const last = lastMin[key] ?? -1e9;
              if (jdMin - last > COOLDOWN) {
                lastMin[key] = jdMin;
                const year = 2000 + (jdMin - 2451545.0) / 365.25;
                results.push({
                  name: obj.name,
                  group,
                  jd: +jdMin.toFixed(2),
                  sep: +sepMin.toFixed(6),
                  year: +year.toFixed(1),
                });
              }
            }
          }
          prevData[key] = { sep, jd };
        });
        jd += COARSE_STEP;
      }

      if (jd <= JD_END) {
        setTimeout(processChunk, 0);
      } else {
        finalize();
      }
    }

    function finalize(): void {
      results.sort((a, b) => a.jd - b.jd);

      const allSeps = results.map(r => r.sep);
      const mean = allSeps.reduce((s, v) => s + v, 0) / allSeps.length;
      const stdDev = Math.sqrt(allSeps.reduce((s, v) => s + (v - mean) ** 2, 0) / allSeps.length);

      let minSep = Infinity, maxSep = -Infinity;
      allSeps.forEach(v => { if (v < minSep) minSep = v; if (v > maxSep) maxSep = v; });

      const and7 = results
        .filter(r => r.name.includes('Androm\u00E8de VII'))
        .map(r => ({
          ...r,
          yearStr: r.year < 0
            ? `-${Math.abs(r.year).toFixed(0)}`
            : `${r.year.toFixed(0)} apr. J.-C.`,
          zScore: +((mean - r.sep) / stdDev).toFixed(3),
        }));

      const report = {
        meta: { totalObjects: totalObj, totalPassages: results.length },
        globalStats: {
          mean: +mean.toFixed(6),
          stdDev: +stdDev.toFixed(6),
          min: +minSep.toFixed(6),
          max: +maxSep.toFixed(6),
        },
        andVII: {
          count: and7.length,
          expectedPct: +(100 / totalObj).toFixed(2),
          actualPct: +(and7.length * 100 / results.length).toFixed(2),
          freqRatio: +((and7.length / results.length) * totalObj).toFixed(3),
          passages: and7,
        },
        allPassages: results,
      };

      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: 'distribution_gizeh.json',
      });
      a.click();
    }

    setTimeout(processChunk, 0);
  }
}
