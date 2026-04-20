import { precessJ2000ToDate } from '@/core/astronomy';
import { zoomLabelScale } from '@/core/constants';
import type { DSOGroup } from '@/data/dso-catalog';
import type { CanvasObject, GeoProjection } from '@/core/types';
import type { AppState } from '@/core/state';

export class DSOManager {
  #state: AppState;
  #dsoGroups: readonly DSOGroup[];
  #projection: GeoProjection;
  #normLon: (lon: number) => number;
  #groupState: Record<string, boolean>;
  #searchQuery: string;
  #highlight: string | null;
  #canvasObjects: CanvasObject[];
  // Per-frame precession cache — shared between drawPaths and draw
  #precessedT: number = NaN;
  #precessedMap: Map<string, { ra_deg: number; dec_deg: number }> = new Map();

  constructor(
    state: AppState,
    dsoGroups: readonly DSOGroup[],
    projection: GeoProjection,
    normLon: (lon: number) => number,
  ) {
    this.#state = state;
    this.#dsoGroups = dsoGroups;
    this.#projection = projection;
    this.#normLon = normLon;
    this.#groupState = dsoGroups.reduce((acc, g) => {
      acc[g.id] = true; 
      return acc;
    }, {} as Record<string, boolean>);
    this.#searchQuery = '';
    this.#highlight = null;
    this.#canvasObjects = [];
  }

  get groupState(): Record<string, boolean> { return this.#groupState; }
  get dsoGroups(): readonly DSOGroup[] { return this.#dsoGroups; }

  /** Compute precessed positions once per frame, shared between drawPaths and draw. */
  #ensurePrecessed(T: number): void {
    const tKey = Math.round(T * 1e8);
    if (tKey === this.#precessedT && this.#precessedMap.size > 0) return;
    this.#precessedT = tKey;
    this.#precessedMap.clear();
    for (const g of this.#dsoGroups) {
      for (const obj of g.objects) {
        const { ra_deg, dec_deg } = precessJ2000ToDate(obj.ra * 15, obj.dec, T);
        this.#precessedMap.set(obj.name, { ra_deg, dec_deg });
      }
    }
  }

  drawPaths(ctx: CanvasRenderingContext2D, gmst: number, T: number): void {
    this.#ensurePrecessed(T);
    this.#dsoGroups.forEach(g => {
      if (!this.#groupState[g.id] || !g.showPath) return;
      if (g.objects.length < 2) return;
      const sorted = [...g.objects].sort((a, b) => a.ra - b.ra);
      const pts = sorted.map(obj => {
        const p = this.#precessedMap.get(obj.name)!;
        const lon = this.#normLon((p.ra_deg / 15 - gmst) * 15);
        return [lon, p.dec_deg] as [number, number];
      });
      ctx.save();
      ctx.strokeStyle = g.color + '60';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      let first = true;
      for (const pt of pts) {
        const coords = this.#projection(pt);
        if (!coords) continue;
        if (first) { ctx.moveTo(coords[0], coords[1]); first = false; }
        else ctx.lineTo(coords[0], coords[1]);
      }
      const firstCoords = pts.length > 0 ? this.#projection(pts[0]) : null;
      if (firstCoords && !first) ctx.lineTo(firstCoords[0], firstCoords[1]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });
  }

  draw(ctx: CanvasRenderingContext2D, gmst: number, T: number): void {
    const showAny = this.#dsoGroups.some(g => this.#groupState[g.id]);
    if (!showAny) return;
    this.#ensurePrecessed(T);
    const vs = this.#state.viewScale ?? 1;
    const z = zoomLabelScale(this.#state.zoomK ?? 1);
    this.#canvasObjects.length = 0;

    this.#dsoGroups.forEach(g => {
      if (!this.#groupState[g.id]) return;
      g.objects.forEach(obj => {
        const p = this.#precessedMap.get(obj.name)!;
        const lon = this.#normLon((p.ra_deg / 15 - gmst) * 15);
        const coords = this.#projection([lon, p.dec_deg]);
        if (!coords) return;
        const [sx, sy] = coords;
        this.#canvasObjects.push({ obj, group: g, px: sx, py: sy });
        const isHL = this.#highlight === obj.name;
        const alpha = isHL ? 1.0 : 0.55;
        ctx.save();
        ctx.globalAlpha = alpha;
        const s = (isHL ? 4 : 2.5) * z;
        ctx.strokeStyle = g.color;
        ctx.lineWidth = (isHL ? 1.2 : 0.7) * z;
        if (isHL) {
          // Glow pass (wide, faint) replaces shadowBlur
          ctx.beginPath();
          ctx.moveTo(sx - s, sy); ctx.lineTo(sx + s, sy);
          ctx.moveTo(sx, sy - s); ctx.lineTo(sx, sy + s);
          ctx.strokeStyle = g.color + '30';
          ctx.lineWidth = 3 * vs * z;
          ctx.stroke();
          // Core pass
          ctx.strokeStyle = g.color;
          ctx.lineWidth = 1.2 * z;
        }
        ctx.beginPath();
        ctx.moveTo(sx - s, sy); ctx.lineTo(sx + s, sy);
        ctx.moveTo(sx, sy - s); ctx.lineTo(sx, sy + s);
        ctx.stroke();
        if (isHL) {
          ctx.beginPath();
          ctx.moveTo(sx, sy - 6 * z); ctx.lineTo(sx + 6 * z, sy);
          ctx.lineTo(sx, sy + 6 * z); ctx.lineTo(sx - 6 * z, sy); ctx.closePath();
          ctx.strokeStyle = g.color + 'cc'; ctx.lineWidth = 0.8 * z; ctx.stroke();
          ctx.font = `400 ${9 * z}px "DM Mono",monospace`;
          ctx.fillStyle = g.color;
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          // Glow pass for text (strokeText replaces shadowBlur)
          ctx.strokeStyle = g.color + '40';
          ctx.lineWidth = 2.5 * z;
          ctx.lineJoin = 'round';
          ctx.strokeText(obj.name, sx + 9 * z, sy);
          ctx.fillText(obj.name, sx + 9 * z, sy);
        }
        ctx.restore();
      });
    });
  }

  buildPanel(panelEl: HTMLElement): void {
    const mastersEl = panelEl.querySelector('#dsoMasters') || panelEl.querySelector('.dso-masters');
    if (mastersEl) {
      mastersEl.innerHTML = '';
      this.#dsoGroups.forEach(g => {
        const btn = document.createElement('button');
        btn.className = 'dso-master-btn' + (this.#groupState[g.id] ? ' on' : '');
        btn.dataset.gid = g.id;
        btn.style.borderColor = this.#groupState[g.id] ? g.color + '55' : '';
        btn.style.color = this.#groupState[g.id] ? g.color : '';
        btn.textContent = g.label;
        btn.title = g.label;
        btn.addEventListener('click', () => {
          this.#groupState[g.id] = !this.#groupState[g.id];
          btn.classList.toggle('on', this.#groupState[g.id]);
          btn.style.borderColor = this.#groupState[g.id] ? g.color + '55' : '';
          btn.style.color = this.#groupState[g.id] ? g.color : '';
          this.renderList();
          this.#state.needsRedraw = true;
        });
        mastersEl.appendChild(btn);
      });
    }

    const pathRow = panelEl.querySelector('#dsoPathToggles') || panelEl.querySelector('.dso-path-toggles');
    if (pathRow) {
      pathRow.innerHTML = '';
      this.#dsoGroups.forEach(g => {
        const btn = document.createElement('button');
        btn.className = 'dso-path-btn' + (g.showPath ? ' on' : '');
        btn.dataset.gid = g.id;
        btn.style.borderColor = g.showPath ? g.color + '55' : '';
        btn.style.color = g.showPath ? g.color : '';
        btn.textContent = '\u00B7\u00B7\u00B7 ' + g.label;
        btn.title = 'Afficher la trajectoire de ' + g.label;
        btn.addEventListener('click', () => {
          g.showPath = !g.showPath;
          btn.classList.toggle('on', !!g.showPath);
          btn.style.borderColor = g.showPath ? g.color + '55' : '';
          btn.style.color = g.showPath ? g.color : '';
          this.#state.needsRedraw = true;
        });
        pathRow.appendChild(btn);
      });
    }

    const searchEl = panelEl.querySelector('#dsoSearch') || panelEl.querySelector('.dso-search');
    if (searchEl) {
      searchEl.addEventListener('input', (e: Event) => {
        this.#searchQuery = (e.target as HTMLInputElement).value.toLowerCase().trim();
        this.renderList();
      });
    }

    this.renderList();
  }

  renderList(listEl?: HTMLElement | null): void {
    const el = listEl || document.getElementById('dsoList');
    if (!el) return;
    el.innerHTML = '';
    const q = this.#searchQuery;

    this.#dsoGroups.forEach(g => {
      const filtered = g.objects.filter(o => !q || o.name.toLowerCase().includes(q));
      if (!filtered.length) return;

      const header = document.createElement('div');
      header.className = 'dso-group-header';
      const isOn = this.#groupState[g.id];
      header.innerHTML =
        `<span class="dso-group-header-toggle" title="${isOn ? 'Masquer' : 'Afficher'} ce groupe" data-gid="${g.id}" style="color:${g.color}">` +
        `${isOn ? '\u25C9' : '\u25CB'}</span>` +
        `<span class="dso-header-dot" style="background:${g.color}88"></span>` +
        `<span class="dso-header-label">${g.label}</span>` +
        `<span class="dso-header-count">${filtered.length}</span>`;

      header.querySelector('.dso-group-header-toggle')?.addEventListener('click', (evt: Event) => {
        const gid = (evt.currentTarget as HTMLElement)?.dataset?.gid;
        if (!gid) return;
        this.#groupState[gid] = !this.#groupState[gid];
        const masterBtn = document.querySelector(`.dso-master-btn[data-gid="${gid}"]`) as HTMLElement | null;
        if (masterBtn) {
          masterBtn.classList.toggle('on', this.#groupState[gid]);
          const grp = this.#dsoGroups.find(x => x.id === gid);
          if (grp) {
            masterBtn.style.borderColor = this.#groupState[gid] ? grp.color + '55' : '';
            masterBtn.style.color = this.#groupState[gid] ? grp.color : '';
          }
        }
        this.renderList();
        this.#state.needsRedraw = true;
      });
      el.appendChild(header);

      filtered.forEach(obj => {
        const row = document.createElement('div');
        row.className = 'dso-row' + (this.#highlight === obj.name ? ' highlighted' : '');
        const raH = Math.floor(obj.ra);
        const raM = Math.floor((obj.ra - raH) * 60);
        const decSign = obj.dec >= 0 ? '+' : '';
        row.innerHTML =
          `<span class="dso-row-dot" style="background:${g.color}"></span>` +
          `<span class="dso-row-name" title="${obj.name}">${obj.name}</span>` +
          `<span class="dso-row-coords">${String(raH).padStart(2, '0')}h${String(raM).padStart(2, '0')} ${decSign}${obj.dec.toFixed(1)}\u00B0</span>`;
        row.addEventListener('click', () => {
          this.#highlight = this.#highlight === obj.name ? null : obj.name;
          this.renderList();
          this.#state.needsRedraw = true;
        });
        el.appendChild(row);
      });
    });
  }

  checkHover(mx: number, my: number): CanvasObject | null {
    const { W, H, panX, panY, zoomK } = this.#state;
    const wx = (mx - W / 2 - panX) / zoomK + W / 2;
    const wy = (my - H / 2 - panY) / zoomK + H / 2;
    let found: CanvasObject | null = null;
    for (const d of this.#canvasObjects) {
      if (Math.hypot(d.px - wx, d.py - wy) < 8) { found = d; break; }
    }
    return found;
  }
}
