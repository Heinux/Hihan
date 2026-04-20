export interface TimezoneSelectOptions {
  container: HTMLElement;
  currentTz: string;
  inputId: string;
  onChange: (tz: string) => void;
}

interface TzEntry {
  id: string;
  region: string;
  label: string;
}

const REGION_ORDER = ['system', 'UTC', 'Africa', 'America', 'Antarctica', 'Asia', 'Atlantic', 'Australia', 'Europe', 'Indian', 'Pacific'];

function getRegion(id: string): string {
  const slash = id.indexOf('/');
  return slash === -1 ? 'UTC' : id.slice(0, slash);
}

function formatOffset(id: string): string {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone: id });
    const diffMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
    const diffMin = Math.round(diffMs / 60000);
    const sign = diffMin >= 0 ? '+' : '\u2212';
    const absMin = Math.abs(diffMin);
    const h = Math.floor(absMin / 60);
    const m = absMin % 60;
    return m ? `UTC${sign}${h}:${String(m).padStart(2, '0')}` : `UTC${sign}${h}`;
  } catch {
    return '';
  }
}

function buildTimezoneList(): TzEntry[] {
  let ids: string[];
  try {
    ids = Intl.supportedValuesOf('timeZone');
    // UTC is not included in the IANA list, add it explicitly
    if (!ids.includes('UTC')) ids = ['UTC', ...ids];
  } catch {
    ids = COMMON_FALLBACK;
  }
  return ids.map(id => ({
    id,
    region: getRegion(id),
    label: id.includes('/') ? id.slice(id.indexOf('/') + 1).replace(/_/g, ' ') : id,
  }));
}

const COMMON_FALLBACK: string[] = [
  'UTC', 'Africa/Cairo', 'Africa/Lagos', 'Africa/Nairobi',
  'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Chicago',
  'America/Denver', 'America/Halifax', 'America/Lima', 'America/Los_Angeles',
  'America/Mexico_City', 'America/New_York', 'America/Sao_Paulo',
  'America/St_Johns', 'America/Toronto', 'Asia/Bangkok', 'Asia/Dhaka',
  'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Kolkata', 'Asia/Karachi',
  'Asia/Riyadh', 'Asia/Singapore', 'Asia/Tehran', 'Asia/Tokyo',
  'Atlantic/Azores', 'Australia/Adelaide', 'Australia/Sydney',
  'Europe/Athens', 'Europe/London', 'Europe/Moscow', 'Europe/Paris',
  'Pacific/Apia', 'Pacific/Gambier', 'Pacific/Honolulu',
  'Pacific/Marquesas', 'Pacific/Tahiti', 'Pacific/Auckland',
];

let cachedList: TzEntry[] | null = null;
function getTimezoneList(): TzEntry[] {
  if (!cachedList) cachedList = buildTimezoneList();
  return cachedList;
}

export function buildTimezoneSelect(opts: TimezoneSelectOptions): () => void {
  const { container, currentTz, inputId, onChange } = opts;
  const allTz = getTimezoneList();

  // ── DOM ──────────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.className = 'tz-combobox';

  const label = document.createElement('label');
  label.className = 'tz-combobox-label';
  label.textContent = 'Fuseau horaire';
  label.setAttribute('for', inputId);

  const input = document.createElement('input');
  input.type = 'text';
  input.id = inputId;
  input.className = 'tz-combobox-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = currentTz;

  const dropdown = document.createElement('div');
  dropdown.className = 'tz-combobox-dropdown';
  dropdown.addEventListener('mousedown', (e) => e.stopPropagation());
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  container.appendChild(wrapper);
  document.body.appendChild(dropdown);

  // ── State ────────────────────────────────────────────────────
  let open = false;
  let highlightIdx = -1;
  let filtered: (TzEntry & { offset: string })[] = [];
  let justSelected = false;

  // ── Position dropdown under input ─────────────────────────────
  function positionDropdown(): void {
    const rect = input.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;
    dropdown.style.width = `${rect.width}px`;
  }

  // ── System tz label ──────────────────────────────────────────
  function getSystemTz(): { id: string; offset: string } {
    const id = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return { id, offset: formatOffset(id) };
  }

  // ── Render dropdown ───────────────────────────────────────────
  function render(filter?: string): void {
    dropdown.innerHTML = '';
    const q = (filter ?? input.value).toLowerCase().trim();
    highlightIdx = -1;

    const system = getSystemTz();
    const entries: { id: string; label: string; offset: string; region: string; isSystem?: boolean }[] = [];

    // System entry always first
    entries.push({ id: system.id, label: `Système (${system.offset})`, offset: system.offset, region: 'system', isSystem: true });

    // Filtered entries
    filtered = allTz
      .filter(tz => !q || tz.id.toLowerCase().includes(q) || tz.label.toLowerCase().includes(q))
      .map(tz => ({ ...tz, offset: formatOffset(tz.id) }));

    // Group by region
    const grouped = new Map<string, typeof entries>();
    for (const e of entries) {
      const g = e.region;
      if (!grouped.has(g)) grouped.set(g, []);
      grouped.get(g)!.push(e);
    }
    for (const e of filtered) {
      const g = e.region;
      if (!grouped.has(g)) grouped.set(g, []);
      if (!grouped.get(g)!.some(x => x.id === e.id)) grouped.get(g)!.push(e);
    }

    const order = [...REGION_ORDER, ...[...grouped.keys()].filter(r => !REGION_ORDER.includes(r))];
    let idx = 0;

    for (const region of order) {
      const items = grouped.get(region);
      if (!items?.length) continue;

      if (region !== 'system') {
        const hdr = document.createElement('div');
        hdr.className = 'tz-combobox-group';
        hdr.textContent = region;
        dropdown.appendChild(hdr);
      }

      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'tz-combobox-item' + (item.id === currentTz ? ' active' : '');
        row.dataset.idx = String(idx);
        row.dataset.tz = item.id;
        row.innerHTML = `<span class="tz-combobox-name">${item.isSystem ? item.label : item.label.replace(/</g, '&lt;')}</span><span class="tz-combobox-offset">${item.offset}</span>`;
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          select(item.id);
        });
        row.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        dropdown.appendChild(row);
        idx++;
      }
    }
  }

  // ── Select a timezone ────────────────────────────────────────
  function select(id: string): void {
    justSelected = true;
    input.value = id;
    close();
    onChange(id);
  }

  // ── Open / Close ──────────────────────────────────────────────
  function openDropdown(): void {
    if (open) return;
    open = true;
    positionDropdown();
    dropdown.classList.add('visible');
    render();
  }

  function close(): void {
    open = false;
    highlightIdx = -1;
    dropdown.classList.remove('visible');
  }

  // ── Highlight navigation ──────────────────────────────────────
  function highlight(dir: 1 | -1): void {
    const items = dropdown.querySelectorAll('.tz-combobox-item');
    if (!items.length) return;
    highlightIdx += dir;
    if (highlightIdx < 0) highlightIdx = items.length - 1;
    if (highlightIdx >= items.length) highlightIdx = 0;
    items.forEach((el, i) => el.classList.toggle('highlight', i === highlightIdx));
    items[highlightIdx]?.scrollIntoView({ block: 'nearest' });
  }

  function selectHighlight(): void {
    if (highlightIdx < 0) return;
    const items = dropdown.querySelectorAll('.tz-combobox-item');
    const el = items[highlightIdx] as HTMLElement | undefined;
    if (el?.dataset.tz) select(el.dataset.tz);
  }

  // ── Event listeners ───────────────────────────────────────────
  const onInput = (): void => {
    openDropdown();
    render(input.value);
  };

  const onFocus = (): void => {
    openDropdown();
    input.select();
  };

  const onBlur = (): void => {
    setTimeout(() => {
      if (justSelected) return;
      close();
      const val = input.value;
      if (!allTz.some(tz => tz.id === val) && val !== getSystemTz().id) {
        input.value = currentTz;
      }
    }, 150);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); highlight(1); break;
      case 'ArrowUp': e.preventDefault(); highlight(-1); break;
      case 'Enter': e.preventDefault(); selectHighlight(); break;
      case 'Escape': close(); input.blur(); break;
    }
  };

  input.addEventListener('input', onInput);
  input.addEventListener('focus', onFocus);
  input.addEventListener('blur', onBlur);
  input.addEventListener('keydown', onKeyDown);

  // Close on outside click; absorb click if just selected from dropdown
  const onDocClick = (e: MouseEvent): void => {
    if (justSelected) {
      justSelected = false;
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    const t = e.target as Node;
    if (!wrapper.contains(t) && !dropdown.contains(t)) close();
  };
  document.addEventListener('click', onDocClick, true);

  return () => {
    input.removeEventListener('input', onInput);
    input.removeEventListener('focus', onFocus);
    input.removeEventListener('blur', onBlur);
    input.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('click', onDocClick, true);
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
  };
}