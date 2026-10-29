// Prueba de los post-its: dos pestañas reales de Chromium con Tampermonkey simulado y memoria compartida.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPT = readFileSync(path.join(raiz, 'tp-capturador.user.js'), 'utf8');
const H2C = readFileSync(require.resolve('html2canvas/dist/html2canvas.min.js'), 'utf8');

const PAGINA = `<!doctype html><html><head><meta charset="utf-8"><title>Tablero de prueba</title></head>
<body style="font:16px Arial;padding:20px;min-height:1400px">
  <p id="p1">Llamar a Fabián por la cotización del salón</p>
  <p id="p2">Revisar respaldos de Contabo antes del viernes</p>
  <script>window.__teclas = 0; document.addEventListener('keydown', () => { window.__teclas++; });</script>
</body></html>`;

const fallas = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + '  ' + m); if (!c) fallas.push(m); };

const hoyBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const menosDias = (iso, d) => new Date(Date.parse(iso + 'T12:00:00Z') - d * 864e5).toISOString().slice(0, 10);
const HOY = hoyBogota(), AYER = menosDias(HOY, 1);

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
const paginas = new Set();
const memoria = {};
await ctx.exposeBinding('__gmSet', async (fuente, k, v) => {
  memoria[k] = v;
  for (const p of paginas) if (p !== fuente.page) p.evaluate(([k, v]) => window.__gmNotify && window.__gmNotify(k, v), [k, v]).catch(() => {});
});
await ctx.route('https://prueba.local/**', (r) => r.fulfill({ contentType: 'text/html', body: PAGINA }));

const SHIM = (mem) => `
  (() => {
    const orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (o) { const s = orig.call(this, Object.assign({}, o, { mode: 'open' })); window.__sombra = s; return s; };
    const mem = ${JSON.stringify(mem)};
    const oyentes = {}; let n = 0;
    const avisar = (k, viejo, v, remoto) => Object.values(oyentes).filter((o) => o.k === k).forEach((o) => o.cb(k, viejo, v, remoto));
    window.__gmNotify = (k, v) => { const viejo = mem[k]; mem[k] = v; avisar(k, viejo, v, true); };
    window.GM_getValue = (k, d) => (k in mem && mem[k] !== undefined && mem[k] !== null ? JSON.parse(JSON.stringify(mem[k])) : d);
    window.GM_setValue = (k, v) => { const viejo = mem[k]; mem[k] = v === undefined ? null : JSON.parse(JSON.stringify(v)); window.__gmSet(k, mem[k]); avisar(k, viejo, mem[k], false); };
    window.GM_addValueChangeListener = (k, cb) => { n++; oyentes[n] = { k, cb }; return n; };
    window.GM_removeValueChangeListener = (id) => { delete oyentes[id]; };
    window.GM_listValues = () => Object.keys(mem);
    window.GM_deleteValue = (k) => { delete mem[k]; window.__gmSet(k, undefined); };
    window.GM_setClipboard = (t) => { window.__clip = t; };
    window.GM_registerMenuCommand = (t, fn) => { (window.__menu = window.__menu || []).push(t); (window.__menuFn = window.__menuFn || {})[t] = fn; };
    window.GM_addStyle = () => {};
    window.GM_openInTab = (u) => { (window.__tabs = window.__tabs || []).push(u); };
    window.GM_xmlhttpRequest = (o) => o.onerror && o.onerror();
  })();`;

async function abrirPestana(url) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fallas.push('error de página: ' + e.message));
  p.on('dialog', (d) => d.accept(p.__respuesta));
  paginas.add(p);
  await p.goto(url);
  await p.evaluate(SHIM(memoria));
  await p.evaluate(H2C);
  await p.evaluate(SCRIPT);
  await p.waitForTimeout(300);
  return p;
}
const sombra = (p, fn, arg) => p.evaluate(fn, arg);
const textos = (p, sel) => p.evaluate((s) => [...window.__sombra.querySelectorAll(s)].map((n) => n.textContent), sel);
const clic = (p, sel, texto) => p.evaluate(([s, t]) => {
  const b = [...window.__sombra.querySelectorAll(s)].find((x) => !t || x.textContent.trim().startsWith(t));
  if (!b) return false; b.click(); return true;
}, [sel, texto || '']);
const estado = () => JSON.parse(JSON.stringify(memoria.postits || { notas: [], papelera: [] }));
async function seleccionar(p, id) {
  await p.evaluate((i) => { const r = document.createRange(); r.selectNodeContents(document.getElementById(i)); getSelection().removeAllRanges(); getSelection().addRange(r); }, id);
}
async function clicDerecho(p, id) {
  const b = await p.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return { x: r.left + 20, y: r.top + 8 }; }, id);
  await p.evaluate(([x, y]) => document.getElementById('p1').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })), [b.x, b.y]);
  await p.waitForTimeout(80);
}

// 1. Primer arranque: pestaña visible, sin pregunta de día nuevo
const A = await abrirPestana('https://prueba.local/tablero?token=SECRETO#x');
await A.waitForTimeout(1400);
ok((await textos(A, '.ptab')).some((t) => t.startsWith('Post-its')), 'la pestaña «Post-its» aparece en el borde derecho');
ok(!(await textos(A, '.pmodal')).length, 'sin post-its no hay pregunta de día nuevo');
ok(estado().dia === HOY, 'el día de trabajo queda en la fecha de Bogotá');

// 2. Selección › clic derecho › Agregar post-it › Nuevo post-it con esto
await seleccionar(A, 'p1');
await clicDerecho(A, 'p1');
ok(await clic(A, '.menu button', 'Agregar post-it'), 'clic derecho con selección ofrece «Agregar post-it…»');
await A.waitForTimeout(50);
ok(await clic(A, '.menu button', 'Nuevo post-it con esto'), 'el submenú ofrece «Nuevo post-it con esto»');
await A.waitForTimeout(100);
let e = estado();
ok(e.notas.length === 1 && e.notas[0].items[0].texto === 'Llamar a Fabián por la cotización del salón', 'se crea el post-it con lo seleccionado como tarea');
ok(e.notas[0].items[0].url === 'https://prueba.local/tablero', 'la tarea guarda la página de origen sin parámetros (no se lleva el token de la URL)');
ok(await sombra(A, () => window.__sombra.activeElement && window.__sombra.activeElement.classList.contains('pt-titulo')), 'la tarjeta se abre con el cursor en el título');

// 3. Escribir el título no dispara los atajos de la página
const antes = await A.evaluate(() => window.__teclas);
await A.keyboard.type('Clientes hoy');
await A.waitForTimeout(450);
ok(estado().notas[0].titulo === 'Clientes hoy', 'el título se guarda solo al escribir');
ok((await A.evaluate(() => window.__teclas)) === antes, 'las teclas escritas en el post-it no llegan a los atajos de la página');

// 4. Agregar tareas, marcar una como hecha
await A.keyboard.press('Enter'); // del título salta a «Agregar tarea»
await A.keyboard.type('Enviar propuesta a Albania');
await A.keyboard.press('Enter');
await A.keyboard.type('Confirmar reunión con la Alcaldía');
await A.keyboard.press('Enter');
await A.waitForTimeout(100);
ok(estado().notas[0].items.length === 3, 'Enter en «Agregar tarea» suma tareas y deja el cursor listo para la siguiente');
await clic(A, '.ptarjeta .pt-check');
await A.waitForTimeout(80);
ok(estado().notas[0].items[0].hecho === true, 'el cuadro marca la tarea como hecha');
ok((await textos(A, '.pmini .pm-prog')).some((t) => t.includes('1/3')), 'el post-it pequeño muestra el avance 1/3');

// 5. Categoría
await clic(A, '.ptarjeta .pt-chip');
ok(await clic(A, '.pt-cat', 'Comercial'), 'el selector ofrece las categorías');
await A.waitForTimeout(80);
ok(estado().notas[0].cat === 'comercial', 'la categoría cambia a Comercial');
ok((await textos(A, '.pmini .pm-cat')).some((t) => t.startsWith('Comercial')), 'el post-it pequeño muestra la categoría');

// 6. Clic fuera cierra la tarjeta; un post-it vacío abandonado no se queda
await A.mouse.click(600, 500);
ok(!(await textos(A, '.ptarjeta')).length, 'clic fuera cierra la tarjeta');
await clic(A, '.pnuevo');
await A.waitForTimeout(60);
ok(estado().notas.length === 2, '«+ Nuevo» crea un post-it');
await A.keyboard.press('Escape');
await A.waitForTimeout(60);
ok(estado().notas.length === 1, 'Esc sobre un post-it nuevo sin nada escrito lo descarta');

// 7. Agregar como tarea a uno existente, desde la barra de selección
await A.evaluate(() => getSelection().removeAllRanges());
const r2 = await A.evaluate(() => { const r = document.getElementById('p2').getBoundingClientRect(); return { x: r.left + 5, y: r.top + 8, x2: r.left + 300 }; });
await A.mouse.move(r2.x, r2.y); await A.mouse.down(); await A.mouse.move(r2.x2, r2.y, { steps: 5 }); await A.mouse.up();
await A.waitForTimeout(120);
ok(await clic(A, '.barra button', 'Post-it'), 'la barra al seleccionar tiene el botón «Post-it»');
await A.waitForTimeout(50);
ok(await clic(A, '.menu button', 'Clientes hoy'), 'el submenú lista los post-its existentes');
await A.waitForTimeout(80);
ok(estado().notas[0].items.at(-1).texto.startsWith('Revisar respaldos de Contabo'), 'la selección se suma como tarea del post-it elegido');

// 8. Segunda pestaña: ve lo mismo y los cambios viajan entre pestañas
const B = await abrirPestana('https://prueba.local/otra');
await B.waitForTimeout(300);
ok((await textos(B, '.pmini .pm-t')).includes('Clientes hoy'), 'otra pestaña del perfil muestra el mismo post-it');
await clic(A, '.pmini');
await A.waitForTimeout(60);
await clic(A, '.ptarjeta .pt-fila:nth-child(2) .pt-check');
await A.waitForTimeout(150);
ok((await textos(B, '.pmini .pm-prog')).some((t) => t.includes('2/4')), 'marcar una tarea en una pestaña se refleja en la otra');
await A.keyboard.press('Escape');

// 9. Filtro por categoría
await A.evaluate(() => { const e = GM_getValue('postits'); e.notas.push({ id: 'z1', titulo: 'Idea de estados', cat: 'ideas', contexto: '', creada: Date.now(), items: [] }); GM_setValue('postits', e); });
await A.evaluate(() => window.__sombra.querySelector('.ptab').click()); await A.evaluate(() => window.__sombra.querySelector('.ptab').click());
await A.waitForTimeout(60);
ok((await textos(A, '.pmini')).length === 2, 'con dos categorías se ven los dos post-its');
await A.evaluate(() => window.__sombra.querySelector('.pfiltros .dot[title="Ideas"]').click());
await A.waitForTimeout(40);
const filtrados = await textos(A, '.pmini .pm-t');
ok(filtrados.length === 1 && filtrados[0] === 'Idea de estados', 'el filtro de color deja solo esa categoría');
await clic(A, '.pfiltros .todas');

// 10. Alt+N pliega y despliega
await A.mouse.click(600, 500);
await A.keyboard.press('Alt+n');
await A.waitForTimeout(40);
ok(await A.evaluate(() => window.__sombra.querySelector('.pdock').classList.contains('plegado')), 'Alt+N pliega los post-its');
await A.keyboard.press('Alt+n');
await A.waitForTimeout(40);
ok(!(await A.evaluate(() => window.__sombra.querySelector('.pdock').classList.contains('plegado'))), 'Alt+N los vuelve a mostrar');

// 11. Borrar y recuperar
await A.evaluate(() => { [...window.__sombra.querySelectorAll('.pmini')].find((m) => m.textContent.includes('Idea de estados')).click(); });
await A.waitForTimeout(40);
await clic(A, '.ptarjeta .pt-icono', 'Borrar');
await A.waitForTimeout(60);
e = estado();
ok(e.notas.length === 1 && e.papelera.length === 1, 'borrar un post-it lo manda a la papelera');
await A.evaluate(() => { window.__menu = []; });
await A.evaluate(SCRIPT.replace(/registrarComandos\(\);\n  if \(sitioDesactivado\(\)\) return;[\s\S]*$/, 'registrarComandos(); })();'));
ok((await A.evaluate(() => window.__menu)).some((t) => t.startsWith('Recuperar post-its borrados (1)')), 'el menú de Tampermonkey ofrece recuperarlo');
await A.evaluate(() => window.__menuFn[window.__menu.find((t) => t.startsWith('Recuperar'))]());
await A.waitForTimeout(40);
ok(await clic(A, '.menu button', 'Idea de estados'), 'la papelera lista el post-it borrado');
await A.waitForTimeout(60);
ok(estado().notas.length === 2 && !estado().papelera.length, 'recuperar lo devuelve a la pila');

// 12. Categorías: crear una nueva
A.__respuesta = 'Hermes';
await A.evaluate(() => window.__menuFn['Categorías de post-its']());
await A.waitForTimeout(40);
await clic(A, '.pmodal footer button', '+ Nueva categoría');
await A.waitForTimeout(60);
ok((memoria['postits:cats'] || []).some((c) => c.nombre === 'Hermes'), 'se crea una categoría nueva');
await clic(A, '.pmodal footer button', 'Listo');
A.__respuesta = undefined;

// 13. Día nuevo: control negativo (mismo día, no pregunta)
await A.close(); await B.close(); paginas.clear();
memoria['postits:revision'] = null; // que ningún turno viejo tape el control
let C = await abrirPestana('https://prueba.local/hoy');
await C.waitForTimeout(1500);
ok(!(await textos(C, '.pmodal')).length, 'el mismo día no vuelve a preguntar (control negativo)');
await C.close(); paginas.clear();

// 14. Día nuevo: pregunta y «Solo lo pendiente»
const DIA_ANTERIOR = (notas) => ({ dia: AYER, papelera: [], notas });
const t0 = Date.now() - 864e5;
const NOTAS = () => [
  { id: 'n1', titulo: 'Mezcla', cat: 'comercial', contexto: '', creada: t0, items: [{ id: 'a', texto: 'pendiente', hecho: false }, { id: 'b', texto: 'hecha', hecho: true }] },
  { id: 'n2', titulo: 'Terminada', cat: 'operacion', contexto: '', creada: t0, items: [{ id: 'c', texto: 'hecha', hecho: true }] },
  { id: 'n3', titulo: 'Solo título', cat: 'ideas', contexto: '', creada: t0, items: [] },
];
memoria.postits = DIA_ANTERIOR(NOTAS()); memoria['postits:revision'] = null; memoria['postits:pospuesto'] = 0;
C = await abrirPestana('https://prueba.local/manana');
await C.waitForTimeout(1500);
const cab = (await textos(C, '.pmodal h2'))[0] || '';
ok(cab.startsWith('Buen día. Hoy es'), 'al abrir el día nuevo aparece la pregunta');
ok(((await textos(C, '.pmodal header p'))[0] || '').includes('3 post-its de ayer: 1 tareas pendientes y 2 hechas'), 'la pregunta resume lo que quedó de ayer');
ok((await textos(C, '.pmini .pm-edad')).length === 3, 'los post-its que vienen de días anteriores muestran su edad');
await clic(C, '.pm-acciones button', 'Solo lo pendiente');
await C.waitForTimeout(80);
e = estado();
ok(e.dia === HOY, 'decidir fija el día de trabajo en hoy');
ok(e.notas.map((n) => n.id).join() === 'n1,n3', '«Solo lo pendiente» quita el post-it terminado y deja el de solo título');
ok(e.notas[0].items.length === 1 && e.notas[0].items[0].texto === 'pendiente', '«Solo lo pendiente» quita las tareas hechas');
ok(e.papelera.some((n) => n.id === 'n2'), 'el post-it terminado queda en la papelera');
ok(!(await textos(C, '.pmodal')).length && memoria['postits:revision'] === null, 'la pregunta se cierra y suelta el turno');
await C.close(); paginas.clear();

// 15. «Borrar todos» y «Aplicar mi selección»
memoria.postits = DIA_ANTERIOR(NOTAS());
C = await abrirPestana('https://prueba.local/manana');
await C.waitForTimeout(1500);
await clic(C, '.pm-acciones button', 'Borrar todos');
await C.waitForTimeout(80);
ok(!estado().notas.length && estado().papelera.length === 3, '«Borrar todos» deja el día en blanco y todo en la papelera');
await C.close(); paginas.clear();

memoria.postits = DIA_ANTERIOR(NOTAS());
C = await abrirPestana('https://prueba.local/manana');
await C.waitForTimeout(1500);
await C.evaluate(() => [...window.__sombra.querySelectorAll('.pm-nota')].find((n) => n.textContent.includes('Terminada')).click());
await clic(C, '.pmodal footer button', 'Aplicar mi selección');
await C.waitForTimeout(80);
e = estado();
ok(e.notas.map((n) => n.id).join() === 'n1,n3' && e.notas[0].items.length === 2, '«Aplicar mi selección» deja los marcados tal como estaban y quita el desmarcado');
await C.close(); paginas.clear();

// 16. Una sola pestaña pregunta: con el turno tomado por otra pestaña reciente, no pregunta
memoria.postits = DIA_ANTERIOR(NOTAS());
memoria['postits:revision'] = { id: 'otra-pestana', t: Date.now() };
C = await abrirPestana('https://prueba.local/manana');
await C.waitForTimeout(1500);
ok(!(await textos(C, '.pmodal')).length, 'si otra pestaña ya está preguntando, esta no repite la pregunta');
await C.close(); paginas.clear();
memoria['postits:revision'] = { id: 'otra-pestana', t: Date.now() - 10 * 60e3 };
C = await abrirPestana('https://prueba.local/manana');
await C.waitForTimeout(1500);
ok((await textos(C, '.pmodal')).length === 1, 'si esa pestaña se cerró sin decidir (turno vencido), la pregunta vuelve (control negativo)');
await clic(C, '.pmodal footer button', 'Decidir en una hora');
await C.waitForTimeout(60);
ok(estado().dia === AYER && memoria['postits:pospuesto'] > Date.now() + 50 * 60e3, '«Decidir en una hora» no toca nada y pospone la pregunta');
await C.close();

await nav.close();
console.log(fallas.length ? `\n${fallas.length} FALLAS` : '\nTodo en orden.');
process.exit(fallas.length ? 1 : 0);
