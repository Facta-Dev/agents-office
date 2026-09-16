// Flat renderer — the whole office scene on a plain Canvas2D, for machines where a WebGL
// context cannot exist (GPU disabled/blacklisted, driver keeps crashing). The three.js graph
// builds entirely on the CPU; the only thing that ever needed GL was THREE.WebGLRenderer —
// so this walks the SAME scene and paints it: project each mesh's vertices with the ortho
// camera, convex-hull it, painter-sort by view depth, fill. Flat colour, no lights/shadows:
// the low-detail office, wired into the same interactions the HUD already drives.
import * as THREE from 'three';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const dir = new THREE.Vector3();
const col = new THREE.Color();   // per-instance colour scratch
const tmp3 = new THREE.Vector3();
const MP = new THREE.Matrix4();  // projection · view, per frame
const F = new THREE.Matrix4();   // MP · object matrixWorld, per mesh

// monotone chain — pts is a flat [x,y,…] array, returns indices of the hull
function hull(pts, n) {
  const idx = [];
  for (let i = 0; i < n; i++) if (!Number.isNaN(pts[i * 2])) idx.push(i);
  idx.sort((a, b) => pts[a * 2] - pts[b * 2] || pts[a * 2 + 1] - pts[b * 2 + 1]);
  if (idx.length < 3) return idx;
  const cross = (o, a, b) =>
    (pts[a * 2] - pts[o * 2]) * (pts[b * 2 + 1] - pts[o * 2 + 1]) -
    (pts[a * 2 + 1] - pts[o * 2 + 1]) * (pts[b * 2] - pts[o * 2]);
  const lo = [], hi = [];
  for (const i of idx) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], i) <= 0) lo.pop();
    lo.push(i);
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], i) <= 0) hi.pop();
    hi.push(i);
  }
  return [...lo, ...hi.reverse().slice(1, -1)];
}

export function createFlatRenderer(oldCanvas) {
  const cv = document.createElement('canvas');
  cv.id = oldCanvas.id;
  cv.style.cssText = oldCanvas.style.cssText;
  oldCanvas.replaceWith(cv);
  const cx = cv.getContext('2d');
  let W = 0, H = 0, PR = 1;

  let projSig = '';               // a zoom/resize moves the combined matrix → caches die
let CAM = null;                 // render stamps its camera here each frame
  const cache = new Map();        // mesh → { sig: matrixWorld copy, poly: [x,y,…], depth }

  function setSize(w, h) { W = w; H = h; cv.width = Math.max(1, Math.round(w * PR)); cv.height = Math.max(1, Math.round(h * PR)); }

  function same(a, b) { for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false; return true; }

  function inkOf(mat) { // materials are shared and setDark re-inks some — refresh on change
    const c = mat.color, u = mat.userData;
    if (u._r !== c.r || u._g !== c.g || u._b !== c.b) {
      u._r = c.r; u._g = c.g; u._b = c.b;
      u._ink = 'rgb(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ')';
    }
    return u._ink;
  }

  // world → screen [x,y,…]; null if anything lands outside the frustum
  function project(geo, world) {
    F.multiplyMatrices(MP, world);
    const pos = geo.attributes.position;
    if (!pos) return null;
    const n = pos.count, pts = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(F);
      if (!Number.isFinite(tmp.x)) return null;
      pts[i * 2] = (tmp.x * 0.5 + 0.5) * cv.width;
      pts[i * 2 + 1] = (-tmp.y * 0.5 + 0.5) * cv.height;
    }
    return pts;
  }

  // along the view direction: larger = farther = painted earlier
  function depthOf(o) { tmp.setFromMatrixPosition(o.matrixWorld); return tmp.dot(dir); }

  // screen-space convex hull for a mesh, cached until its matrixWorld moves
  function meshPoly(m) {
    const me = m.matrixWorld.elements;
    const c = cache.get(m);
    if (c && same(c.sig, me)) return c;
    const raw = project(m.geometry, m.matrixWorld);
    if (!raw) { const e = { sig: me.slice(), poly: null, depth: depthOf(m) }; cache.set(m, e); return e; }
    const hi = hull(raw, raw.length / 2);
    const poly = new Float32Array(hi.length * 2);
    for (let i = 0; i < hi.length; i++) { poly[i * 2] = raw[hi[i] * 2]; poly[i * 2 + 1] = raw[hi[i] * 2 + 1]; }
    const e = { sig: me.slice(), poly, depth: depthOf(m) };
    cache.set(m, e);
    return e;
  }

  function offscreen(poly) {  // bbox vs rect: a hull big enough CONTAINS the viewport
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      if (poly[i] < x0) x0 = poly[i];
      if (poly[i] > x1) x1 = poly[i];
      if (poly[i + 1] < y0) y0 = poly[i + 1];
      if (poly[i + 1] > y1) y1 = poly[i + 1];
    }
    return x1 < -16 || x0 > cv.width + 16 || y1 < -16 || y0 > cv.height + 16;
  }

  function fillPoly(poly) {
    cx.beginPath();
    cx.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) cx.lineTo(poly[i], poly[i + 1]);
    cx.closePath();
    cx.fill();
    cx.stroke(); // same ink as the fill: seals the hairline seams between touching hulls
  }

  // pixels per world unit at the origin (ortho: constant across the scene)
  function pxPerUnit() {  // pixels per world unit along camera-right; a difference kills the pan offset
    tmp3.set(0, 0, 0).applyMatrix4(MP);
    const ox = tmp3.x;
    tmp3.setFromMatrixColumn(CAM.matrixWorld, 0).applyMatrix4(MP);
    return Math.abs(tmp3.x - ox) * cv.width / 2;
  }

  function paint(o) {
    const mat = o.material;
    if (!mat || mat.visible === false || mat.isShadowMaterial) return;
    cx.globalAlpha = mat.transparent ? mat.opacity ?? 1 : 1;
    if (o.isSprite) return paintSprite(o, mat);
    if (o.isLine || o.isLineSegments) return paintLine(o, mat);
    if (o.isInstancedMesh) return paintInstanced(o);
    if (mat.map) return paintTexture(o, mat);
    const ent = meshPoly(o);
    if (!ent || !ent.poly || ent.poly.length < 6 || offscreen(ent.poly)) return;
    cx.fillStyle = inkOf(mat);
    cx.strokeStyle = cx.fillStyle; cx.lineWidth = 1;
    fillPoly(ent.poly);
  }

  function paintTexture(o, mat) {
    const img = mat.map?.image;
    if (!img) return;
    const c = project(o.geometry, o.matrixWorld);
    if (!c) return;
    // PlaneGeometry walks top-left → top-right → bottom-left → bottom-right
    const [tlx, tly, trx, try_, blx, bly] = c;
    cx.save();
    cx.setTransform(trx - tlx, try_ - tly, blx - tlx, bly - tly, tlx, tly);
    cx.drawImage(img, 0, 0, img.width || 1, img.height || 1, 0, 0, 1, 1);
    cx.restore();
  }

  function paintSprite(o, mat) {
    const img = mat.map?.image;
    if (!img) return;
    tmp.setFromMatrixPosition(o.matrixWorld).applyMatrix4(MP);
    if (!Number.isFinite(tmp.x)) return;
    const px = pxPerUnit();
    const w = o.scale.x * px, h = o.scale.y * px;
    const sx = (tmp.x * 0.5 + 0.5) * cv.width, sy = (-tmp.y * 0.5 + 0.5) * cv.height;
    if (w < 1 || offscreen(Float32Array.of(sx - w - 4, sy - h - 4, sx + w + 4, sy + h + 4))); return;
    cx.save();
    cx.translate(sx, sy);
    if (mat.rotation) cx.rotate(mat.rotation);
    cx.drawImage(img, -w / 2, -h / 2, w, h);
    cx.restore();
  }

  function paintLine(o, mat) {
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    F.multiplyMatrices(MP, o.matrixWorld);
    const px = pxPerUnit();
    if (mat.isLineDashedMaterial) cx.setLineDash([(mat.dashSize ?? 1) * px, (mat.gapSize ?? 1) * px]);
    cx.strokeStyle = inkOf(mat);
    cx.lineWidth = 1.25;
    cx.beginPath();
    let open = false;
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(F);
      if (!Number.isFinite(tmp.x)) { if (open) { cx.stroke(); cx.beginPath(); open = false; } continue; }
      const x = (tmp.x * 0.5 + 0.5) * cv.width, y = (-tmp.y * 0.5 + 0.5) * cv.height;
      if (open && (o.isLine || i % 2 === 1)) cx.lineTo(x, y);
      else cx.moveTo(x, y);
      open = true;
      if (o.isLineSegments && i % 2 === 1) { cx.stroke(); cx.beginPath(); open = false; }
    }
    cx.stroke();
    cx.setLineDash([]);
  }

  function paintInstanced(o) {
    let c = cache.get(o);
    if (!c || c.ver !== o.instanceMatrix.version || (o.instanceColor && c.colVer !== o.instanceColor.version) || !same(c.sig, o.matrixWorld.elements)) {
      const pos = o.geometry.attributes.position, m = new THREE.Matrix4();
      const items = [];
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        m.premultiply(o.matrixWorld);
        F.multiplyMatrices(MP, m);
        const pts = new Float32Array(pos.count * 2);
        let bad = false;
        for (let j = 0; j < pos.count; j++) {
          tmp.fromBufferAttribute(pos, j).applyMatrix4(F);
          if (!Number.isFinite(tmp.x)) { bad = true; break; }
          pts[j * 2] = (tmp.x * 0.5 + 0.5) * cv.width;
          pts[j * 2 + 1] = (-tmp.y * 0.5 + 0.5) * cv.height;
        }
        if (bad) continue;
        const hi = hull(pts, pos.count);
        const poly = new Float32Array(hi.length * 2);
        for (let j = 0; j < hi.length; j++) { poly[j * 2] = pts[hi[j] * 2]; poly[j * 2 + 1] = pts[hi[j] * 2 + 1]; }
        let ink = inkOf(o.material);
        if (o.instanceColor) {
          col.fromBufferAttribute(o.instanceColor, i);
          ink = 'rgb(' + Math.round(col.r * 255) + ',' + Math.round(col.g * 255) + ',' + Math.round(col.b * 255) + ')';
        }
        items.push({ poly, ink, depth: tmp.setFromMatrixPosition(m).dot(dir) });
      }
      c = { ver: o.instanceMatrix.version, colVer: o.instanceColor ? o.instanceColor.version : 0, sig: o.matrixWorld.elements.slice(), items };
      items.sort((a, b) => b.depth - a.depth);  // instances overlap: far first
      cache.set(o, c);
    }
    for (const it of c.items) {
      if (!it.poly || it.poly.length < 6 || offscreen(it.poly)) continue;
      cx.fillStyle = it.ink;
      cx.strokeStyle = it.ink; cx.lineWidth = 1;
      fillPoly(it.poly);
    }
  }

  function walk(o, fn) {
    if (!o.visible) return;
    fn(o);
    for (const c of o.children) walk(c, fn);
  }

  return {
    domElement: cv,
    shadowMap: { enabled: false, type: 0 },
    setSize(w, h) { setSize(w, h); },
    setPixelRatio(p) { PR = p || 1; if (W) setSize(W, H); },
    render(scene, camera) {
      CAM = camera;
      scene.updateMatrixWorld();
      camera.updateMatrixWorld(); // also refreshes matrixWorldInverse
      MP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const e = MP.elements;
      const sig = e[0] + '|' + e[5] + '|' + e[10] + '|' + e[12] + '|' + e[13];
      if (sig !== projSig) { projSig = sig; cache.clear(); }
      camera.getWorldDirection(dir);
      cx.clearRect(0, 0, cv.width, cv.height);
      const draw = [];
      walk(scene, o => {
        if (!(o.isMesh || o.isInstancedMesh || o.isSprite || o.isLine || o.isLineSegments)) return;
        draw.push({ o, depth: depthOf(o) });
      });
      draw.sort((a, b) => b.depth - a.depth); // far first
      for (const { o } of draw) paint(o);
    },
  };
}