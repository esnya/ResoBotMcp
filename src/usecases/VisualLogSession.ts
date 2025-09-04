import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { dedent, html, jsonForScript, raw } from './html.js';

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

/** Minimal HTML template generator (fixed defaults; no runtime toggles) */
function renderHtml(title: string, events: AnyEvent[]): string {
  const json = jsonForScript(events);
  const head = html`${raw('<!doctype html>')}
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        ${raw('<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>')}
        ${raw('<script src="https://cdn.jsdelivr.net/npm/d3-hexbin@0.2"></script>')}
        <style>
          ${dedent(`
    :root{color-scheme:light dark}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;margin:0;padding:0}
    header{padding:12px 16px;border-bottom:1px solid #9994;display:flex;justify-content:space-between;align-items:center}
    main{padding:12px;display:grid;grid-template-columns:1fr 380px;gap:12px;align-items:start;min-height:calc(100vh - 56px)}
    #map,#timeline{min-width:0}
    #map{position:relative;height:100%;}
    #timeline{overflow-y:auto; overflow-x:hidden; max-height:calc(100vh - 56px);}
    #timelineBody{overflow-x:hidden}
    ul{list-style:none;padding:0}
    li{padding:6px 8px;border-bottom:1px solid #9993;overflow-wrap:anywhere;word-break:break-word}
    canvas{max-width:100%;height:auto;border:1px solid #9994;border-radius:8px;background:linear-gradient(90deg,#0000 24%,#9992 25% 26%,#0000 27% 74%,#9992 75% 76%,#0000 77%),linear-gradient(#0000 24%,#9992 25% 26%,#0000 27% 74%,#9992 75% 76%,#0000 77%)}
    .meta{opacity:.7;font-size:.9em}
    .meta.wrap{overflow-wrap:anywhere;word-break:break-word;white-space:normal}
    .meta.footer{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .col h3{margin:6px 0 8px 0}
    img.tool-thumb{max-width:256px;max-height:256px;border-radius:6px;border:1px solid #9994;display:block}
    #mapTooltip{position:absolute;left:0;top:0;transform:translate(-9999px,-9999px);background:rgba(0,0,0,.75);color:#fff;padding:4px 6px;border-radius:6px;font-size:.9em;pointer-events:none;z-index:10;white-space:nowrap}
    li.highlight{background-color:#0366d622}
  `)}
        </style>
      </head>
    </html>`;

  const body = html`
<body>
  <header>
    <div>
      <strong>${title}</strong>
      <div class="meta">Resonite coords: +Z forward, +X right, +Y up</div>
    </div>
  </header>
  <main>
    <section class="col" id="map">
      <canvas id="mapCanvas"></canvas>
      <div id="mapTooltip"></div>
    </section>
    <section class="col" id="timeline"><div id="timelineBody"></div></section>
  </main>
  <script id="visual-log-data" type="application/json">${raw(json)}</script>
  <script>
    const data = JSON.parse(document.getElementById('visual-log-data').textContent || '[]');
    const events = Array.isArray(data) ? data : [];
    const timelineBody = document.getElementById('timelineBody');
    const timelineSection = document.getElementById('timeline');
    const mapSection = document.getElementById('map');
    const canvas = document.getElementById('mapCanvas');

    // Timeline (newest first)
    function renderTimeline(){
      const byTime = [...events].sort((a,b)=>b.t - a.t);
      const ul = document.createElement('ul');
      for(const ev of byTime){
        const li = document.createElement('li');
        if(ev.type === 'tool') li.id = 'ev-' + String(ev.t);
        const time = new Date(ev.t).toLocaleString();
        if(ev.type === 'text'){
          li.innerHTML = '<div><strong>💬 set_text</strong></div>'
            + '<div>' + escapeHtmlInline(ev.text) + '</div>'
            + '<div class="meta footer">' + (ev.pose ? (poseLabel(ev.pose) + ' | ') : '') + time + '</div>';
        } else if(ev.type === 'tool'){
          if(ev.name === 'set_text') continue;
          const head = '<div><strong>tool</strong>: ' + emojiForTool(ev.name) + ' ' + escapeHtmlInline(ev.name) + '</div>';
          let body = '';
          if(ev.text){ body += '<div>' + escapeHtmlInline(ev.text) + '</div>'; }
          if(ev.image && ev.image.dataUrl){
            body += '<div><img class="tool-thumb" loading="lazy" src="' + ev.image.dataUrl + '" alt="image" /></div>';
          }
          // Structured compact fields (top-level primitives only, quotes/braces omitted). Filter dataUrl/base64-like fields.
          if(ev.structured){
            const pairs = compactFields(ev.structured);
            if(pairs.length > 0){ body += '<div class="meta wrap">' + escapeHtmlInline(pairs.join(', ')) + '</div>'; }
          }
          // Error display (move from footer to body)
          if(!ev.ok){
            const msg = ev.error ? String(ev.error) : 'error';
            body = '<div class="meta wrap">error: ' + escapeHtmlInline(msg) + '</div>' + body;
          }
          const pose = (ev.pose ? (' | ' + poseLabel(ev.pose)) : '');
          li.innerHTML = head + body + '<div class="meta footer">' + time + pose + '</div>';
        } else if(ev.type === 'pose'){
          continue; // hide pose rows from timeline
        }
        ul.appendChild(li);
      }
      timelineBody.replaceChildren(ul);
    }

    // Map (top-down X-Z) — tool-anchored with zoom/pan and hexbin clustering
    const VIEW = { k: 1, tx: 0, ty: 0, baseScale: 1, offsetX: 0, offsetZ: 0 };
    const CONST = { pad: 1, anchorMinDistanceM: 0.05, anchorMinHeadingDeltaDeg: 5, clusterRadiusPx: 16 };
    let anchorPoints = [];
    let hoverIdx = -1;

    function getToolAnchors(){
      const tools = events.filter(e=>e.type==='tool' && e.pose);
      // Map to anchors with pose
      return tools.map(ev=>({
        x: ev.pose.x,
        z: ev.pose.z,
        heading: ev.pose.heading,
        name: ev.name,
        ok: !!ev.ok,
        t: ev.t
      }));
    }

    function fitViewToBounds(bounds){
      const w = (bounds.maxX - bounds.minX) || 1;
      const h = (bounds.maxZ - bounds.minZ) || 1;
      const scaleX = (canvas.width - 40) / (w + 2*CONST.pad);
      const scaleZ = (canvas.height - 40) / (h + 2*CONST.pad);
      VIEW.baseScale = Math.min(scaleX, scaleZ);
      VIEW.offsetX = 20 - (bounds.minX - CONST.pad) * VIEW.baseScale;
      VIEW.offsetZ = 20 - (bounds.minZ - CONST.pad) * VIEW.baseScale;
      VIEW.k = 1; VIEW.tx = 0; VIEW.ty = 0;
    }

    function computeBounds(anchors){
      if(anchors.length === 0){ return undefined; }
      let minX = anchors[0].x, maxX = anchors[0].x, minZ = anchors[0].z, maxZ = anchors[0].z;
      for(const a of anchors){
        if(a.x < minX) minX = a.x; if(a.x > maxX) maxX = a.x;
        if(a.z < minZ) minZ = a.z; if(a.z > maxZ) maxZ = a.z;
      }
      return { minX, maxX, minZ, maxZ };
    }

    function worldToPixel(x, z){
      const px = (x * VIEW.baseScale + VIEW.offsetX) * VIEW.k + VIEW.tx;
      const py = (canvas.height - (z * VIEW.baseScale + VIEW.offsetZ)) * VIEW.k + VIEW.ty;
      return [px, py];
    }

    function emojiForTool(name){
      const m = {
        set_text: '💬',
        capture_camera: '📷',
        set_arm_position: '🤖',
        arm_grab: '✊',
        arm_release: '✋',
        set_expression: '🙂',
        set_lamp: '💡',
        set_accent_hue: '🎨',
        ping: '🔁',
        wait_resonite: '🔌',
        get_arm_contact: '🧲',
        move_relative: '➡️',
        turn_relative: '🔄',
        get_pose: '📍',
        reset: '♻️',
      };
      return m[name] || '•';
    }

    function renderMap(){
      const ctx = canvas.getContext('2d');
      if(!ctx){ return; }
      ctx.clearRect(0,0,canvas.width,canvas.height);

      // anchors from tools
      const anchors = getToolAnchors();
      if(anchors.length === 0){ return; }
      const b = computeBounds(anchors); if(!b){ return; }
      if(VIEW.baseScale === 1 && VIEW.tx === 0 && VIEW.ty === 0 && VIEW.k === 1){
        fitViewToBounds(b);
      }

      // segments based on movement/heading thresholds
      const segs = [];
      let prev = undefined;
      for(const a of anchors){
        if(!prev){ prev = a; continue; }
        const dx = a.x - prev.x, dz = a.z - prev.z;
        const dist = Math.hypot(dx, dz);
        const hDelta = Math.abs(((a.heading - prev.heading + 540) % 360) - 180);
        if(dist >= CONST.anchorMinDistanceM || hDelta >= CONST.anchorMinHeadingDeltaDeg){
          segs.push([prev, a]);
        }
        prev = a;
      }

      // grid axes
      ctx.strokeStyle = '#9996'; ctx.lineWidth = 1;
      // X axis at Z=0
      const x0 = worldToPixel(b.minX, 0)[1];
      if(x0 >= 0 && x0 <= canvas.height){ ctx.beginPath(); ctx.moveTo(0, x0); ctx.lineTo(canvas.width, x0); ctx.stroke(); }
      // Z axis at X=0
      const z0 = worldToPixel(0, b.minZ)[0];
      if(z0 >= 0 && z0 <= canvas.width){ ctx.beginPath(); ctx.moveTo(z0, 0); ctx.lineTo(z0, canvas.height); ctx.stroke(); }

      // path
      ctx.lineWidth = 2; ctx.strokeStyle = '#08f';
      ctx.beginPath();
      for(const [p0,p1] of segs){
        const [x0,y0] = worldToPixel(p0.x, p0.z);
        const [x1,y1] = worldToPixel(p1.x, p1.z);
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      }
      ctx.stroke();

      // heading arcs behind markers (direction cues)
      const half = 20 * Math.PI/180; // ±20°
      const radius = 14; // px (screen space)
      ctx.fillStyle = 'rgba(0,136,255,0.18)';
      for(const a of anchors){
        const [cx, cy] = worldToPixel(a.x, a.z);
        const ang = Math.atan2(-(Math.cos(a.heading * Math.PI/180)), Math.sin(a.heading * Math.PI/180));
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, ang - half, ang + half);
        ctx.closePath();
        ctx.fill();
      }

      // clustering (hexbin in pixel space)
      const points = anchors.map(a=>{
        const [x,y] = worldToPixel(a.x, a.z);
        return [x,y,a];
      });
      // cache for interactions (screen space)
      anchorPoints = anchors.map(a=>{ const [x,y] = worldToPixel(a.x, a.z); return { x, y, t: a.t, name: a.name, ok: a.ok }; });
      const hex = d3.hexbin().radius(CONST.clusterRadiusPx).extent([[0,0],[canvas.width, canvas.height]]);
      // @ts-ignore
      const bins = hex(points);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '14px system-ui';
      for(const bin of bins){
        // @ts-ignore
        const bx = bin.x, by = bin.y, list = bin;
        const count = list.length;
        // choose emoji of first marker
        // @ts-ignore
        const first = list[0][2];
        const emoji = emojiForTool(first.name);
        // No filled background to keep plot visible. Use outline only for clusters.
        if(count > 1){
          ctx.strokeStyle = '#0366d6';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(bx, by, 10 + Math.min(4, count-1), 0, Math.PI*2); ctx.stroke();
        }
        const label = count > 1 ? (emoji + ' ' + String(count)) : emoji;
        // Halo for readability without solid background
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(label, bx, by);
        ctx.fillStyle = '#fff'; ctx.fillText(label, bx, by);
      }
    }

    function nearestAnchor(x, y){
      const r = 16; const r2 = r*r;
      let idx = -1, best = r2 + 1;
      for(let i=0;i<anchorPoints.length;i++){
        const p = anchorPoints[i]; const dx = x - p.x; const dy = y - p.y; const d2 = dx*dx + dy*dy;
        if(d2 < best){ best = d2; idx = i; }
      }
      return best <= r2 ? idx : -1;
    }

    function scrollToEventByTime(t){
      const el = document.getElementById('ev-' + String(t));
      if(!el) return;
      el.classList.add('highlight');
      setTimeout(()=> el.classList.remove('highlight'), 1200);
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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
    function isDataLikeString(k, v){
      if(typeof v !== 'string') return false;
      const key = String(k).toLowerCase();
      if(key.includes('dataurl') || key.includes('data_url') || key === 'data' || key.includes('base64')) return true;
      const s = v.trim();
      if(s.startsWith('data:')) return true;
      if(s.length > 256 && /base64/i.test(s)) return true;
      return false;
    }
    function compactFields(obj){
      if(!obj || typeof obj !== 'object') return [];
      const out = [];
      for(const [k,v] of Object.entries(obj)){
        if(isDataLikeString(k,v)) continue;
        if(typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'){
          out.push(k + ': ' + String(v));
        }
      }
      return out;
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
    function init(){
      resizeCanvas(); renderTimeline(); renderMap();
      if (typeof d3 !== 'undefined' && d3.zoom) {
        const zoom = d3.zoom().scaleExtent([0.25, 8]).on('zoom', (event)=>{
          const t = event.transform;
          VIEW.k = t.k; VIEW.tx = t.x; VIEW.ty = t.y; renderMap();
        });
        // @ts-ignore
        d3.select(canvas).call(zoom);
      } else {
        // minimal wheel/drag fallback
        let dragging = false; let lastX=0,lastY=0;
        canvas.addEventListener('wheel', (e)=>{ e.preventDefault(); const f = e.deltaY < 0 ? 1.1 : 0.9; VIEW.k = Math.min(8, Math.max(0.25, VIEW.k * f)); renderMap(); }, { passive: false });
        canvas.addEventListener('mousedown', (e)=>{ dragging = true; lastX=e.clientX; lastY=e.clientY; });
        window.addEventListener('mouseup', ()=>{ dragging=false; });
        window.addEventListener('mousemove', (e)=>{ if(!dragging) return; VIEW.tx += (e.clientX-lastX); VIEW.ty += (e.clientY-lastY); lastX=e.clientX; lastY=e.clientY; renderMap(); });
      }
      // Tooltip + anchor link
      const tooltip = document.getElementById('mapTooltip');
      canvas.addEventListener('mousemove', (e)=>{
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        hoverIdx = nearestAnchor(x, y);
        canvas.style.cursor = hoverIdx >= 0 ? 'pointer' : 'default';
        if(hoverIdx >= 0 && tooltip){
          const p = anchorPoints[hoverIdx];
          const text = emojiForTool(p.name) + ' ' + p.name + ' | ' + new Date(p.t).toLocaleString();
          tooltip.textContent = text;
          tooltip.style.transform = 'translate(' + (x + 12) + 'px,' + (y + 12) + 'px)';
        } else if(tooltip){
          tooltip.style.transform = 'translate(-9999px,-9999px)';
        }
      });
      canvas.addEventListener('mouseleave', ()=>{
        const tooltip = document.getElementById('mapTooltip');
        if(tooltip) tooltip.style.transform = 'translate(-9999px,-9999px)';
        hoverIdx = -1; canvas.style.cursor = 'default';
      });
      canvas.addEventListener('click', ()=>{
        if(hoverIdx >= 0){ const t = anchorPoints[hoverIdx].t; scrollToEventByTime(t); }
      });
    }
    window.addEventListener('resize', ()=>{ resizeCanvas(); renderMap(); });
    init();
  </script>
</body>
</html>`;
  return head + body;
}

// escapeHtml is provided by ./html as escapeHtmlSafe

export class VisualLogSession {
  private cfg: VisualLogConfig;
  private events: AnyEvent[] = [];
  private filePath: string | undefined;
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private currentText: TextEvent | undefined;
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
    // Prefix-overwrite stream: always overwrite the latest compatible text event.
    const ts = typeof t === 'number' ? t : now();
    let target = this.currentText;
    if (!target) {
      // Try to resume last committed text if prefix-compatible
      const last = this.findLastTextEvent();
      if (last && (text.startsWith(last.text) || last.text.startsWith(text))) {
        target = last;
      }
    }
    if (!target) {
      // Create new text event
      const ev = { type: 'text', t: ts, text } as TextEvent;
      if (this.lastPose)
        (
          ev as unknown as {
            pose?: { x: number; y: number; z: number; heading: number; pitch: number };
          }
        ).pose = { ...this.lastPose };
      this.events.push(ev);
      this.currentText = ev;
    } else {
      target.t = ts;
      target.text = text;
      if (this.lastPose)
        (
          target as unknown as {
            pose?: { x: number; y: number; z: number; heading: number; pitch: number };
          }
        ).pose = { ...this.lastPose };
      this.currentText = target;
    }
    this.scheduleFlush();
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

  // No debounce/timeout finalization; stream stays as last updated text.

  private async flush(): Promise<void> {
    if (!this.filePath) return; // not yet initialized
    const title = this.filePath.split(/[/\\]/).pop() || 'visual-log';
    const htmlStr = renderHtml(title, this.events);
    try {
      await fs.writeFile(this.filePath, htmlStr, 'utf8');
    } catch {
      void 0; // best-effort write; avoid impacting main flows
    }
  }

  private findLastTextEvent(): TextEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if ((e as { type?: string }).type === 'text') return e as TextEvent;
    }
    return undefined;
  }
}

// VisualTextCoalescer removed: behavior handled inline in VisualLogSession
