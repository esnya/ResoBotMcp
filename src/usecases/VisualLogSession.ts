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
  pose?: { x: number; y: number; z: number; heading: number; pitch: number };
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

export type ToolEvent = {
  type: 'tool';
  t: number;
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  text?: string;
  image?: { dataUrl: string; mimeType: string } | undefined;
  structured?: unknown;
  error?: string;
  pose?: { x: number; y: number; z: number; heading: number; pitch: number };
};

export type AnyEvent = VisualEvent | ToolEvent;

/** Minimal, dependency-free HTML template generator */
function renderHtml(title: string, events: AnyEvent[]): string {
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
    main{padding:12px;display:grid;grid-template-columns:1fr 380px;gap:12px;align-items:start;min-height:calc(100vh - 56px)}
    #map,#timeline{min-width:0}
    #map{height:100%;}
    #timeline{overflow-y:auto; overflow-x:hidden; max-height:calc(100vh - 56px);}
    #timelineBody{overflow-x:hidden}
    ul{list-style:none;padding:0}
    li{padding:6px 8px;border-bottom:1px solid #9993;overflow-wrap:anywhere;word-break:break-word}
    canvas{max-width:100%;height:auto;border:1px solid #9994;border-radius:8px;background:linear-gradient(90deg,#0000 24%,#9992 25% 26%,#0000 27% 74%,#9992 75% 76%,#0000 77%),linear-gradient(#0000 24%,#9992 25% 26%,#0000 27% 74%,#9992 75% 76%,#0000 77%)}
    .meta{opacity:.7;font-size:.9em;overflow-wrap:anywhere;word-break:break-word;white-space:normal}
    .col h3{margin:6px 0 8px 0}
    img.tool-thumb{max-width:256px;max-height:256px;border-radius:6px;border:1px solid #9994;display:block}
  </style>
</head>
<body>
  <header>
    <div>
      <strong>${escapeHtml(title)}</strong>
      <div class="meta">Resonite coords: +Z forward, +X right, +Y up</div>
    </div>
  </header>
  <main>
    <section class="col" id="map">
      <canvas id="mapCanvas"></canvas>
    </section>
    <section class="col" id="timeline"><div id="timelineBody"></div></section>
  </main>
  <script id="visual-log-data" type="application/json">${json}</script>
  <script>
    const data = JSON.parse(document.getElementById('visual-log-data').textContent || '[]');
    const events = Array.isArray(data) ? data : [];
    const timelineBody = document.getElementById('timelineBody');
    const mapSection = document.getElementById('map');
    const canvas = document.getElementById('mapCanvas');

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
            + '<div class="meta">' + (ev.pose ? (poseLabel(ev.pose) + ' | ') : '') + time + '</div>';
        } else if(ev.type === 'tool'){
          if(ev.name === 'set_text') continue;
          const head = '<div><strong>tool</strong>: ' + escapeHtmlInline(ev.name) + '</div>';
          let body = '';
          if(ev.text){ body += '<div>' + escapeHtmlInline(ev.text) + '</div>'; }
          if(ev.image && ev.image.dataUrl){
            body += '<div><img class="tool-thumb" data-original="' + ev.image.dataUrl + '" alt="image" /></div>';
          }
          if(ev.structured){ body += '<div class="meta">' + escapeHtmlInline(JSON.stringify(ev.structured)) + '</div>'; }
          const status = ev.ok ? 'ok' : ('error: ' + escapeHtmlInline(ev.error || ''));
          const pose = (ev.pose ? (' | ' + poseLabel(ev.pose)) : '');
          li.innerHTML = head + body + '<div class="meta">' + status + ' | ' + time + pose + '</div>';
        } else if(ev.type === 'pose'){
          continue; // hide pose rows from timeline
        }
        ul.appendChild(li);
      }
      timelineBody.replaceChildren(ul);
      downscaleImages();
    }

    // Map (top-down X-Z)
    function renderMap(){
      const ctx = canvas.getContext('2d');
      const poses = events.filter(e=>e.type==='pose');
      if(!ctx){ return; }
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

      // heading arcs for all points (semi-transparent)
      const half = 20 * Math.PI/180; // ±20°
      const radius = 14; // px
      ctx.fillStyle = 'rgba(0,136,255,0.18)';
      poses.forEach((p)=>{
        const cx = p.x*scale + offsetX;
        const cz = p.z*scale + offsetZ;
        const ang = Math.atan2(-(Math.cos(p.heading * Math.PI/180)), Math.sin(p.heading * Math.PI/180));
        ctx.beginPath();
        ctx.moveTo(cx, canvas.height - cz);
        ctx.arc(cx, canvas.height - cz, radius, ang - half, ang + half);
        ctx.closePath();
        ctx.fill();
      });

      // origin axes (X/Z) if within bounds
      const ox = 0*scale + offsetX;
      const oz = 0*scale + offsetZ;
      if (ox >= 0 && ox <= canvas.width){
        ctx.strokeStyle = '#9996'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(ox, 0); ctx.lineTo(ox, canvas.height); ctx.stroke();
      }
      if (oz >= 0 && oz <= canvas.height){
        ctx.strokeStyle = '#9996'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(0, canvas.height - oz); ctx.lineTo(canvas.width, canvas.height - oz); ctx.stroke();
      }
      // axis labels near origin
      ctx.fillStyle = '#bbb'; ctx.font = '12px system-ui';
      if (ox >= 10 && ox <= canvas.width-10 && canvas.height - oz >= 10){
        ctx.fillText('O', ox + 4, canvas.height - oz - 4);
      }
      ctx.fillText('X →', Math.min(canvas.width - 40, Math.max(10, canvas.width - 60)), canvas.height - 10);
      ctx.save(); ctx.translate(10, 50); ctx.rotate(-Math.PI/2); ctx.fillText('Z →', 0, 0); ctx.restore();

      // head marker (latest)
      const latest = poses[poses.length - 1];
      const lx = latest.x*scale + offsetX;
      const lz = latest.z*scale + offsetZ;
      ctx.fillStyle = '#f50'; ctx.beginPath();
      ctx.arc(lx, canvas.height - lz, 4, 0, Math.PI*2); ctx.fill();
    }

    function fmt(n){ return (Math.round(n*100)/100).toFixed(2); }
    function heading360(deg){
      let h = Math.round(deg % 360);
      if(h < 0) h += 360;
      if(h === 0) h = 360;
      return h;
    }
    function poseLabel(p){
      const pos = '📍[' + fmt(p.x) + ',' + fmt(p.y) + ',' + fmt(p.z) + ']';
      const h = '🧭' + heading360(p.heading) + '°';
      const sign = p.pitch >= 0 ? '⤴' : '⤵';
      const ang = sign + Math.abs(Math.round(p.pitch)) + '°';
      return pos + ' ' + h + ' ' + ang;
    }
    function escapeHtmlInline(s){ return (s||'').replace(/[&<>]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;"})[c]); }
    async function downscaleDataUrl(dataUrl, maxDim=256, outType='image/jpeg', q=0.7){
      return new Promise((resolve)=>{
        const img = new Image();
        img.onload = ()=>{
          const scale = Math.min(1, maxDim/Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width*scale));
          const h = Math.max(1, Math.round(img.height*scale));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const cx = c.getContext('2d'); if(!cx){ resolve(dataUrl); return; }
          cx.imageSmoothingQuality = 'high';
          cx.drawImage(img, 0, 0, w, h);
          try{ resolve(c.toDataURL(outType, q)); } catch { resolve(dataUrl); }
        };
        img.onerror = ()=> resolve(dataUrl);
        img.src = dataUrl;
      });
    }
    async function downscaleImages(){
      const imgs = document.querySelectorAll('img.tool-thumb[data-original]');
      for(const img of imgs){
        const orig = img.getAttribute('data-original'); if(!orig) continue;
        const small = await downscaleDataUrl(orig, 256, 'image/jpeg', 0.7);
        img.setAttribute('src', small);
        img.removeAttribute('data-original');
      }
    }
    function resizeCanvas(){
      if(!mapSection) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = mapSection.getBoundingClientRect();
      const targetW = Math.max(300, Math.floor(rect.width));
      const headerH = document.querySelector('header')?.getBoundingClientRect().height || 0;
      const viewportH = window.innerHeight || document.documentElement.clientHeight || 800;
      const targetH = Math.max(240, Math.floor(viewportH - headerH - 24));
      canvas.style.width = targetW + 'px';
      canvas.style.height = targetH + 'px';
      canvas.width = Math.floor(targetW * dpr);
      canvas.height = Math.floor(targetH * dpr);
      const ctx = canvas.getContext('2d');
      if(ctx){ ctx.setTransform(dpr,0,0,dpr,0,0); }
    }
    function init(){ resizeCanvas(); renderTimeline(); renderMap(); }
    window.addEventListener('resize', ()=>{ resizeCanvas(); renderMap(); });
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
  private events: AnyEvent[] = [];
  private filePath: string | undefined;
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingText: { t: number; text: string } | undefined;
  private closed = false;
  private lastPose: { x: number; y: number; z: number; heading: number; pitch: number } | undefined;

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
    this.lastPose = { x: ev.x, y: ev.y, z: ev.z, heading: ev.heading, pitch: ev.pitch };
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

  recordTool(event: Omit<ToolEvent, 'type' | 't'> & { t?: number }): void {
    if (this.closed) return;
    const ts = typeof event.t === 'number' ? event.t : now();
    const ev: ToolEvent = {
      type: 'tool',
      t: ts,
      name: event.name,
      args: event.args,
      ok: event.ok,
      // optional fields added below
    } as unknown as ToolEvent;
    if (typeof event.text === 'string') (ev as unknown as { text?: string }).text = event.text;
    if (event.image)
      (ev as unknown as { image?: { dataUrl: string; mimeType: string } }).image = event.image;
    if ('structured' in event && event.structured !== undefined)
      (ev as unknown as { structured?: unknown }).structured = event.structured;
    if (typeof event.error === 'string') (ev as unknown as { error?: string }).error = event.error;
    if (this.lastPose)
      (
        ev as unknown as {
          pose?: { x: number; y: number; z: number; heading: number; pitch: number };
        }
      ).pose = {
        ...this.lastPose,
      };
    this.events.push(ev);
    this.scheduleFlush();
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
    const ev = { type: 'text', t, text } as unknown as TextEvent;
    if (this.lastPose)
      (
        ev as unknown as {
          pose?: { x: number; y: number; z: number; heading: number; pitch: number };
        }
      ).pose = {
        ...this.lastPose,
      };
    this.events.push(ev);
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
