import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export type VisualLogConfig = {
  dir: string; // output directory (created if missing)
  flushMs: number; // debounce for disk writes
  textCoalesceMs: number; // coalesce successive set_text calls
};

export type PoseEvent = {
  type: 'pose';
  t: number; // epoch ms
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
};

export type TextEvent = {
  type: 'text';
  t: number; // epoch ms
  text: string;
};

export type VisualEvent = PoseEvent | TextEvent;

function now(): number {
  return Date.now();
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0');
}

function timestampBase(d: Date): string {
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1, 2);
  const dd = pad(d.getDate(), 2);
  const HH = pad(d.getHours(), 2);
  const mm = pad(d.getMinutes(), 2);
  const ss = pad(d.getSeconds(), 2);
  return `${yyyy}${MM}${dd}-${HH}${mm}${ss}`;
}

/** Minimal, dependency-free HTML template generator */
function renderHtml(title: string, events: VisualEvent[]): string {
  const json = JSON.stringify(events);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:light dark}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;margin:0;padding:0}
    header{padding:12px 16px;border-bottom:1px solid #9994;display:flex;justify-content:space-between;align-items:center}
    .tabs{display:flex;gap:8px}
    .tab{cursor:pointer;padding:6px 10px;border-radius:6px;border:1px solid #9994}
    .tab.active{background:#9992}
    main{padding:12px}
    #map{display:none}
    #timeline{display:none}
    ul{list-style:none;padding:0}
    li{padding:6px 8px;border-bottom:1px solid #9993}
    canvas{max-width:100%;height:auto;border:1px solid #9994;border-radius:8px;background:linear-gradient(90deg,#0000 24%,#9992 25% 26%,#0000 27% 74%,#9992 75% 76%,#0000 77%),linear-gradient(#0000 24%,#9992 25% 26%,#0000 27% 74%,#9992 75% 76%,#0000 77%)}
    .meta{opacity:.7;font-size:.9em}
  </style>
</head>
<body>
  <header>
    <div>
      <strong>${escapeHtml(title)}</strong>
      <div class="meta">Resonite coords: +Z forward, +X right, +Y up</div>
    </div>
    <nav class="tabs">
      <button class="tab" id="tab-timeline">Time</button>
      <button class="tab" id="tab-map">Position</button>
    </nav>
  </header>
  <main>
    <section id="timeline"></section>
    <section id="map">
      <canvas id="mapCanvas" width="960" height="540"></canvas>
      <div class="meta">Top-down view (X right, Z forward). Scale auto-fit.</div>
    </section>
  </main>
  <script id="visual-log-data" type="application/json">${json}</script>
  <script>
    const data = JSON.parse(document.getElementById('visual-log-data').textContent || '[]');
    const events = Array.isArray(data) ? data : [];

    const timelineEl = document.getElementById('timeline');
    const mapEl = document.getElementById('map');
    const tabTimeline = document.getElementById('tab-timeline');
    const tabMap = document.getElementById('tab-map');

    function show(which){
      const tActive = which === 'timeline';
      tabTimeline.classList.toggle('active', tActive);
      tabMap.classList.toggle('active', !tActive);
      timelineEl.style.display = tActive ? 'block' : 'none';
      mapEl.style.display = !tActive ? 'block' : 'none';
    }
    tabTimeline.onclick = ()=>show('timeline');
    tabMap.onclick = ()=>show('map');

    // Timeline (newest first)
    function renderTimeline(){
      const byTime = [...events].sort((a,b)=>b.t - a.t);
      const ul = document.createElement('ul');
      for(const ev of byTime){
        const li = document.createElement('li');
        const time = new Date(ev.t).toLocaleString();
        if(ev.type === 'text'){
          li.innerHTML = '<div><strong>set_text</strong></div>'
            + '<div>' + escapeHtmlInline(ev.text) + '</div>'
            + '<div class="meta">' + time + '</div>';
        } else if(ev.type === 'pose'){
          li.innerHTML = '<div><strong>pose</strong></div>'
            + '<div class="meta">'
            + 'x=' + fmt(ev.x) + ' y=' + fmt(ev.y) + ' z=' + fmt(ev.z) + ' h=' + fmt(ev.heading) + ' p=' + fmt(ev.pitch)
            + ' | ' + time + '</div>';
        }
        ul.appendChild(li);
      }
      timelineEl.replaceChildren(ul);
    }

    // Map (top-down X-Z, with simple auto scale and offset)
    function renderMap(){
      const canvas = document.getElementById('mapCanvas');
      const ctx = canvas.getContext('2d');
      const poses = events.filter(e=>e.type==='pose');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      if(poses.length < 1){ return; }
      const xs = poses.map(p=>p.x);
      const zs = poses.map(p=>p.z);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minZ = Math.min(...zs), maxZ = Math.max(...zs);
      const pad = 1; // meters
      const w = (maxX - minX) || 1;
      const h = (maxZ - minZ) || 1;
      const scaleX = (canvas.width - 40) / (w + 2*pad);
      const scaleZ = (canvas.height - 40) / (h + 2*pad);
      const scale = Math.min(scaleX, scaleZ);
      const offsetX = 20 - (minX - pad)*scale;
      const offsetZ = 20 - (minZ - pad)*scale;

      // path
      ctx.lineWidth = 2; ctx.strokeStyle = '#08f'; ctx.beginPath();
      poses.forEach((p,i)=>{
        const x = p.x*scale + offsetX;
        const z = p.z*scale + offsetZ;
        if(i===0) ctx.moveTo(x, canvas.height - z); else ctx.lineTo(x, canvas.height - z);
      });
      ctx.stroke();

      // head marker (latest)
      const latest = poses[poses.length - 1];
      const lx = latest.x*scale + offsetX;
      const lz = latest.z*scale + offsetZ;
      ctx.fillStyle = '#f50'; ctx.beginPath();
      ctx.arc(lx, canvas.height - lz, 4, 0, Math.PI*2); ctx.fill();

      // axes legend
      ctx.fillStyle = '#999'; ctx.font = '12px system-ui';
      ctx.fillText('+X →', canvas.width - 60, canvas.height - 10);
      ctx.save(); ctx.translate(10, 50); ctx.rotate(-Math.PI/2); ctx.fillText('+Z →', 0, 0); ctx.restore();
    }

    function fmt(n){ return (Math.round(n*100)/100).toFixed(2); }
    function escapeHtmlInline(s){ return (s||'').replace(/[&<>]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;"})[c]); }
    function init(){ renderTimeline(); renderMap(); show('timeline'); }
    init();
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
}

export class VisualLogSession {
  private cfg: VisualLogConfig;
  private events: VisualEvent[] = [];
  private filePath: string | undefined;
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingText: { t: number; text: string } | undefined;
  private closed = false;

  constructor(cfg: VisualLogConfig) {
    this.cfg = cfg;
  }

  async init(): Promise<void> {
    if (this.closed) return;
    const dir = this.cfg.dir;
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    const name = `session-${timestampBase(new Date())}.html`;
    this.filePath = join(dir, name);
    await this.flush();
  }

  recordPose(
    pose: { x: number; y: number; z: number; heading: number; pitch: number },
    t?: number,
  ): void {
    if (this.closed) return;
    const ts = typeof t === 'number' ? t : now();
    const ev: PoseEvent = {
      type: 'pose',
      t: ts,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      heading: pose.heading,
      pitch: pose.pitch,
    };
    this.events.push(ev);
    this.scheduleFlush();
  }

  recordText(text: string, t?: number): void {
    if (this.closed) return;
    // Coalesce rapid successive set_text calls (append mode)
    const p = this.pendingText;
    const ts = typeof t === 'number' ? t : now();
    if (!p) {
      this.pendingText = { t: ts, text };
    } else {
      this.pendingText = { t: ts, text: text }; // replace with latest text
    }
    this.scheduleTextFinalize();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.finalizeTextIfPending();
    await this.flush();
  }

  // --- internals ---
  private scheduleFlush(): void {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = undefined;
      this.flush().catch(() => {});
    }, this.cfg.flushMs);
  }

  private scheduleTextFinalize(): void {
    // finalize pending text slightly after last update
    setTimeout(() => {
      this.finalizeTextIfPending();
      this.scheduleFlush();
    }, this.cfg.textCoalesceMs);
  }

  private finalizeTextIfPending(): void {
    if (!this.pendingText) return;
    const { t, text } = this.pendingText;
    this.pendingText = undefined;
    this.events.push({ type: 'text', t, text });
  }

  private async flush(): Promise<void> {
    if (!this.filePath) return; // not yet initialized
    const title = this.filePath.split(/[/\\]/).pop() || 'visual-log';
    const html = renderHtml(title, this.events);
    try {
      await fs.writeFile(this.filePath, html, 'utf8');
    } catch {
      void 0; // best-effort write; avoid impacting main flows
    }
  }
}

export class VisualTextCoalescer {
  private pending: { t: number; text: string } | undefined;
  commit(): TextEvent[] {
    return [];
  }
  // Helper class intentionally trivial to keep tests focused on behavior within VisualLogSession
}
