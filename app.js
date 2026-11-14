/* Proveedores Tecno Riv — app instalable conectada a Supabase (tecnoriv-bot) */
'use strict';

/* Clave pública de Supabase (es pública por diseño: los datos los protege el login y las reglas de la base) */
const SUPABASE_URL = 'https://wecwgwhlczspysldlwbb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlY3dnd2hsY3pzcHlzbGRsd2JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjQxMjIsImV4cCI6MjA5NzMwMDEyMn0.bLLCCG01PGlqw72gtMDJ9kwyvUE0LlTUKmF7016j0bs';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const s = String(v ?? '').trim(); if (!s) return null; const n = Number(s.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : null; };
const money = (n) => n == null || !isFinite(n) ? '—' : '$' + Math.round(n).toLocaleString('es-AR');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const hoy = () => new Date().toLocaleDateString('sv-SE');
let toastT;
function toast(msg) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
}
async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast('Copiado'); }
  catch (e) { toast('No se pudo copiar automáticamente'); }
}
async function compartirOCopiar(texto) {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ text: texto }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  copiar(texto);
}
function dosPasos(btn, accion) {
  if (btn.classList.contains('armed')) { accion(); return; }
  const txt = btn.textContent; btn.classList.add('armed'); btn.textContent = '¿Seguro? Tocá de nuevo';
  setTimeout(() => { btn.classList.remove('armed'); btn.textContent = txt; }, 3500);
}

/* ---------- estado ---------- */
const S = { prov: [], ofe: [], ped: [], gan: [], cat: [], cart: [], tab: 'resumen', editProv: null, abierto: null, buscar: '', cant: 5, importe: null, ganBusca: {}, confGestion: null, user: null, modoLogin: 'entrar' };
try { S.cart = JSON.parse(localStorage.getItem('tr-prov-cart') || '[]') || []; } catch (e) { S.cart = []; }
try { S.sel = JSON.parse(localStorage.getItem('tr-prov-sel') || '[]') || []; } catch (e) { S.sel = []; }
const guardarSel = () => { try { localStorage.setItem('tr-prov-sel', JSON.stringify(S.sel)); } catch (e) {} };

/* Secciones: agrupa productos parecidos aunque no sean el mismo modelo (todos los smartwatch, todos los parlantes...).
   El orden importa: los accesorios van antes que el producto principal ("malla para smartwatch" es Mallas, no Smartwatch). */
const SECCIONES = [
  ['Mallas y correas', /malla|correa|pulsera para|strap/i],
  ['Fundas y protectores', /funda|\bcase\b|templado|hidrogel|hydrogel|protector|film/i],
  ['Smartwatch', /smart ?watch|reloj|watch|smart ?band|banda inteligente/i],
  ['Auriculares de vincha', /headphone|vincha|over.?ear|on.?ear|headset|orejas de gato|\bp47\b/i],
  ['Auriculares inalámbricos', /auricular|earbud|\btws\b|airpod|in.?ear|\bbuds\b|\bi\d{1,2}\b/i],
  ['Parlantes', /parlante|speaker|barra de sonido|soundbar/i],
  ['Power banks', /power ?bank|bater[ií]a (externa|port[aá]til)/i],
  ['Cargadores', /cargador|cabezal|fuente de|magsafe|carga inal[aá]mbrica/i],
  ['Cables y adaptadores', /cable|adaptador|lightning|tipo.?c|micro.?usb|\busb\b|\bhub\b|\botg\b/i],
  ['Soportes y fotografía', /soporte|holder|tr[ií]pode|selfie|aro de luz|ring.?light|gimbal|estabilizador/i],
  ['Gamer y computación', /mouse|teclado|joystick|gamepad|consola|gamer|monitor|webcam|notebook|tablet/i],
  ['Memorias', /pendrive|memoria|micro ?sd|tarjeta sd/i],
  ['Micrófonos y cámaras', /micr[oó]fono|c[aá]mara|lavalier/i],
];
const seccionDe = (nombre, categoria) => { const t = `${nombre} ${categoria || ''}`; return (SECCIONES.find(([, re]) => re.test(t)) || ['Otros'])[0]; };
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const guardarCart = () => { try { localStorage.setItem('tr-prov-cart', JSON.stringify(S.cart)); } catch (e) {} };

const provById = (id) => S.prov.find(p => p.id === id);
const catByName = (n) => S.cat.find(c => norm(c.nombre) === norm(n));
const refDe = (o) => o.ref || o.nombre;

/* Confianza 0-100: reseñas 40, envío 20, factura 10, garantía/cambios 10, antigüedad 10, compras previas 10 */
function confianza(p) {
  const d = [];
  const pts = Number(p.resena_puntaje), cant = Number(p.resena_cant) || 0;
  let r;
  if (pts > 0) { const conf = Math.min(1, cant / 100); r = (pts / 5) * 40 * conf + 16 * (1 - conf); d.push(`Reseñas ${pts}/5 (${cant}): ${Math.round(r)}/40`); }
  else { r = 12; d.push('Sin reseñas cargadas: 12/40'); }
  const dias = Number(p.dias_max || p.dias_min) || null;
  const e = dias == null ? 8 : dias <= 3 ? 20 : dias <= 7 ? 14 : dias <= 15 ? 8 : 3;
  d.push(dias == null ? 'Demora sin cargar: 8/20' : `Llega en hasta ${dias} días: ${e}/20`);
  const f = p.factura ? 10 : 0; d.push(`Factura: ${f}/10`);
  const g = p.garantia ? 10 : 0; d.push(`Garantía o cambios: ${g}/10`);
  const a = Math.min(10, (Number(p.anios) || 0) * 2); d.push(`Antigüedad ${Number(p.anios) || 0} años: ${a}/10`);
  const c = p.compre ? 10 : 0; d.push(`Ya le compraste y salió bien: ${c}/10`);
  return { total: Math.round(r + e + f + g + a + c), detalle: d };
}
function nivel(t) { return t >= 75 ? { cls: 'ok', txt: 'Confiable', col: 'var(--ok)' } : t >= 50 ? { cls: 'warn', txt: 'Revisar', col: 'var(--warn)' } : { cls: 'bad', txt: 'Riesgoso', col: 'var(--red)' }; }
function trustHTML(p) {
  const c = confianza(p), n = nivel(c.total);
  return `<span class="trust" title="${esc(c.detalle.join('\n'))}"><span class="meter"><i style="width:${c.total}%;background:${n.col}"></i></span><b>${c.total}</b><span class="chip ${n.cls}">${n.txt}</span></span>`;
}
const diasDe = (p) => p ? (Number(p.dias_max || p.dias_min) || null) : null;
const diasTxt = (p) => !p || (!p.dias_min && !p.dias_max) ? '—' : p.dias_min && p.dias_max && p.dias_min != p.dias_max ? `${p.dias_min}–${p.dias_max} d` : `${p.dias_max || p.dias_min} d`;
const puesto = (o, cant) => { const p = provById(o.proveedor_id); return Number(o.precio) + (Number(p?.envio_costo) || 0) / Math.max(1, cant); };

function ranking(ofertas, cant) {
  const rows = ofertas.map(o => { const p = provById(o.proveedor_id); return { o, p, cp: puesto(o, cant), dias: diasDe(p) || 10, conf: p ? confianza(p).total : 0 }; });
  const minCp = Math.min(...rows.map(r => r.cp)), minD = Math.min(...rows.map(r => r.dias));
  rows.forEach(r => { r.score = 0.45 * (minCp / r.cp) + 0.2 * (minD / r.dias) + 0.35 * (r.conf / 100); });
  return rows.sort((a, b) => b.score - a.score);
}
function grupos() {
  const m = new Map();
  for (const o of S.ofe) { if (!provById(o.proveedor_id)) continue; const k = norm(refDe(o)); if (!m.has(k)) m.set(k, { ref: refDe(o), ofertas: [] }); m.get(k).ofertas.push(o); }
  return [...m.values()];
}

/* ---------- datos (Supabase) ---------- */
async function cargar() {
  const [cat, prov, ofe, ped, gan] = await Promise.all([
    sb.from('productos').select('id, nombre, categoria, precio, costo, stock, costo_actualizado').eq('activo', true).order('categoria').order('nombre'),
    sb.from('prov_proveedores').select('*').order('nombre'),
    sb.from('prov_ofertas').select('*'),
    sb.from('prov_pedidos').select('*').order('fecha', { ascending: false }),
    sb.from('prov_ganadores').select('*').order('fecha', { ascending: false }),
  ]);
  const err = [cat, prov, ofe, ped, gan].find(r => r.error);
  if (err) { aviso(`<span>No se pudieron leer los datos: ${esc(err.error.message)}</span><button type="button" data-act="recargar">Reintentar</button>`, 'warn'); return; }
  const n = (v) => v == null ? null : Number(v);
  S.cat = cat.data.map(c => ({ ...c, precio: n(c.precio), costo: n(c.costo), stock: n(c.stock) }));
  S.prov = prov.data; S.ofe = ofe.data.map(o => ({ ...o, precio: n(o.precio) })); S.ped = ped.data; S.gan = gan.data;
  S.cart = S.cart.filter(c => S.ofe.some(o => o.id === c.ofertaId)); guardarCart();
  if (!S.cat.length && !S.prov.length) aviso('<span>Tu cuenta entró, pero no tiene acceso a los datos de Tecno Riv. Si recién creaste la cuenta, confirmá el email y volvé a entrar.</span>', 'warn');
  else aviso('');
  render();
}
async function guardar(tabla, id, data) {
  const q = id ? sb.from(tabla).update(data).eq('id', id).select('id').single() : sb.from(tabla).insert(data).select('id').single();
  const { data: r, error } = await q;
  if (error) { toast('No se pudo guardar: ' + error.message); return null; }
  return r.id;
}
async function borrar(tabla, id) { const { error } = await sb.from(tabla).delete().eq('id', id); if (error) toast('No se pudo borrar'); }

/* ---------- Claude (función en Supabase) ---------- */
async function ia(body) {
  const { data, error } = await sb.functions.invoke('proveedores-ia', { body });
  if (error) {
    let msg = 'No se pudo completar. Probá de nuevo.';
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch (e) { if (!navigator.onLine) msg = 'No hay conexión a internet.'; }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/* ---------- navegación ---------- */
const TABS = ['resumen', 'proveedores', 'comparar', 'secciones', 'ganadores', 'pedido'];
function irA(tab) {
  S.tab = TABS.includes(tab) ? tab : 'resumen';
  for (const t of TABS) $('#v-' + t).hidden = t !== S.tab;
  document.querySelectorAll('nav.tabs a').forEach(a => { if (a.dataset.tab === S.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  render();
}
window.addEventListener('hashchange', () => irA(location.hash.slice(1)));

function render() {
  if (!S.user) return;
  $('#nProv').textContent = S.prov.length; $('#nOfe').textContent = S.ofe.length; $('#nCart').textContent = S.cart.reduce((a, c) => a + (Number(c.cant) || 0), 0);
  S.sel = S.sel.filter(id => S.ofe.some(o => o.id === id) || !S.ofe.length);
  $('#nSel').textContent = S.sel.length; $('#nSel').hidden = !S.sel.length;
  const v = { resumen: renderResumen, proveedores: renderProv, comparar: renderComparar, secciones: renderSecciones, ganadores: renderGanadores, pedido: renderPedido }[S.tab];
  const el = $('#v-' + S.tab);
  const act = document.activeElement, foco = act?.id, sel = foco && act.selectionStart;
  el.innerHTML = v();
  if (foco) { const f = document.getElementById(foco); if (f && f !== act) { f.focus(); try { if (sel != null) f.setSelectionRange(sel, sel); } catch (e) {} } }
}
function aviso(html, cls) { const e = $('#estado'); e.className = 'banner ' + (cls || 'info'); e.innerHTML = html; e.hidden = !html; }

/* ---------- vistas ---------- */
function renderResumen() {
  const gs = grupos();
  const abiertos = S.ped.filter(p => p.estado === 'borrador' || p.estado === 'enviado').length;
  const filas = S.cat.map(c => {
    const g = gs.find(g => norm(g.ref) === norm(c.nombre));
    if (!g) return { c, mejor: null };
    const best = ranking(g.ofertas, S.cant)[0];
    return { c, mejor: best, dif: c.costo != null ? c.costo - best.cp : null };
  });
  const ahorro = filas.filter(f => f.dif > 0).reduce((a, f) => a + f.dif * Math.max(1, S.cant), 0);
  const conOferta = filas.filter(f => f.mejor).sort((a, b) => (b.dif ?? -1e9) - (a.dif ?? -1e9));
  const sinOferta = filas.filter(f => !f.mejor);
  const top = [...S.prov].sort((a, b) => confianza(b).total - confianza(a).total).slice(0, 5);
  return `
    <div class="kpis">
      <div><b>${S.prov.length}</b><span>proveedores cargados</span></div>
      <div><b>${S.ofe.length}</b><span>precios de productos</span></div>
      <div><b>${conOferta.length}/${S.cat.length}</b><span>productos de Gestión con proveedor comparado</span></div>
      <div><b>${money(ahorro)}</b><span>ahorro posible comprando ${S.cant} de cada uno</span></div>
      <div><b>${abiertos}</b><span>pedidos en borrador o enviados</span></div>
    </div>
    <div class="stack">
      <div class="row between"><h2>Dónde comprar tu catálogo</h2>
        <label class="f" style="flex-direction:row;align-items:center;gap:8px">Unidades por producto <input id="cantRes" class="qty" type="number" min="1" value="${S.cant}"></label></div>
      <p class="sub">Tu costo actual en Gestión contra la mejor opción de tus proveedores. La mejor opción pesa precio puesto (45%), confianza (35%) y demora (20%). El precio puesto suma el envío repartido entre las unidades.</p>
      ${conOferta.length ? `<div class="scroll"><table>
        <thead><tr><th>Producto</th><th class="num">Tu costo</th><th class="num">Mejor puesto</th><th>Proveedor</th><th class="num">Diferencia</th><th class="num">Margen</th><th></th></tr></thead>
        <tbody>${conOferta.map(f => {
          const m = f.c.precio ? (f.c.precio - f.mejor.cp) / f.c.precio : null;
          return `<tr><td><b>${esc(f.c.nombre)}</b><div class="small muted">Stock ${f.c.stock ?? '—'} · vendés a ${money(f.c.precio)}</div></td>
          <td class="num">${money(f.c.costo)}</td><td class="num"><b>${money(f.mejor.cp)}</b></td>
          <td>${esc(f.mejor.p.nombre)}<div class="small muted">${diasTxt(f.mejor.p)} · confianza ${f.mejor.conf}</div></td>
          <td class="num">${f.dif == null ? '—' : `<span class="chip ${f.dif > 0 ? 'ok' : f.dif < 0 ? 'bad' : 'line'}">${f.dif > 0 ? 'Ahorrás ' : f.dif < 0 ? 'Pagás ' : ''}${money(Math.abs(f.dif))}</span>`}</td>
          <td class="num">${m == null ? '—' : Math.round(m * 100) + '%'}</td>
          <td><button type="button" class="ghost" data-act="add-cart" data-id="${f.mejor.o.id}" data-cant="${S.cant}">+ Pedido</button></td></tr>`;
        }).join('')}</tbody></table></div>` : `<div class="empty">Todavía no hay precios de proveedores asociados a tu catálogo. Cargá un proveedor y sus productos en <a href="#proveedores">Proveedores</a>.</div>`}
      ${sinOferta.length ? `<p class="note">Sin proveedor comparado (${sinOferta.length}): ${sinOferta.map(f => esc(f.c.nombre)).join(' · ')}</p>` : ''}
    </div>
    <div class="stack">
      <h2>Proveedores más confiables</h2>
      ${top.length ? `<div class="scroll"><table><thead><tr><th>Proveedor</th><th>Confianza</th><th class="num">Envío</th><th class="num">Demora</th><th class="num">Reseñas</th><th class="num">Productos</th></tr></thead><tbody>
        ${top.map(p => `<tr><td><b>${esc(p.nombre)}</b><div class="small muted">${esc(p.tipo || '')}${p.ubicacion ? ' · ' + esc(p.ubicacion) : ''}</div></td><td>${trustHTML(p)}</td><td class="num">${Number(p.envio_costo) ? money(p.envio_costo) : 'Gratis/—'}</td><td class="num">${diasTxt(p)}</td><td class="num">${p.resena_puntaje ? `${p.resena_puntaje} ★ (${p.resena_cant || 0})` : '—'}</td><td class="num">${S.ofe.filter(o => o.proveedor_id === p.id).length}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">Sin proveedores todavía.</div>`}
    </div>`;
}

function formProv(p) {
  p = p || {};
  const v = (k) => esc(p[k] ?? '');
  return `<form class="card" id="formProv">
    <h3>${p.id ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
    <div class="form">
      <label class="f">Nombre<input id="fp-nombre" required value="${v('nombre')}" placeholder="Ej: Mayorista Once"></label>
      <label class="f">Página web o link<input id="fp-url" value="${v('url')}" placeholder="https://..."></label>
      <label class="f">Tipo<select id="fp-tipo">${['Mayorista web', 'Mayorista local', 'WhatsApp / Instagram', 'Mercado Libre', 'Importación (AliExpress, Alibaba)', 'Otro'].map(t => `<option ${p.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="f">Ubicación<input id="fp-ubicacion" value="${v('ubicacion')}" placeholder="CABA, Córdoba..."></label>
      <label class="f">Envío a Río Cuarto ($)<input id="fp-envio_costo" inputmode="numeric" value="${v('envio_costo')}" placeholder="0 si es gratis"></label>
      <label class="f">Llega en (días mín.)<input id="fp-dias_min" inputmode="numeric" value="${v('dias_min')}"></label>
      <label class="f">Llega en (días máx.)<input id="fp-dias_max" inputmode="numeric" value="${v('dias_max')}"></label>
      <label class="f">Compra mínima ($)<input id="fp-minimo" inputmode="numeric" value="${v('minimo')}"></label>
      <label class="f">Formas de pago<input id="fp-pago" value="${v('pago')}" placeholder="Transferencia, MP..."></label>
      <label class="f">Reseñas: puntaje (0–5)<input id="fp-resena_puntaje" inputmode="decimal" value="${v('resena_puntaje')}"></label>
      <label class="f">Reseñas: cantidad<input id="fp-resena_cant" inputmode="numeric" value="${v('resena_cant')}"></label>
      <label class="f">Años vendiendo<input id="fp-anios" inputmode="numeric" value="${v('anios')}"></label>
      <div class="checks wide">
        <label><input type="checkbox" id="fp-factura" ${p.factura ? 'checked' : ''}> Da factura</label>
        <label><input type="checkbox" id="fp-garantia" ${p.garantia ? 'checked' : ''}> Tiene garantía o cambios</label>
        <label><input type="checkbox" id="fp-compre" ${p.compre ? 'checked' : ''}> Ya le compré y salió bien</label>
      </div>
      <label class="f wide">Notas<textarea id="fp-notas" style="min-height:60px" placeholder="Contacto, horarios, lo que te dijeron...">${v('notas')}</textarea></label>
    </div>
    <div class="row"><button type="submit" class="primary">Guardar proveedor</button><button type="button" data-act="cancel-prov">Cancelar</button></div>
  </form>`;
}

function vistaSitio(I) {
  const r = I.res, prods = r.productos;
  const conRef = prods.map((p, i) => ({ p, i })).filter(x => x.p.ref);
  const sinStock = prods.filter(p => p.disponible === false).length;
  const q = norm(I.filtro || '');
  const otros = prods.map((p, i) => ({ p, i })).filter(x => !x.p.ref && (!q || norm(x.p.nombre).includes(q)));
  const destSug = S.prov.find(p => { try { return new URL(/^https?:/.test(p.url) ? p.url : 'https://' + p.url).host === new URL(I.url).host; } catch (e) { return false; } });
  const fila = ({ p, i }) => `<tr><td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.nombre)}</a>${p.disponible === false ? ' <span class="chip bad">Sin stock</span>' : ''}</td><td class="num">${money(p.precio)}</td>
    <td><select id="imp-ref-${i}" aria-label="Producto de tu catálogo para ${esc(p.nombre)}"><option value="">— No está en mi catálogo —</option>${S.cat.map(c => `<option ${norm(c.nombre) === norm(p.ref) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></td>
    <td class="num">${(() => { const c = catByName(p.ref); return c?.costo != null ? `<span class="chip ${p.precio < c.costo ? 'ok' : p.precio > c.costo ? 'bad' : 'line'}">tu costo ${money(c.costo)}</span>` : ''; })()}</td></tr>`;
  return `<div class="stack">
    <div class="facts">
      <div><span>Productos leídos</span><b>${prods.length}${r.total ? ` de ${r.total}` : ''}</b></div>
      <div><span>De tu catálogo</span><b>${conRef.length}</b></div>
      <div><span>Sin stock</span><b>${sinStock}</b></div>
      <div><span>Compra mínima</span><b>${r.proveedor?.minimo ? money(r.proveedor.minimo) : '—'}</b></div>
      <div><span>Envío</span><b>${r.proveedor?.envio_costo != null ? money(r.proveedor.envio_costo) : '—'}</b></div>
    </div>
    ${r.noLeidos ? `<p class="note">${r.noLeidos} páginas no se pudieron leer (pueden no tener precio publicado).</p>` : ''}
    <h3>Productos que también vendés (${conRef.length})</h3>
    ${conRef.length ? `<div class="scroll"><table><thead><tr><th>Producto del proveedor</th><th class="num">Precio</th><th>Es de mi catálogo</th><th class="num">Comparado</th></tr></thead><tbody>${conRef.map(fila).join('')}</tbody></table></div>` : '<p class="small muted">Claude no encontró productos iguales a los de tu catálogo. Podés asociarlos a mano abajo.</p>'}
    <details ${q ? 'open' : ''}><summary class="small" style="cursor:pointer"><b>Ver los otros ${prods.length - conRef.length} productos</b> y asociar alguno a mano</summary>
      <div class="stack" style="margin-top:8px"><input id="imp-filtro" type="search" placeholder="Buscar entre los productos del proveedor..." value="${esc(I.filtro || '')}">
      <div class="scroll"><table><thead><tr><th>Producto</th><th class="num">Precio</th><th>Es de mi catálogo</th><th></th></tr></thead><tbody>${otros.slice(0, 80).map(fila).join('')}</tbody></table></div>
      ${otros.length > 80 ? `<p class="small muted">Mostrando 80 de ${otros.length}. Buscá para ver otros.</p>` : ''}</div></details>
    <div class="row"><label class="f" style="flex:1 1 220px">Guardar en<select id="imp-dest"><option value="__nuevo">Proveedor nuevo: ${esc(r.proveedor?.nombre || new URL(I.url).hostname)}</option>${S.prov.map(p => `<option value="${p.id}" ${destSug?.id === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label></div>
    <div class="row"><button type="button" class="primary" data-act="imp-guardar-sitio" data-modo="todos">Guardar los ${prods.length} precios</button><button type="button" data-act="imp-guardar-sitio" data-modo="catalogo">Solo los de mi catálogo</button><button type="button" data-act="imp-cerrar">Descartar</button></div>
    <p class="note">Al guardar se reemplazan los precios anteriores de ese proveedor por estos, así quedan siempre actualizados.</p>
  </div>`;
}

function importador() {
  const I = S.importe;
  let cuerpo = '';
  if (I?.cargando) cuerpo = `<div class="stack"><p class="thinking">${esc(I.cargando)}</p>${I.progreso ? `<div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(I.progreso * 100)}"><i style="width:${Math.round(I.progreso * 100)}%"></i></div>` : ''}${I.sitio ? '<div><button type="button" data-act="imp-detener">Detener</button></div>' : ''}</div>`;
  else if (I?.error) cuerpo = `<div class="banner bad"><span>${esc(I.error)}</span></div>`;
  if (I?.res?.sitio) cuerpo += vistaSitio(I);
  else if (I?.res) {
    const r = I.res;
    cuerpo += `<div class="stack">
      <p class="sub">Revisá lo que encontré. Corregí o asociá cada producto a uno de tu catálogo antes de guardar.</p>
      <div class="facts">
        <div><span>Proveedor</span><b>${esc(r.proveedor?.nombre || '—')}</b></div>
        <div><span>Envío</span><b>${r.proveedor?.envio_costo != null ? money(r.proveedor.envio_costo) : '—'}</b></div>
        <div><span>Demora</span><b>${diasTxt(r.proveedor)}</b></div>
        <div><span>Compra mínima</span><b>${r.proveedor?.minimo ? money(r.proveedor.minimo) : '—'}</b></div>
        <div><span>Reseñas</span><b>${r.proveedor?.resena_puntaje ? `${r.proveedor.resena_puntaje} ★ (${r.proveedor.resena_cant || 0})` : '—'}</b></div>
      </div>
      <div class="scroll"><table><thead><tr><th></th><th>Producto</th><th class="num">Precio</th><th>Es de mi catálogo</th></tr></thead><tbody>
      ${(r.productos || []).map((p, i) => `<tr><td><input type="checkbox" id="imp-ok-${i}" ${p.ref ? 'checked' : ''} aria-label="Guardar ${esc(p.nombre)}"></td>
        <td>${esc(p.nombre)}<div class="small muted">${esc(p.categoria || '')}</div></td><td class="num">${money(p.precio)}</td>
        <td><select id="imp-ref-${i}"><option value="">— Producto nuevo —</option>${S.cat.map(c => `<option ${norm(c.nombre) === norm(p.ref) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No encontré productos con precio.</td></tr>'}
      </tbody></table></div>
      <div class="row"><label class="f" style="flex:1 1 220px">Guardar en<select id="imp-dest"><option value="__nuevo">Proveedor nuevo: ${esc(r.proveedor?.nombre || 'sin nombre')}</option>${S.prov.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></label>
      <button type="button" class="primary" data-act="imp-guardar">Guardar marcados</button><button type="button" data-act="imp-cerrar">Descartar</button></div>
    </div>`;
  }
  return `<div class="card">
    <h3>Cargar el catálogo de un proveedor</h3>
    <p class="sub">Pegá la dirección de su web. La app recorre todo el sitio, lee el precio de cada producto (no solo una página) y Claude marca cuáles son iguales a los tuyos. Si la web no deja leerse, copiá el texto o la lista de precios y pegalo abajo.</p>
    <div class="row"><input id="imp-url" type="url" style="flex:1 1 260px" placeholder="https://proveedor.com.ar" value="${esc(I?.url || '')}"><button type="button" class="primary" data-act="imp-leer" ${I?.cargando ? 'disabled' : ''}>Leer catálogo completo</button></div>
    <label class="checks small"><span style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="imp-todo" ${S.leerTodo ? 'checked' : ''}> Leer también lo que no es tecnología (bazar, juguetes, etc.). Tarda más.</span></label>
    <details ${I?.abrirTexto ? 'open' : ''}><summary class="small muted" style="cursor:pointer">O pegar el texto de la página o la lista de precios</summary>
      <div class="stack" style="margin-top:8px"><textarea id="imp-texto" placeholder="Pegá acá la lista de precios, el catálogo en texto o las reseñas...">${esc(I?.texto || '')}</textarea>
      <div><button type="button" data-act="imp-texto" ${I?.cargando ? 'disabled' : ''}>Analizar texto</button></div></div></details>
    ${cuerpo}
  </div>`;
}

function renderProv() {
  const lista = [...S.prov].sort((a, b) => confianza(b).total - confianza(a).total);
  return `
    <div class="row between"><h2>Tus proveedores</h2><button type="button" class="primary" data-act="new-prov">+ Agregar proveedor</button></div>
    ${S.editProv ? formProv(S.editProv === 'nuevo' ? null : provById(S.editProv)) : ''}
    ${importador()}
    ${lista.length ? `<div class="grid">${lista.map(cardProv).join('')}</div>` : `<div class="empty">Cargá tu primer proveedor con el botón de arriba o leyendo su página.</div>`}`;
}

function cardProv(p) {
  const ofs = S.ofe.filter(o => o.proveedor_id === p.id).sort((a, b) => (b.ref ? 1 : 0) - (a.ref ? 1 : 0) || refDe(a).localeCompare(refDe(b)));
  const deCat = ofs.filter(o => o.ref).length;
  const abierto = S.abierto === p.id;
  const href = p.url ? (/^https?:\/\//.test(p.url) ? p.url : 'https://' + p.url) : '';
  return `<article class="card">
    <div class="row between"><div><h3>${esc(p.nombre)}</h3><div class="small muted">${esc(p.tipo || '')}${p.ubicacion ? ' · ' + esc(p.ubicacion) : ''}</div></div>${trustHTML(p)}</div>
    <div class="facts">
      <div><span>Envío</span><b>${Number(p.envio_costo) ? money(p.envio_costo) : p.envio_costo != null ? 'Gratis' : '—'}</b></div>
      <div><span>Demora</span><b>${diasTxt(p)}</b></div>
      <div><span>Mínimo</span><b>${p.minimo ? money(p.minimo) : '—'}</b></div>
      <div><span>Reseñas</span><b>${p.resena_puntaje ? `${p.resena_puntaje} ★ (${p.resena_cant || 0})` : '—'}</b></div>
    </div>
    <div class="row small">${p.factura ? '<span class="chip ok">Factura</span>' : ''}${p.garantia ? '<span class="chip ok">Garantía</span>' : ''}${p.compre ? '<span class="chip ok">Ya compraste</span>' : ''}${p.pago ? `<span class="chip line">${esc(p.pago)}</span>` : ''}</div>
    ${href && /^https?:\/\//.test(href) ? `<a class="small" href="${esc(href)}" target="_blank" rel="noopener">${esc(p.url)}</a>` : ''}
    ${p.notas ? `<p class="small muted">${esc(p.notas)}</p>` : ''}
    ${ofs.length ? `<p class="small muted">${ofs.length} precios · ${deCat} de tu catálogo · actualizado el ${esc(ofs.map(o => o.actualizado).sort().pop())}</p>` : ''}
    <div class="row"><button type="button" data-act="toggle-prov" data-id="${p.id}">${abierto ? 'Ocultar' : 'Ver'} productos (${ofs.length})</button>${href ? `<button type="button" data-act="actualizar-sitio" data-id="${p.id}" ${S.importe?.cargando ? 'disabled' : ''}>Actualizar precios de su web</button>` : ''}<button type="button" class="ghost" data-act="edit-prov" data-id="${p.id}">Editar</button><button type="button" class="ghost danger" data-act="del-prov" data-id="${p.id}">Borrar</button></div>
    ${abierto ? `<div class="stack">
      ${ofs.length ? `<div class="scroll"><table><thead><tr><th>Producto</th><th class="num">Precio</th><th></th></tr></thead><tbody>${ofs.slice(0, 60).map(o => `<tr><td>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.nombre)}</a>` : esc(o.nombre)}${o.disponible === false ? ' <span class="chip bad">Sin stock</span>' : ''}${o.ref ? `<div class="small muted">= ${esc(o.ref)}</div>` : ''}</td><td class="num">${money(o.precio)}</td><td class="num"><button type="button" class="ghost" data-act="add-cart" data-id="${o.id}" data-cant="1">+ Pedido</button><button type="button" class="ghost danger" data-act="del-ofe" data-id="${o.id}">Quitar</button></td></tr>`).join('')}</tbody></table></div>${ofs.length > 60 ? `<p class="small muted">Mostrando 60 de ${ofs.length} (primero los de tu catálogo). Para buscar uno en particular usá <a href="#comparar">Comparar</a>.</p>` : ''}` : '<p class="small muted">Sin productos cargados.</p>'}
      <form class="form" data-form="ofe" data-prov="${p.id}">
        <label class="f">Producto<input id="fo-nombre-${p.id}" required placeholder="Smartwatch D20"></label>
        <label class="f">Precio por unidad ($)<input id="fo-precio-${p.id}" required inputmode="numeric"></label>
        <label class="f">Es de mi catálogo<select id="fo-ref-${p.id}"><option value="">— Producto nuevo —</option>${S.cat.map(c => `<option>${esc(c.nombre)}</option>`).join('')}</select></label>
        <div style="align-self:end"><button type="submit" class="primary">Agregar precio</button></div>
      </form></div>` : ''}
  </article>`;
}

function renderComparar() {
  const q = norm(S.buscar);
  const filtro = S.filtroCmp || 'catalogo';
  const todos = grupos();
  const gsAll = todos.filter(g => !q || norm(g.ref).includes(q) || g.ofertas.some(o => norm(o.nombre).includes(q)))
    .filter(g => q || filtro === 'todos' || (filtro === 'catalogo' ? !!catByName(g.ref) : g.ofertas.length > 1))
    .sort((a, b) => b.ofertas.length - a.ofertas.length || (catByName(b.ref) ? 1 : 0) - (catByName(a.ref) ? 1 : 0) || a.ref.localeCompare(b.ref));
  const gs = gsAll.slice(0, 50);
  return `
    <div class="row between"><h2>Comparar precios</h2>
      <div class="row"><input id="buscar" type="search" placeholder="Buscar producto..." value="${esc(S.buscar)}" style="width:220px">
      <select id="filtroCmp" aria-label="Qué productos mostrar" style="width:auto">${[['catalogo', 'Los de mi catálogo'], ['varios', 'Con más de un proveedor'], ['todos', 'Todos']].map(([v, t]) => `<option value="${v}" ${filtro === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <label class="f" style="flex-direction:row;align-items:center;gap:8px">Unidades<input id="cantCmp" class="qty" type="number" min="1" value="${S.cant}"></label></div></div>
    ${gsAll.length > gs.length ? `<p class="small muted">Mostrando ${gs.length} de ${gsAll.length} productos. Buscá por nombre para encontrar uno en particular.</p>` : ''}
    <p class="sub">Cada producto con todos los proveedores que lo tienen. En verde, la mejor opción combinando precio puesto, confianza y demora. Tocá o pasá el mouse por la confianza para ver de dónde sale.</p>
    ${gs.length ? gs.map(g => {
      const rows = ranking(g.ofertas, S.cant), c = catByName(g.ref);
      const minP = Math.min(...rows.map(r => r.cp)), minD = Math.min(...rows.map(r => r.dias));
      return `<div class="card"><div class="row between"><div><h3>${esc(g.ref)}</h3>${c ? `<div class="small muted">En Gestión: vendés a ${money(c.precio)} · tu costo ${money(c.costo)} · stock ${c.stock ?? '—'}</div>` : '<div class="small muted">Producto nuevo (no está en Gestión)</div>'}</div><span class="chip line">${rows.length} ${rows.length === 1 ? 'proveedor' : 'proveedores'}</span></div>
      <div class="scroll"><table><thead><tr><th>Proveedor</th><th class="num">Precio</th><th class="num">Puesto x${S.cant}</th><th class="num">Demora</th><th>Confianza</th>${c ? '<th class="num">Margen</th>' : ''}<th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${i === 0 && rows.length > 1 ? 'best' : ''}"><td><b>${esc(r.p.nombre)}</b>${i === 0 && rows.length > 1 ? ' <span class="chip ok">Mejor opción</span>' : ''}<div class="small muted">${esc(r.o.nombre)}</div></td>
        <td class="num">${money(r.o.precio)}</td><td class="num">${money(r.cp)}${r.cp === minP && rows.length > 1 ? ' <span class="chip ok">Más barato</span>' : ''}</td>
        <td class="num">${diasTxt(r.p)}${diasDe(r.p) && r.dias === minD && rows.length > 1 ? ' <span class="chip ok">Más rápido</span>' : ''}</td>
        <td>${trustHTML(r.p)}</td>${c ? `<td class="num">${c.precio ? Math.round((c.precio - r.cp) / c.precio * 100) + '%' : '—'}</td>` : ''}
        <td class="num"><button type="button" class="ghost" data-act="add-cart" data-id="${r.o.id}" data-cant="${S.cant}">+ Pedido</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
    }).join('') : `<div class="empty">${S.ofe.length ? 'Nada coincide con la búsqueda.' : 'Cargá precios en Proveedores para comparar.'}</div>`}`;
}

/* ---------- Secciones: comparativa por rubro entre proveedores ---------- */
function renderSecciones() {
  const ofs = S.ofe.filter(o => provById(o.proveedor_id)).map(o => ({ ...o, sec: seccionDe(o.nombre, o.categoria) }));
  const conteo = new Map();
  for (const o of ofs) conteo.set(o.sec, (conteo.get(o.sec) || 0) + 1);
  const nombres = [...conteo.keys()].sort((a, b) => (a === 'Otros') - (b === 'Otros') || conteo.get(b) - conteo.get(a));
  if (!S.seccion || !conteo.has(S.seccion)) S.seccion = nombres[0];
  const sec = S.seccion, enSec = ofs.filter(o => o.sec === sec);
  const provs = [...new Set(enSec.map(o => o.proveedor_id))].map(provById);
  const stats = provs.map(p => {
    const precios = enSec.filter(o => o.proveedor_id === p.id && o.disponible !== false).map(o => Number(o.precio));
    const todos = precios.length ? precios : enSec.filter(o => o.proveedor_id === p.id).map(o => Number(o.precio));
    return { p, n: enSec.filter(o => o.proveedor_id === p.id).length, min: Math.min(...todos), med: mediana(todos), max: Math.max(...todos) };
  }).sort((a, b) => a.med - b.med);
  const mios = S.cat.filter(c => seccionDe(c.nombre, c.categoria) === sec);
  const q = norm(S.secBuscar || ''), fp = S.secProv || '';
  const lista = enSec.filter(o => (!fp || o.proveedor_id === fp) && (!q || norm(o.nombre).includes(q)) && (!S.secStock || o.disponible !== false))
    .sort((a, b) => S.secOrden === 'caro' ? b.precio - a.precio : a.precio - b.precio);
  const elegidos = S.sel.map(id => ofs.find(o => o.id === id)).filter(Boolean);

  return `
    <div class="stack"><h2>Comparar por secciones</h2>
    <p class="sub">Agrupa los productos parecidos de todos tus proveedores aunque no sean el mismo modelo: todos los smartwatch, todos los parlantes, etc. Tildá “Comparar” en los que te interesen para verlos lado a lado abajo.</p></div>
    ${nombres.length ? `
    <div class="row" role="tablist" aria-label="Secciones">${nombres.map(n => `<button type="button" class="${n === sec ? 'primary' : ''}" data-act="seccion" data-sec="${esc(n)}" aria-pressed="${n === sec}">${esc(n)} <span class="chip line">${conteo.get(n)}</span></button>`).join('')}</div>

    <div class="stack"><h3>${esc(sec)}: precios por proveedor</h3>
    <div class="scroll"><table><thead><tr><th>Proveedor</th><th class="num">Productos</th><th class="num">Más barato</th><th class="num">Precio típico</th><th class="num">Más caro</th><th>Confianza</th></tr></thead><tbody>
      ${stats.map((s, i) => `<tr class="${i === 0 && stats.length > 1 ? 'best' : ''}"><td><b>${esc(s.p.nombre)}</b>${i === 0 && stats.length > 1 ? ' <span class="chip ok">Más barato en general</span>' : ''}</td><td class="num">${s.n}</td><td class="num">${money(s.min)}</td><td class="num"><b>${money(s.med)}</b></td><td class="num">${money(s.max)}</td><td>${trustHTML(s.p)}</td></tr>`).join('')}
      ${mios.length ? `<tr><td><b>Tu catálogo (Tecno Riv)</b><div class="small muted">lo que te cuesta hoy · lo vendés a</div></td><td class="num">${mios.length}</td><td class="num">${money(Math.min(...mios.map(c => c.costo ?? Infinity)))}</td><td class="num">${money(mediana(mios.filter(c => c.costo != null).map(c => c.costo)))}<div class="small muted">vendés a ${money(mediana(mios.map(c => c.precio)))}</div></td><td class="num">${money(Math.max(...mios.map(c => c.costo ?? 0)))}</td><td></td></tr>` : ''}
    </tbody></table></div>
    <p class="note">“Precio típico” es el del medio de la lista (la mitad de sus productos cuesta menos y la otra mitad más). Se calcula con los que tienen stock. Sirve para ver qué proveedor es más barato en el rubro aunque los modelos no sean iguales.</p></div>

    <div class="stack"><h3>Productos de ${esc(sec)} (${lista.length})</h3>
    <div class="row">
      <input id="sec-buscar" type="search" placeholder="Buscar en ${esc(sec)}..." value="${esc(S.secBuscar || '')}" style="flex:1 1 200px">
      <select id="sec-prov" aria-label="Proveedor" style="width:auto"><option value="">Todos los proveedores</option>${provs.map(p => `<option value="${p.id}" ${fp === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>
      <select id="sec-orden" aria-label="Orden" style="width:auto"><option value="barato">Más barato primero</option><option value="caro" ${S.secOrden === 'caro' ? 'selected' : ''}>Más caro primero</option></select>
      <label class="checks small"><span style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="sec-stock" ${S.secStock ? 'checked' : ''}> Solo con stock</span></label>
    </div>
    <div class="scroll"><table><thead><tr><th>Comparar</th><th>Producto</th><th>Proveedor</th><th class="num">Precio</th><th></th></tr></thead><tbody>
      ${lista.slice(0, 120).map(o => `<tr><td><input type="checkbox" data-sel="${o.id}" ${S.sel.includes(o.id) ? 'checked' : ''} aria-label="Comparar ${esc(o.nombre)}"></td>
        <td>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.nombre)}</a>` : esc(o.nombre)}${o.disponible === false ? ' <span class="chip bad">Sin stock</span>' : ''}${o.ref ? ` <span class="chip ok">Lo vendés</span>` : ''}</td>
        <td>${esc(provById(o.proveedor_id).nombre)}</td><td class="num"><b>${money(o.precio)}</b></td>
        <td class="num"><button type="button" class="ghost" data-act="add-cart" data-id="${o.id}" data-cant="1">+ Pedido</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nada coincide con el filtro.</td></tr>'}
    </tbody></table></div>
    ${lista.length > 120 ? `<p class="small muted">Mostrando 120 de ${lista.length}. Usá el buscador o el filtro de proveedor.</p>` : ''}</div>
    ` : `<div class="empty">Todavía no hay productos de proveedores. Cargá el catálogo de uno en <a href="#proveedores">Proveedores</a>.</div>`}

    <div class="stack" id="mi-comparacion"><div class="row between"><h2>Mi comparación (${elegidos.length})</h2>${elegidos.length ? '<button type="button" class="ghost danger" data-act="sel-limpiar">Vaciar</button>' : ''}</div>
    ${elegidos.length ? `<div class="scroll"><table><thead><tr><th>Producto</th><th>Sección</th><th>Proveedor</th><th class="num">Precio</th><th class="num">Puesto x${S.cant}</th><th class="num">Demora</th><th>Confianza</th><th></th></tr></thead><tbody>
      ${(() => { const minP = Math.min(...elegidos.map(o => puesto(o, S.cant))); return [...elegidos].sort((a, b) => a.precio - b.precio).map(o => { const p = provById(o.proveedor_id), cp = puesto(o, S.cant); return `<tr class="${cp === minP && elegidos.length > 1 ? 'best' : ''}">
        <td>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.nombre)}</a>` : esc(o.nombre)}${o.disponible === false ? ' <span class="chip bad">Sin stock</span>' : ''}${cp === minP && elegidos.length > 1 ? ' <span class="chip ok">Más barato</span>' : ''}</td>
        <td class="small">${esc(o.sec)}</td><td>${esc(p.nombre)}</td><td class="num"><b>${money(o.precio)}</b></td><td class="num">${money(cp)}</td><td class="num">${diasTxt(p)}</td><td>${trustHTML(p)}</td>
        <td class="num"><button type="button" class="ghost" data-act="add-cart" data-id="${o.id}" data-cant="${S.cant}">+ Pedido</button><button type="button" class="ghost danger" data-act="sel-quitar" data-id="${o.id}">Quitar</button></td></tr>`; }).join(''); })()}
    </tbody></table></div>
    <p class="note">El precio puesto suma el envío del proveedor repartido entre ${S.cant} unidades. Podés mezclar productos de distintas secciones y proveedores.</p>`
    : '<div class="empty">Tildá “Comparar” en los productos que quieras poner lado a lado, de cualquier sección y proveedor.</div>'}</div>`;
}

function renderGanadores() {
  const G = S.ganBusca;
  return `
    <div class="stack"><h2>Productos ganadores</h2>
    <p class="sub">Claude analiza tu catálogo de Gestión y la época del año, y propone productos para sumar a Tecno Riv con precio estimado de compra y venta. Después buscalos en tus proveedores para ver el precio real.</p></div>
    <div class="card"><div class="form">
      <label class="f wide">Enfoque (opcional)<input id="gan-foco" value="${esc(G.foco || '')}" placeholder="Ej: regalos para fiestas, productos de menos de $15.000, gamers, verano..."></label>
    </div><div class="row"><button type="button" class="primary" data-act="gan-buscar" ${G.cargando ? 'disabled' : ''}>Buscar ganadores</button></div>
    ${G.cargando ? '<p class="thinking">Analizando tu catálogo y la temporada. Puede tardar hasta un minuto.</p>' : ''}
    ${G.error ? `<div class="banner bad"><span>${esc(G.error)}</span></div>` : ''}
    <p class="note">Son estimaciones de Claude según tendencias conocidas, no datos de ventas en vivo. Confirmá el precio con tus proveedores y mirá cuánto se publica en Mercado Libre antes de comprar.</p></div>
    ${S.gan.length ? `<div class="grid">${S.gan.map(g => {
      const m = g.venta_est && g.compra_est ? Math.round((g.venta_est - g.compra_est) / g.venta_est * 100) : null;
      const clave = norm(g.buscar || g.producto).split(' ')[0];
      const enProv = clave ? S.ofe.filter(o => norm(o.nombre).includes(clave)).length : 0;
      return `<article class="card winner"><div class="row between"><h3>${esc(g.producto)}</h3><span class="chip ${g.demanda === 'alta' ? 'ok' : g.demanda === 'media' ? 'warn' : 'line'}">Demanda ${esc(g.demanda || '—')}</span></div>
        <div class="small muted">${esc(g.categoria || '')}</div>
        <p class="why">${esc(g.por_que)}</p>
        <div class="facts"><div><span>Compra est.</span><b>${money(g.compra_est)}</b></div><div><span>Venta est.</span><b>${money(g.venta_est)}</b></div><div><span>Margen est.</span><b>${m == null ? '—' : m + '%'}</b></div></div>
        ${g.combina_con ? `<p class="small"><b>Combina con:</b> ${esc(g.combina_con)}</p>` : ''}
        ${g.riesgo ? `<p class="small"><b>Ojo:</b> ${esc(g.riesgo)}</p>` : ''}
        <div class="row"><button type="button" data-act="gan-comparar" data-q="${esc(g.buscar || g.producto)}">Buscar en mis proveedores${enProv ? ` (${enProv})` : ''}</button>
        <a class="btn" href="https://listado.mercadolibre.com.ar/${encodeURIComponent((g.buscar || g.producto).replace(/\s+/g, '-'))}" target="_blank" rel="noopener">Ver en Mercado Libre</a>
        <button type="button" class="ghost danger" data-act="gan-del" data-id="${g.id}">Descartar</button></div>
        <div class="small muted">Sugerido el ${esc(g.fecha || '')}</div></article>`;
    }).join('')}</div>` : `<div class="empty">Todavía no buscaste ganadores. Tocá “Buscar ganadores”.</div>`}`;
}

function planGestion(p) {
  const unidades = (p.items || []).reduce((a, i) => a + (Number(i.cant) || 0), 0) || 1;
  const envUnit = (Number(p.envio) || 0) / unidades;
  return (p.items || []).map(i => { const c = catByName(i.ref || i.nombre); return { i, c, costoNuevo: Math.round(Number(i.precio) + envUnit) }; });
}

function renderPedido() {
  const porProv = new Map();
  for (const it of S.cart) { const o = S.ofe.find(x => x.id === it.ofertaId); if (!o) continue; if (!porProv.has(o.proveedor_id)) porProv.set(o.proveedor_id, []); porProv.get(o.proveedor_id).push({ ...it, o }); }
  const bloques = [...porProv.entries()].map(([pid, items]) => {
    const p = provById(pid); if (!p) return '';
    const sub = items.reduce((a, i) => a + i.o.precio * i.cant, 0), env = Number(p.envio_costo) || 0;
    const falta = p.minimo && sub < p.minimo ? p.minimo - sub : 0;
    const venta = items.reduce((a, i) => { const c = catByName(refDe(i.o)); return a + (c?.precio || 0) * i.cant; }, 0);
    return `<div class="card"><div class="row between"><div><h3>${esc(p.nombre)}</h3><div class="small muted">${diasTxt(p)} · ${p.pago ? esc(p.pago) : 'pago a confirmar'}</div></div>${trustHTML(p)}</div>
      <div class="scroll"><table><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th><th></th></tr></thead><tbody>
      ${items.map(i => `<tr><td>${esc(i.o.nombre)}</td><td class="num"><input class="qty" type="number" min="1" id="cq-${i.ofertaId}" data-cart="${i.ofertaId}" value="${i.cant}" aria-label="Cantidad de ${esc(i.o.nombre)}"></td><td class="num">${money(i.o.precio)}</td><td class="num">${money(i.o.precio * i.cant)}</td><td class="num"><button type="button" class="ghost danger" data-act="cart-del" data-id="${i.ofertaId}">Quitar</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="facts"><div><span>Productos</span><b>${money(sub)}</b></div><div><span>Envío</span><b>${env ? money(env) : 'Gratis/—'}</b></div><div><span>Total</span><b>${money(sub + env)}</b></div>${venta ? `<div><span>Vendido a tu precio</span><b>${money(venta)}</b></div><div><span>Ganancia est.</span><b>${money(venta - sub - env)}</b></div>` : ''}</div>
      ${falta ? `<div class="banner warn"><span>Te faltan ${money(falta)} para la compra mínima de ${money(p.minimo)}.</span></div>` : ''}
      <div class="row"><button type="button" class="primary" data-act="ped-guardar" data-prov="${pid}">Guardar pedido</button><button type="button" data-act="ped-copiar" data-prov="${pid}">Mensaje para el proveedor</button></div></div>`;
  }).join('');
  const EST = { borrador: 'line', enviado: 'warn', recibido: 'ok', cancelado: 'bad' };
  const conf = S.confGestion ? S.ped.find(x => x.id === S.confGestion) : null;
  const confHTML = conf ? (() => {
    const plan = planGestion(conf), ok = plan.filter(x => x.c?.id), fuera = plan.filter(x => !x.c?.id);
    return `<div class="card" style="border-color:var(--accent)"><h3>Pasar a Gestión: pedido de ${esc(conf.proveedor)}</h3>
      <p class="sub">Esto cambia tu base de Gestión: suma el stock y deja como costo el precio más el envío repartido entre las unidades.</p>
      <div class="scroll"><table><thead><tr><th>Producto en Gestión</th><th class="num">Stock</th><th class="num">Costo</th></tr></thead><tbody>
      ${ok.map(x => `<tr><td>${esc(x.c.nombre)}</td><td class="num">${x.c.stock ?? 0} → <b>${(Number(x.c.stock) || 0) + Number(x.i.cant)}</b></td><td class="num">${money(x.c.costo)} → <b>${money(x.costoNuevo)}</b></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Ninguno de estos productos está en Gestión.</td></tr>'}
      </tbody></table></div>
      ${fuera.length ? `<p class="note">No están en Gestión y no se cargan: ${fuera.map(x => esc(x.i.nombre)).join(' · ')}. Crealos en Gestión primero.</p>` : ''}
      <div class="row"><button type="button" class="primary" data-act="gestion-aplicar" ${ok.length ? '' : 'disabled'}>Actualizar Gestión</button><button type="button" data-act="gestion-cancelar">Cancelar</button></div></div>`;
  })() : '';
  return `
    <div class="stack"><h2>Armar pedido</h2><p class="sub">Sumá productos con “+ Pedido” desde Resumen, Comparar o Proveedores. Se agrupan por proveedor con su envío y compra mínima.</p></div>
    ${bloques || `<div class="empty">El pedido está vacío. Andá a <a href="#comparar">Comparar</a> y tocá “+ Pedido” en la mejor opción.</div>`}
    <div class="stack"><h2>Pedidos guardados</h2>
    <p class="sub">Cuando llegue la mercadería, marcá el pedido como recibido y tocá “Pasar a Gestión” para sumar el stock y actualizar los costos.</p>
    ${confHTML}
    ${S.ped.length ? `<div class="scroll"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Detalle</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead><tbody>
      ${S.ped.map(p => `<tr><td class="num">${esc(p.fecha)}</td><td><b>${esc(p.proveedor)}</b></td><td class="small">${(p.items || []).map(i => `${i.cant} × ${esc(i.nombre)}`).join('<br>')}</td><td class="num">${money(p.total)}</td>
        <td><select id="pe-${p.id}" data-ped="${p.id}" aria-label="Estado del pedido" ${p.gestion_at ? 'disabled' : ''}>${['borrador', 'enviado', 'recibido', 'cancelado'].map(e => `<option value="${e}" ${p.estado === e ? 'selected' : ''}>${e[0].toUpperCase() + e.slice(1)}</option>`).join('')}</select> <span class="chip ${EST[p.estado] || 'line'}">${esc(p.estado)}</span></td>
        <td class="num">${p.estado === 'recibido' ? (p.gestion_at ? `<span class="chip ok">En Gestión ${esc(p.gestion_at)}</span>` : `<button type="button" class="ghost" data-act="gestion-pasar" data-id="${p.id}">Pasar a Gestión</button>`) : ''}<button type="button" class="ghost" data-act="ped-msg" data-id="${p.id}">Mensaje</button>${p.gestion_at ? '' : `<button type="button" class="ghost danger" data-act="ped-del" data-id="${p.id}">Borrar</button>`}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Todavía no guardaste pedidos.</div>'}</div>`;
}

/* ---------- mensajes ---------- */
function mensaje(provNombre, items, env) {
  const l = items.map(i => `• ${i.cant} × ${i.nombre} (${money(i.precio)} c/u)`).join('\n');
  const sub = items.reduce((a, i) => a + i.precio * i.cant, 0);
  return `Hola ${provNombre}! Soy Valen de Tecno Riv (Río Cuarto). Quiero hacer este pedido:\n\n${l}\n\nTotal productos: ${money(sub)}\n\n¿Me confirmás stock, costo de envío a Río Cuarto (Córdoba), demora y forma de pago? ¡Gracias!`;
}
function itemsCart(pid) {
  return S.cart.map(it => ({ it, o: S.ofe.find(x => x.id === it.ofertaId) })).filter(x => x.o && x.o.proveedor_id === pid)
    .map(({ it, o }) => ({ ofertaId: o.id, nombre: o.nombre, ref: refDe(o), cant: Number(it.cant) || 1, precio: Number(o.precio) }));
}

/* ---------- acciones con Claude ---------- */
async function importar(body, url) {
  S.importe = { url, texto: body.texto || '', abrirTexto: !!body.texto, cargando: body.accion === 'leer' ? 'Abriendo la página y leyendo precios, envío y reseñas...' : 'Leyendo precios, envío y reseñas...' };
  render();
  try {
    const r = await ia(body);
    if (!r || !Array.isArray(r.productos)) throw new Error('No pude entender la página. Probá pegando solo la lista de precios.');
    r.productos = r.productos.filter(p => p && p.nombre && Number(p.precio) > 0).map(p => ({ ...p, precio: Number(p.precio) }));
    S.importe = { ...S.importe, cargando: null, res: r };
  } catch (e) {
    S.importe = { ...S.importe, cargando: null, error: e.message + (body.accion === 'leer' ? ' Podés copiar el texto de la página y pegarlo abajo.' : ''), abrirTexto: true };
  }
  render();
}
/* Catálogo completo: recorre el sitemap, lee cada producto (de a tandas) y Claude marca los que son de tu catálogo.
   Por defecto solo lee productos de tecnología, según las palabras de su dirección. */
const RUBRO_TECNO = /auricular|headphone|headset|earbud|airpod|tws|parlante|speaker|smart-?watch|reloj|watch|malla|correa|cargador|cable|usb|tipo-c|type-c|lightning|magsafe|power-?bank|bateria-externa|funda|case|templado|hidrogel|protector-(de-)?pantalla|celular|iphone|samsung|xiaomi|motorola|soporte-(de-|para-)?(celular|auto|tablet|moto|bici)|holder|telefono|bluetooth|mouse|teclado|gamer|joystick|consola|microfono|camara|webcam|tripode|selfie|aro-de-luz|ring-light|adaptador|hub|pendrive|memoria|micro-?sd|tablet|notebook|monitor|router|wifi|tv-box|jbl|lenovo|redmi|(^|-)i\d{1,2}(-|$)|(^|-)p47(-|$)/i;
const BULTOS = /(^|-)(bulto|bultos|pack|lote|combo)(-|$)|-x\d+-unidades/i; // bultos cerrados y packs: no, solo productos por unidad
let detenerSitio = false;
async function importarSitio(url, destId) {
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  detenerSitio = false;
  S.importe = { url, sitio: true, destId, cargando: 'Buscando todos los productos del sitio...' }; render();
  try {
    const mapa = await ia({ accion: 'sitio_mapa', url, soloTecno: !S.leerTodo });
    let urls = mapa.urls || [];
    const info = ia({ accion: 'leer', url: new URL(url).origin }).then(r => r?.proveedor || null).catch(() => null); // envío, mínimo, etc.
    if (Array.isArray(mapa.productos) && mapa.productos.length) {
      // Proveedor con lector especial (su catálogo público): ya vienen todos los productos, sin recorrer páginas
      const productos = mapa.productos.filter(p => !BULTOS.test(norm(p.nombre).replace(/\s+/g, '-')));
      return terminarSitio(url, destId, productos, [], null, info);
    }
    if (urls.length < 3) { S.importe = null; return importar({ accion: 'leer', url }, url); } // sitio sin mapa: una sola página con Claude
    const total = urls.length;
    const slug = (u) => decodeURIComponent(u.split('?')[0].split('/').filter(Boolean).pop() || '');
    urls = urls.filter(u => !BULTOS.test(slug(u)));
    if (!S.leerTodo) urls = urls.filter(u => RUBRO_TECNO.test(slug(u)));
    if (!urls.length) throw new Error('No encontré productos de tecnología en este sitio. Probá marcando “Leer también lo que no es tecnología”.');
    const productos = [], fallidos = [];
    const TANDA = 30;
    for (let i = 0; i < urls.length && !detenerSitio; i += TANDA) {
      S.importe = { ...S.importe, cargando: `Leyendo productos: ${Math.min(i, urls.length)} de ${urls.length}${S.leerTodo ? '' : ` (de tecnología, sobre ${total} del sitio)`}`, progreso: i / urls.length }; render();
      const r = await ia({ accion: 'sitio_productos', urls: urls.slice(i, i + TANDA) });
      productos.push(...r.productos); fallidos.push(...r.fallidos);
    }
    if (fallidos.length && !detenerSitio) { // segundo intento para las que fallaron
      S.importe = { ...S.importe, cargando: `Reintentando ${fallidos.length} productos...`, progreso: 0.97 }; render();
      const r = await ia({ accion: 'sitio_productos', urls: fallidos.slice(0, 60) });
      productos.push(...r.productos); fallidos.splice(0, fallidos.length, ...r.fallidos, ...fallidos.slice(60));
    }
    return terminarSitio(url, destId, productos, fallidos, S.leerTodo ? null : urls.length, info, detenerSitio ? urls.length - productos.length - fallidos.length : 0);
  } catch (e) {
    S.importe = { url, sitio: true, error: e.message };
  }
  render();
}
async function terminarSitio(url, destId, productos, fallidos, total, info, sinLeer = 0) {
  try {
    if (!productos.length) throw new Error('No pude leer precios en este sitio. Probá pegando la lista de precios abajo.');
    S.importe = { ...S.importe, cargando: `Claude está buscando cuáles de los ${productos.length} productos son iguales a los de tu catálogo...`, progreso: 0.99 }; render();
    let pares = {};
    try { pares = await ia({ accion: 'emparejar', nombres: productos.map(p => p.nombre) }) || {}; } catch (e) { pares = {}; }
    productos.forEach((p, i) => { const ref = pares[String(i)]; p.ref = ref && catByName(ref) ? catByName(ref).nombre : ''; });
    productos.sort((a, b) => (b.ref ? 1 : 0) - (a.ref ? 1 : 0) || a.nombre.localeCompare(b.nombre));
    S.importe = { url, sitio: true, destId, res: { sitio: true, productos, proveedor: await info, total, noLeidos: fallidos.length + sinLeer } };
  } catch (e) {
    S.importe = { url, sitio: true, error: e.message };
  }
  render();
}
async function guardarSitio(modo, btn) {
  const I = S.importe, r = I.res;
  const filas = r.productos.map((p, i) => ({ ...p, ref: $('#imp-ref-' + i)?.value ?? p.ref })).filter(p => modo === 'todos' || p.ref);
  if (!filas.length) { toast('No hay productos de tu catálogo para guardar'); return; }
  btn.disabled = true; btn.textContent = 'Guardando...';
  let dest = $('#imp-dest').value;
  if (dest === '__nuevo') {
    const pv = r.proveedor || {};
    dest = await guardar('prov_proveedores', null, { nombre: pv.nombre || new URL(I.url).hostname.replace('www.', ''), url: I.url, tipo: 'Mayorista web', ubicacion: pv.ubicacion || '', envio_costo: pv.envio_costo ?? null, dias_min: pv.dias_min ?? null, dias_max: pv.dias_max ?? null, minimo: pv.minimo ?? null, pago: pv.pago || '', resena_puntaje: pv.resena_puntaje ?? null, resena_cant: pv.resena_cant ?? null, factura: !!pv.factura, garantia: !!pv.garantia, notas: 'Catálogo leído de su web el ' + hoy() });
    if (!dest) { btn.disabled = false; return; }
  }
  const { error: e1 } = await sb.from('prov_ofertas').delete().eq('proveedor_id', dest);
  if (e1) { toast('No se pudieron reemplazar los precios: ' + e1.message); btn.disabled = false; return; }
  const filasDb = filas.map(p => ({ proveedor_id: dest, nombre: p.nombre, ref: p.ref || '', precio: p.precio, categoria: catByName(p.ref)?.categoria || p.categoria || '', url: p.url, disponible: p.disponible }));
  for (let i = 0; i < filasDb.length; i += 500) {
    const { error } = await sb.from('prov_ofertas').insert(filasDb.slice(i, i + 500));
    if (error) { toast('Se guardó una parte. Error: ' + error.message); break; }
  }
  toast(`${filas.length} precios guardados`);
  S.importe = null; S.abierto = dest;
  await cargar();
}

async function buscarGanadores(foco) {
  S.ganBusca = { foco, cargando: true }; render();
  try {
    const arr = await ia({ accion: 'ganadores', foco });
    if (!Array.isArray(arr)) throw new Error('No pude entender la respuesta. Probá de nuevo.');
    const filas = arr.slice(0, 8).filter(g => g && g.producto).map(g => ({ producto: String(g.producto), categoria: String(g.categoria || ''), por_que: String(g.por_que || ''), demanda: String(g.demanda || ''), compra_est: Number(g.compra_est) || null, venta_est: Number(g.venta_est) || null, riesgo: String(g.riesgo || ''), combina_con: String(g.combina_con || ''), buscar: String(g.buscar || g.producto) }));
    const { error } = await sb.from('prov_ganadores').insert(filas);
    if (error) throw new Error('No se pudieron guardar las sugerencias.');
    S.ganBusca = { foco };
    await cargar();
  } catch (e) { S.ganBusca = { foco, error: e.message }; render(); }
}

/* ---------- eventos ---------- */
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id;
  if (a === 'salir') { await sb.auth.signOut(); }
  else if (a === 'modo-login') { S.modoLogin = S.modoLogin === 'entrar' ? 'crear' : 'entrar'; pintarLogin(); }
  else if (a === 'recargar') cargar();
  else if (a === 'new-prov') { S.editProv = 'nuevo'; render(); $('#fp-nombre')?.focus(); }
  else if (a === 'edit-prov') { S.editProv = id; render(); $('#fp-nombre')?.focus(); }
  else if (a === 'cancel-prov') { S.editProv = null; render(); }
  else if (a === 'toggle-prov') { S.abierto = S.abierto === id ? null : id; render(); }
  else if (a === 'del-prov') dosPasos(b, async () => { await borrar('prov_proveedores', id); toast('Proveedor borrado'); cargar(); });
  else if (a === 'del-ofe') { await borrar('prov_ofertas', id); cargar(); }
  else if (a === 'add-cart') { const ex = S.cart.find(c => c.ofertaId === id); const n = Number(b.dataset.cant) || 1; if (ex) ex.cant = Number(ex.cant) + n; else S.cart.push({ ofertaId: id, cant: n }); guardarCart(); render(); toast('Agregado al pedido'); }
  else if (a === 'cart-del') { S.cart = S.cart.filter(c => c.ofertaId !== id); guardarCart(); render(); }
  else if (a === 'ped-copiar' || a === 'ped-guardar') {
    const pid = b.dataset.prov, p = provById(pid), items = itemsCart(pid);
    const env = Number(p.envio_costo) || 0, total = items.reduce((s, i) => s + i.precio * i.cant, 0) + env;
    if (a === 'ped-copiar') { compartirOCopiar(mensaje(p.nombre, items, env)); return; }
    b.disabled = true;
    const ok = await guardar('prov_pedidos', null, { proveedor_id: pid, proveedor: p.nombre, items, envio: env, total, estado: 'borrador', fecha: hoy() });
    if (ok) { S.cart = S.cart.filter(c => !items.some(i => i.ofertaId === c.ofertaId)); guardarCart(); toast('Pedido guardado como borrador'); await cargar(); } else b.disabled = false;
  }
  else if (a === 'ped-msg') { const p = S.ped.find(x => x.id === id); if (p) compartirOCopiar(mensaje(p.proveedor, p.items || [], p.envio)); }
  else if (a === 'ped-del') dosPasos(b, async () => { await borrar('prov_pedidos', id); cargar(); });
  else if (a === 'gestion-pasar') { S.confGestion = id; render(); }
  else if (a === 'gestion-cancelar') { S.confGestion = null; render(); }
  else if (a === 'gestion-aplicar') {
    const p = S.ped.find(x => x.id === S.confGestion); if (!p) return;
    const items = planGestion(p).filter(x => x.c?.id).map(x => ({ id: x.c.id, cant: Math.trunc(Number(x.i.cant) || 0), costo: x.costoNuevo }));
    b.disabled = true; b.textContent = 'Actualizando...';
    const { error } = await sb.rpc('prov_recibir', { p_pedido: p.id, p_items: items });
    S.confGestion = null;
    toast(error ? 'No se pudo actualizar Gestión: ' + error.message : 'Stock y costos actualizados en Gestión');
    await cargar();
  }
  else if (a === 'imp-leer') { const url = $('#imp-url').value.trim(); if (!url) { toast('Pegá un link primero'); return; } importarSitio(url); }
  else if (a === 'seccion') { S.seccion = b.dataset.sec; S.secBuscar = ''; S.secProv = ''; render(); }
  else if (a === 'sel-quitar') { S.sel = S.sel.filter(x => x !== id); guardarSel(); render(); }
  else if (a === 'sel-limpiar') dosPasos(b, () => { S.sel = []; guardarSel(); render(); });
  else if (a === 'imp-detener') { detenerSitio = true; b.disabled = true; b.textContent = 'Deteniendo...'; }
  else if (a === 'imp-guardar-sitio') guardarSitio(b.dataset.modo, b);
  else if (a === 'actualizar-sitio') { const p = provById(id); if (p?.url) { location.hash = 'proveedores'; importarSitio(p.url, p.id); window.scrollTo({ top: 0 }); } }
  else if (a === 'imp-texto') { const t = $('#imp-texto').value.trim(); if (!t) { toast('Pegá el texto primero'); return; } const url = $('#imp-url').value.trim(); importar({ accion: 'texto', texto: t.slice(0, 100000), url }, url); }
  else if (a === 'imp-cerrar') { S.importe = null; render(); }
  else if (a === 'imp-guardar') {
    const r = S.importe.res; let dest = $('#imp-dest').value;
    const marcados = (r.productos || []).map((p, i) => ({ p, ok: $('#imp-ok-' + i)?.checked, ref: $('#imp-ref-' + i)?.value })).filter(x => x.ok);
    if (!marcados.length) { toast('Marcá al menos un producto'); return; }
    b.disabled = true;
    if (dest === '__nuevo') {
      const pv = r.proveedor || {};
      let host = ''; try { host = new URL(/^https?:\/\//.test(S.importe.url) ? S.importe.url : 'https://' + S.importe.url).hostname.replace('www.', ''); } catch (e) {}
      dest = await guardar('prov_proveedores', null, { nombre: pv.nombre || host || 'Proveedor nuevo', url: S.importe.url || '', tipo: 'Mayorista web', ubicacion: pv.ubicacion || '', envio_costo: pv.envio_costo ?? null, dias_min: pv.dias_min ?? null, dias_max: pv.dias_max ?? null, minimo: pv.minimo ?? null, pago: pv.pago || '', resena_puntaje: pv.resena_puntaje ?? null, resena_cant: pv.resena_cant ?? null, factura: !!pv.factura, garantia: !!pv.garantia, notas: 'Cargado desde la página el ' + hoy() });
    }
    if (dest) {
      const { error } = await sb.from('prov_ofertas').insert(marcados.map(x => ({ proveedor_id: dest, nombre: x.p.nombre, ref: x.ref || '', precio: x.p.precio, categoria: x.p.categoria || '' })));
      if (error) toast('No se pudieron guardar los precios'); else { toast(`${marcados.length} precios guardados`); S.importe = null; S.abierto = dest; }
    }
    await cargar();
  }
  else if (a === 'gan-buscar') buscarGanadores($('#gan-foco').value.trim());
  else if (a === 'gan-del') { await borrar('prov_ganadores', id); cargar(); }
  else if (a === 'gan-comparar') { S.buscar = b.dataset.q.split(' ').slice(0, 2).join(' '); location.hash = 'comparar'; }
});

document.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === 'login') return entrar();
  if (f.id === 'formProv') {
    const g = (k) => $('#fp-' + k)?.value.trim();
    const data = { nombre: g('nombre'), url: g('url'), tipo: g('tipo'), ubicacion: g('ubicacion'), envio_costo: num(g('envio_costo')), dias_min: num(g('dias_min')), dias_max: num(g('dias_max')), minimo: num(g('minimo')), pago: g('pago'), resena_puntaje: num(g('resena_puntaje')), resena_cant: num(g('resena_cant')), anios: num(g('anios')), factura: $('#fp-factura').checked, garantia: $('#fp-garantia').checked, compre: $('#fp-compre').checked, notas: g('notas') };
    if (data.resena_puntaje != null) data.resena_puntaje = Math.max(0, Math.min(5, data.resena_puntaje));
    const prev = S.editProv !== 'nuevo' ? provById(S.editProv) : null;
    const ok = await guardar('prov_proveedores', prev ? prev.id : null, data);
    if (ok) { S.editProv = null; S.abierto = ok; toast('Proveedor guardado'); await cargar(); }
  } else if (f.dataset.form === 'ofe') {
    const pid = f.dataset.prov, nombre = $('#fo-nombre-' + pid).value.trim(), precio = num($('#fo-precio-' + pid).value), ref = $('#fo-ref-' + pid).value;
    if (!nombre || !precio) { toast('Completá producto y precio'); return; }
    const ok = await guardar('prov_ofertas', null, { proveedor_id: pid, nombre, ref, precio, categoria: catByName(ref)?.categoria || '' });
    if (ok) { toast('Precio agregado'); await cargar(); }
  }
});

let tBus;
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'buscar') { S.buscar = t.value; clearTimeout(tBus); tBus = setTimeout(render, 250); }
  else if (t.id === 'sec-buscar') { S.secBuscar = t.value; clearTimeout(tBus); tBus = setTimeout(render, 250); }
  else if (t.id === 'imp-filtro' && S.importe) { S.importe.filtro = t.value; clearTimeout(tBus); tBus = setTimeout(render, 250); }
  else if (t.id === 'cantRes' || t.id === 'cantCmp') { S.cant = Math.max(1, parseInt(t.value) || 1); clearTimeout(tBus); tBus = setTimeout(render, 400); }
});
document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.id === 'imp-todo') { S.leerTodo = t.checked; return; }
  if (t.dataset.sel) { const id = t.dataset.sel; S.sel = t.checked ? [...new Set([...S.sel, id])] : S.sel.filter(x => x !== id); guardarSel(); render(); if (t.checked) toast('Agregado a Mi comparación'); return; }
  if (t.id === 'sec-prov') { S.secProv = t.value; render(); return; }
  if (t.id === 'sec-orden') { S.secOrden = t.value; render(); return; }
  if (t.id === 'sec-stock') { S.secStock = t.checked; render(); return; }
  if (t.id === 'filtroCmp') { S.filtroCmp = t.value; render(); return; }
  if (t.id?.startsWith('imp-ref-') && S.importe?.res?.sitio) { const p = S.importe.res.productos[Number(t.id.slice(8))]; if (p) p.ref = t.value; return; }
  if (t.dataset.cart) { const c = S.cart.find(x => x.ofertaId === t.dataset.cart); if (c) { c.cant = Math.max(1, parseInt(t.value) || 1); guardarCart(); render(); } }
  else if (t.dataset.ped) { const ok = await guardar('prov_pedidos', t.dataset.ped, { estado: t.value }); if (ok) { toast('Estado actualizado'); await cargar(); } }
});

/* ---------- login ---------- */
function pintarLogin() {
  const crear = S.modoLogin === 'crear';
  $('#loginTitulo').textContent = crear ? 'Crear cuenta' : 'Entrar';
  $('#loginSub').textContent = crear ? 'Usá el email autorizado para Tecno Riv. Te va a llegar un mail para confirmarlo.' : 'Entrá con tu cuenta de Tecno Riv.';
  $('#lg-btn').textContent = crear ? 'Crear cuenta' : 'Entrar';
  $('#lg-modo').textContent = crear ? 'Ya tengo cuenta' : 'Crear cuenta';
  $('#lg-pass').autocomplete = crear ? 'new-password' : 'current-password';
  $('#lg-msg').textContent = '';
}
async function entrar() {
  const email = $('#lg-email').value.trim(), password = $('#lg-pass').value, msg = $('#lg-msg'), btn = $('#lg-btn');
  btn.disabled = true; msg.textContent = '';
  try {
    if (S.modoLogin === 'crear') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (!data.session) { msg.textContent = 'Listo. Revisá tu email y tocá el link para confirmar la cuenta. Después entrá acá.'; S.modoLogin = 'entrar'; setTimeout(pintarLogin, 6000); }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (e) {
    msg.textContent = /Invalid login/i.test(e.message) ? 'Email o contraseña incorrectos.' : /not confirmed/i.test(e.message) ? 'Todavía no confirmaste el email. Revisá tu correo.' : e.message;
  } finally { btn.disabled = false; }
}
function mostrar(sesion) {
  S.user = sesion?.user || null;
  $('#login').hidden = !!S.user; $('#app').hidden = !S.user; $('#sesion').hidden = !S.user;
  if (S.user) { $('#sesionEmail').textContent = S.user.email; irA(location.hash.slice(1) || 'resumen'); aviso('<span class="thinking">Cargando tus datos...</span>'); cargar(); }
  else pintarLogin();
}
sb.auth.onAuthStateChange((evento, sesion) => {
  if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'INITIAL_SESSION') { if ((sesion?.user?.id || null) !== (S.user?.id || null) || evento === 'INITIAL_SESSION') mostrar(sesion); }
});

/* ---------- app instalable ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
