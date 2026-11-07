// Prueba de «Anclar», «Volver ahí» y la bitácora de post-its en la hoja, con dos pestañas reales,
// Tampermonkey simulado y un receptor de Apps Script simulado (se puede apagar, o hacer viejo).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPT = readFileSync(path.join(raiz, 'tp-capturador.user.js'), 'utf8');
const H2C = readFileSync(require.resolve('html2canvas/dist/html2canvas.min.js'), 'utf8');
const ENDPOINT = 'https://script.google.com/macros/s/PRUEBA/exec';
const TOKEN = 'k'.repeat(40);
const CHAT = 'https://claude.ai/chat/1f2e3d4c-aaaa-bbbb-cccc-123456789abc';

// Un chat que carga sus mensajes un momento después de abrir, como claude.ai.
const PAGINA_CHAT = `<!doctype html><html><head><meta charset="utf-8"><title>Plan de respaldos - Claude</title></head>
<body style="font:16px Arial;padding:20px"><main id="chat"></main>
<script>
  setTimeout(() => {
    const m = document.getElementById('chat');
    for (let i = 0; i < 40; i++) { const p = document.createElement('p'); p.textContent = 'Mensaje de relleno número ' + i; m.append(p); }
    const p = document.createElement('p'); p.id = 'clave';
    p.textContent = 'Decidimos restaurar primero Chatwoot en el ASUS y medir el tiempo de recuperación.';
    m.append(p);
    for (let i = 40; i < 80; i++) { const q = document.createElement('p'); q.textContent = 'Mensaje de relleno número ' + i; m.append(q); }
  }, 1200);
  window.__teclas = 0;
</script></body></html>`;
const PAGINA_OTRA = `<!doctype html><html><head><meta charset="utf-8"><title>Otra página</title></head><body style="font:16px Arial;padding:20px">
  <p id="s1">Token de prueba sk-abcdefghijklmnopqrstuvwxyz123456 que no debe quedar.</p>
  <p id="s2">Punto clave: llamar a Fabián. Rama claude/g0-controles y ach-boveda-2026-10-29.</p></body></html>`;

const fallas = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + '  ' + m); if (!c) fallas.push(m); };

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
const paginas = new Set();
const memoria = { cfg: { endpoint: ENDPOINT, token: TOKEN, perfil: 'Perfil Prueba', hoja: '' } };
await ctx.exposeBinding('__gmSet', async (fuente, k, v) => {
  if (v === undefined) delete memoria[k]; else memoria[k] = v;
  for (const p of paginas) if (p !== fuente.page) p.evaluate(([k, v]) => window.__gmNotify && window.__gmNotify(k, v), [k, v]).catch(() => {});
});
await ctx.route('https://claude.ai/**', (r) => r.fulfill({ contentType: 'text/html', body: PAGINA_CHAT }));
await ctx.route('https://otra.local/**', (r) => r.fulfill({ contentType: 'text/html', body: PAGINA_OTRA }));

// Receptor simulado: 'nuevo' (conoce la pestaña Post-its), 'viejo' (responde vacio) o 'caido'.
let receptor = 'nuevo';
const filas = [];
await ctx.route(ENDPOINT, async (r) => {
  if (receptor === 'caido') return r.abort();
  const d = JSON.parse(r.request().postData());
  if (d.token !== TOKEN) return r.fulfill({ json: { ok: false, error: 'token' } });
  if (receptor === 'viejo' && d.tipo === 'postit') return r.fulfill({ json: { ok: false, error: 'vacio' } });
  filas.push(d);
  r.fulfill({ json: { ok: true, fila: filas.length + 1 } });
});

const SHIM = (mem) => `
  (() => {
    const orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (o) { const s = orig.call(this, o); window.__sombra = s; return s; /* cerrada, como en Chrome */ };
    const mem = ${JSON.stringify(mem)};
    const oyentes = {}; let n = 0;
    const avisar = (k, viejo, v, remoto) => Object.values(oyentes).filter((o) => o.k === k).forEach((o) => o.cb(k, viejo, v, remoto));
    window.__silencio = false; // simula el retraso con que Tampermonkey reparte un cambio a otra pestaña
    window.__gmNotify = (k, v) => { if (window.__silencio) { (window.__atrasados = window.__atrasados || []).push([k, v]); return; } const viejo = mem[k]; if (v === undefined) delete mem[k]; else mem[k] = v; avisar(k, viejo, v, true); };
    window.__ponerAlDia = () => { window.__silencio = false; (window.__atrasados || []).splice(0).forEach(([k, v]) => window.__gmNotify(k, v)); };
    window.GM_getValue = (k, d) => (k in mem && mem[k] != null ? JSON.parse(JSON.stringify(mem[k])) : d);
    window.GM_setValue = (k, v) => { const viejo = mem[k]; mem[k] = v == null ? null : JSON.parse(JSON.stringify(v)); window.__gmSet(k, mem[k]); avisar(k, viejo, mem[k], false); };
    window.GM_deleteValue = (k) => { delete mem[k]; window.__gmSet(k, undefined); };
    window.GM_listValues = () => Object.keys(mem).filter((k) => mem[k] != null);
    window.GM_addValueChangeListener = (k, cb) => { n++; oyentes[n] = { k, cb }; return n; };
    window.GM_removeValueChangeListener = (id) => { delete oyentes[id]; };
    window.GM_setClipboard = () => {};
    window.GM_registerMenuCommand = (t, fn) => { (window.__menu = window.__menu || []).push(t); (window.__menuFn = window.__menuFn || {})[t] = fn; };
    window.GM_addStyle = () => {};
    window.GM_openInTab = (u) => { (window.__tabs = window.__tabs || []).push(u); };
    window.GM_xmlhttpRequest = (o) => fetch(o.url, { method: o.method, body: o.data, headers: o.headers })
      .then(async (r) => o.onload({ status: r.status, responseText: await r.text() })).catch(() => o.onerror && o.onerror());
  })();`;

async function abrir(url) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fallas.push('error de página: ' + e.message));
  paginas.add(p);
  await p.goto(url);
  await p.evaluate(SHIM(memoria));
  await p.evaluate(H2C);
  await p.evaluate(SCRIPT);
  await p.waitForTimeout(300);
  return p;
}
const notas = () => Object.keys(memoria).filter((k) => k.startsWith('postit:') && memoria[k]).map((k) => memoria[k]).sort((a, b) => (b.orden || 0) - (a.orden || 0));
const textos = (p, sel) => p.evaluate((s) => [...window.__sombra.querySelectorAll(s)].map((n) => n.textContent), sel);
const clic = (p, sel, t) => p.evaluate(([s, t]) => { const b = [...window.__sombra.querySelectorAll(s)].find((x) => x.textContent.includes(t)); if (!b) return false; b.click(); return true; }, [sel, t]);
const seleccionar = (p, sel) => p.evaluate((s) => { const r = document.createRange(); r.selectNodeContents(document.querySelector(s)); getSelection().removeAllRanges(); getSelection().addRange(r); }, sel);
const esperarFilas = async (n, ms = 9000) => { const t0 = Date.now(); while (filas.length < n && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 200)); };
const HORA = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/;

// 1. Anclar un párrafo de un chat (Alt+K)
const A = await abrir(CHAT);
await A.waitForTimeout(1300);
await seleccionar(A, '#clave');
await A.keyboard.press('Alt+k');
await A.waitForTimeout(150);
let n = notas()[0] || {};
ok(n.titulo === 'Plan de respaldos - Claude', 'Alt+K crea un post-it con el título de la página');
ok(n.items && n.items[0] && n.items[0].texto.startsWith('Decidimos restaurar primero Chatwoot'), 'el texto seleccionado queda como tarea');
ok(n.origen && n.origen.url.startsWith(CHAT + '#:~:text=Decidimos%20restaurar%20primero'), `la dirección lleva el salto al párrafo: ${n.origen && n.origen.url}`);
ok(n.origen && HORA.test(n.origen.hora) && n.origen.sitio === 'claude.ai', 'el post-it guarda hora de Bogotá y sitio');
ok((await textos(A, '.toast')).some((t) => t.startsWith('Anclado:')), 'avisa que quedó anclado');
ok((await textos(A, '.pmini .pm-t')).includes('Plan de respaldos - Claude'), 'el post-it aparece en la pila');

// 2. Bitácora: una fila en la hoja con todo lo pedido
await esperarFilas(1);
let f = filas[0] || {};
ok(f.tipo === 'postit' && f.id === n.id && f.estado === 'abierto', 'la hoja recibe la fila del post-it nuevo, estado abierto');
ok(HORA.test(f.hora) && f.tema === 'Plan de respaldos - Claude' && f.categoria && f.sitio === 'claude.ai' && f.perfil === 'Perfil Prueba', 'la fila trae hora, tema, categoría, sitio y perfil');
ok(f.url === n.origen.url && f.texto.startsWith('[ ] Decidimos restaurar'), 'la fila trae la dirección con el salto y el texto');
ok(f.token === TOKEN && f.evento && f.evento !== f.id, 'usa el mismo receptor y clave, con un id de evento propio');

// 3. Editar varias veces seguidas manda una sola fila; marcar hecho manda otra
await clic(A, '.pmini', 'Plan de respaldos');
await A.waitForTimeout(100);
await A.evaluate(() => { const t = window.__sombra.querySelector('.pt-titulo'); t.focus(); t.select(); });
await A.keyboard.type('Respaldos: decisión', { delay: 30 });
await A.waitForTimeout(500);
await clic(A, '.ptarjeta .pt-check', '');
await esperarFilas(2, 9000);
await A.waitForTimeout(800);
ok(filas.length === 2, `teclear y marcar en seguida juntan los cambios en una sola fila (llegaron ${filas.length - 1})`);
f = filas.at(-1) || {};
ok(f.tema === 'Respaldos: decisión' && f.estado === 'hecho', 'la fila nueva trae el tema editado y el estado hecho');
ok(filas[0].tema === 'Plan de respaldos - Claude', 'la fila anterior no se toca: solo se agregan filas');

// 4. «Volver ahí» desde otra página abre el chat y salta al párrafo
const B = await abrir('https://otra.local/pagina');
await B.waitForTimeout(200);
await clic(B, '.pmini', 'Respaldos: decisión');
await B.waitForTimeout(100);
ok(await clic(B, '.ptarjeta .pt-icono', 'Volver ahí'), 'el post-it tiene el botón «Volver ahí»');
const abiertas = await B.evaluate(() => window.__tabs || []);
ok(abiertas.at(-1) === n.origen.url, 'abre la dirección guardada, con el salto al párrafo');
await A.close(); paginas.delete(A);
const C = await abrir(CHAT); // la pestaña que abrió «Volver ahí»
await C.waitForTimeout(3500);
const hallado = await C.evaluate(() => getSelection().toString());
ok(hallado.startsWith('Decidimos restaurar primero Chatwoot'), 'en el chat, espera a que cargue y marca el párrafo anclado');
ok((await textos(C, '.toast')).some((t) => t.includes('Aquí estaba')), 'avisa «Aquí estaba lo que anclaste»');
ok(await C.evaluate(() => { const r = document.getElementById('clave').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'el párrafo queda a la vista');

// 5. Anclar sin selección y «Nuevo post-it»: los dos guardan el origen
await B.bringToFront();
await B.evaluate(() => getSelection().removeAllRanges());
await B.mouse.click(600, 600);
await B.keyboard.press('Alt+k');
await B.waitForTimeout(150);
n = notas()[0];
ok(n.titulo === 'Otra página' && !n.items.length && n.origen.url === 'https://otra.local/pagina' && !n.ancla, 'anclar sin selección guarda título, hora y dirección sin salto');
await clic(B, '.pnuevo', '+ Nuevo');
await B.waitForTimeout(100);
n = notas()[0];
ok(n.origen && n.origen.url === 'https://otra.local/pagina' && HORA.test(n.origen.hora), '«+ Nuevo» también guarda el origen');
await B.keyboard.type('Llamar al proveedor');
await B.keyboard.press('Escape');

// 6. Secretos: no entran al post-it, ni a la dirección, ni a la hoja
await B.mouse.click(600, 600);
await seleccionar(B, '#s1');
await B.keyboard.press('Alt+k');
await B.waitForTimeout(200);
n = notas()[0];
ok(!JSON.stringify(n).includes('sk-abcdef'), 'una clave seleccionada no queda guardada en el post-it');
ok(n.items[0].texto.includes('[secreto omitido]') && !n.ancla && !n.origen.url.includes(':~:'), 'se tapa, y la dirección no lleva el texto para el salto');
ok((await textos(B, '.toast')).some((t) => t.includes('parecía un secreto')), 'avisa que tapó un secreto');
await B.mouse.click(600, 600);
await seleccionar(B, '#s2');
await B.keyboard.press('Alt+k');
await B.waitForTimeout(200);
ok(notas()[0].items[0].texto === 'Punto clave: llamar a Fabián. Rama claude/g0-controles y ach-boveda-2026-10-29.', 'el texto normal no se tapa (control: «clave:», ramas y fechas)');
await B.mouse.click(600, 600);
await B.evaluate(() => window.__sombra.querySelector('.pmini').click()); // el más nuevo
await B.waitForTimeout(100);
await B.evaluate(() => { const c = window.__sombra.querySelector('.pt-contexto'); c.focus(); });
await B.keyboard.type('acceso: password=Xy7!kQ2#mn9');
await B.waitForTimeout(600);
ok(notas()[0].contexto === 'acceso: password=[secreto omitido]', 'una clave escrita a mano en las notas también se tapa');
await B.keyboard.press('Escape');
await esperarFilas(filas.length + 1, 9000);
await B.waitForTimeout(6500);
ok(!filas.some((x) => /sk-abcdef|Xy7!kQ2/.test(JSON.stringify(x))), 'ninguna fila de la hoja lleva una clave');

// 7. Archivar manda una fila con estado «archivado»
const antesBorrar = filas.length;
await B.evaluate(() => window.__sombra.querySelector('.pmini').click());
await B.waitForTimeout(80);
await clic(B, '.ptarjeta .pt-icono', 'Archivar');
await esperarFilas(antesBorrar + 1);
ok(filas.at(-1).estado === 'archivado' && filas.at(-1).tema.startsWith('Otra página'), 'archivar un post-it deja una fila con estado archivado');

// 8. Sin conexión: la fila queda en la cola y sale después, sin perder nada
receptor = 'caido';
const antesCaida = filas.length;
await B.mouse.click(600, 600);
await B.keyboard.press('Alt+k');
await B.waitForTimeout(6800);
let cola = memoria.cola || [];
ok(cola.some((x) => x.tipo === 'postit') && filas.length === antesCaida, 'sin conexión, la fila queda en la cola');
ok(cola.every((x) => !x.token), 'la cola no guarda la clave de la hoja');
receptor = 'viejo';
await B.mouse.click(600, 600);
await clic(B, '.pnuevo', '+ Nuevo');
await B.keyboard.type('Con el receptor viejo');
await B.keyboard.press('Escape');
await B.waitForTimeout(6800);
ok((memoria.cola || []).filter((x) => x.tipo === 'postit').length === 2, 'si el receptor aún no conoce la pestaña Post-its, también queda en cola');
receptor = 'nuevo';
await B.evaluate(() => { window.__menu = []; });
await B.evaluate(SCRIPT.replace(/registrarComandos\(\);\n  if \(sitioDesactivado\(\)\) return;[\s\S]*$/, 'registrarComandos(); })();'));
await B.evaluate(() => window.__menuFn[window.__menu.find((t) => t.startsWith('Enviar pendientes'))]());
await B.waitForTimeout(800);
ok(filas.length === antesCaida + 2 && !(memoria.cola || []).length, 'al volver la conexión, «Enviar pendientes» manda las dos filas');

// 9. Perfil sin activar: no se pierde, queda en cola para cuando se active
const cfgGuardada = memoria.cfg;
await B.evaluate(() => GM_setValue('cfg', Object.assign(GM_getValue('cfg', {}), { endpoint: '', token: '' })));
await B.mouse.click(600, 600);
await B.keyboard.press('Alt+k');
await B.waitForTimeout(6800);
ok((memoria.cola || []).some((x) => x.tipo === 'postit'), 'sin activar, la fila queda en cola');
await B.evaluate((c) => GM_setValue('cfg', c), cfgGuardada);

// 10. La página borra la interfaz: se repone sola, sin duplicarse
const E = await abrir('https://otra.local/spa');
await E.evaluate(() => document.querySelector('tp-capturador').remove());
await E.waitForTimeout(1800);
ok(await E.evaluate(() => document.querySelectorAll('tp-capturador').length === 1 && window.__sombra.querySelectorAll('.pdock').length === 1), 'si la página borra la interfaz, vuelve sola y sin duplicarse');
await E.evaluate(() => { document.body.innerHTML = '<p>Página rehecha</p>'; });
await E.waitForTimeout(300);
ok(await E.evaluate(() => !!document.querySelector('tp-capturador') && window.__sombra.querySelectorAll('.pmini').length > 0), 'reemplazar todo el body no se lleva la interfaz');
await E.close(); paginas.delete(E);

// 11. Dos pestañas editan a la vez post-its distintos: no se pisan
const ahora = Date.now();
memoria['postit:px'] = { id: 'px', orden: ahora + 2, titulo: 'Equis original', cat: 'ideas', contexto: '', creada: ahora, items: [] };
memoria['postit:py'] = { id: 'py', orden: ahora + 1, titulo: 'Ye original', cat: 'ideas', contexto: '', creada: ahora, items: [] };
const F = await abrir('https://otra.local/f');
const D = await abrir('https://otra.local/d');
await D.evaluate(() => { window.__silencio = true; }); // D todavía no ve lo que haga B, como pasa entre pestañas
const editar = async (p, viejo, nuevo) => {
  await p.evaluate((t) => [...window.__sombra.querySelectorAll('.pmini')].find((m) => m.title === t).click(), viejo);
  await p.waitForTimeout(80);
  await p.evaluate(() => { const t = window.__sombra.querySelector('.pt-titulo'); t.focus(); t.select(); });
  await p.keyboard.type(nuevo);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
};
await editar(F, 'Equis original', 'X cambiado en B');
await editar(D, 'Ye original', 'Y cambiado en D');
await D.evaluate(() => window.__ponerAlDia());
await D.waitForTimeout(150);
ok(memoria['postit:px'].titulo === 'X cambiado en B' && memoria['postit:py'].titulo === 'Y cambiado en D', 'dos pestañas que editan post-its distintos a la vez conservan los dos cambios');
ok((await textos(D, '.pmini .pm-t')).includes('X cambiado en B'), 'y cada pestaña termina viendo el cambio de la otra');

await nav.close();
console.log(fallas.length ? `\n${fallas.length} FALLAS` : '\nTodo en orden.');
process.exit(fallas.length ? 1 : 0);
