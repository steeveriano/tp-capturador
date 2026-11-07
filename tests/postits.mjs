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
    Element.prototype.attachShadow = function (o) { const s = orig.call(this, o); window.__sombra = s; return s; /* cerrada, como en Chrome */ };
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
// Estado reconstruido desde las claves por post-it («postit:<id>»), como lo lee el script.
const estado = () => {
  const todas = Object.keys(memoria).filter((k) => k.startsWith('postit:') && memoria[k]).map((k) => JSON.parse(JSON.stringify(memoria[k])));
  return {
    dia: memoria['postits:dia'] || '',
    notas: todas.filter((n) => !n.borrada).sort((a, b) => (b.orden || 0) - (a.orden || 0)),
    papelera: todas.filter((n) => n.borrada).sort((a, b) => b.borrada - a.borrada),
  };
};
// Siembra en el formato anterior (una sola clave «postits»): el script la migra al cargar.
const sembrar = (v) => { for (const k of Object.keys(memoria)) if (k.startsWith('postit:') || k === 'postits:dia') delete memoria[k]; memoria.postits = v; };
async function seleccionar(p, id) {
  await p.evaluate((i) => { const r = document.createRange(); r.selectNodeContents(document.getElementById(i)); getSelection().removeAllRanges(); getSelection().addRange(r); }, id);
}
async function clicDerecho(p, id) {
  const b = await p.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return { x: r.left + 20, y: r.top + 8 }; }, id);
  await p.evaluate(([x, y]) => document.getElementById('p1').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })), [b.x, b.y]);
  await p.waitForTimeout(80);
}

// 1. Primer arranque: pestaña visible, sin pregunta de día nuevo
const A = await abrirPestana('https://prueba.local/tablero?token=SECRETO&resume=local-abc123&k=Ab3Xy9Qw7Zt2Lm8Np4Rs6Uv#x');
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
const u0 = e.notas[0].items[0].url;
ok(u0.startsWith('https://prueba.local/tablero?resume=local-abc123#:~:text=Llamar%20a%20Fabi'), `la dirección conserva el chat (?resume=) y salta al párrafo: ${u0}`);
ok(!/SECRETO|Ab3Xy9|token|#x/.test(u0), 'la dirección no se lleva el token, ni valores con forma de clave, ni el fragmento original');
ok(e.notas[0].origen && e.notas[0].origen.url === u0 && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(e.notas[0].origen.hora), 'el post-it guarda su origen con la hora de Bogotá');
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
await A.evaluate(() => { GM_setValue('postit:z1', { id: 'z1', orden: 1, titulo: 'Idea de estados', cat: 'ideas', contexto: '', creada: Date.now(), items: [] }); GM_setValue('postits:cambio', { t: Date.now() }); });
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

// 11. Archivar y recuperar: nunca se borra
await A.evaluate(() => { [...window.__sombra.querySelectorAll('.pmini')].find((m) => m.textContent.includes('Idea de estados')).click(); });
await A.waitForTimeout(40);
ok(!(await textos(A, '.ptarjeta .pt-icono')).some((t) => t === 'Borrar'), 'la tarjeta no tiene botón «Borrar»');
await clic(A, '.ptarjeta .pt-icono', 'Archivar');
await A.waitForTimeout(60);
e = estado();
ok(e.notas.length === 1 && e.papelera.length === 1 && e.papelera[0].titulo === 'Idea de estados', 'archivar saca el post-it de la pila y lo guarda en el archivo');
await A.evaluate(() => { window.__menu = []; });
await A.evaluate(SCRIPT.replace(/registrarComandos\(\);\n  if \(sitioDesactivado\(\)\) return;[\s\S]*$/, 'registrarComandos(); })();'));
ok((await A.evaluate(() => window.__menu)).some((t) => t.startsWith('Archivo de post-its (1)')), 'el menú de Tampermonkey ofrece el archivo');
await A.evaluate(() => window.__menuFn[window.__menu.find((t) => t.startsWith('Archivo de post-its'))]());
await A.waitForTimeout(40);
ok(await clic(A, '.menu button', 'Idea de estados'), 'el archivo lista el post-it archivado');
await A.waitForTimeout(60);
ok(estado().notas.length === 2 && !estado().papelera.length, 'recuperarlo lo devuelve a la pila');

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

// 14. Día nuevo: la pregunta no ofrece borrar; «Archivar los terminados» no borra nada
const DIA_ANTERIOR = (notas) => ({ dia: AYER, papelera: [], notas });
const t0 = Date.now() - 864e5;
const NOTAS = () => [
  { id: 'n1', titulo: 'Mezcla', cat: 'comercial', contexto: '', creada: t0, items: [{ id: 'a', texto: 'pendiente', hecho: false }, { id: 'b', texto: 'hecha', hecho: true }] },
  { id: 'n2', titulo: 'Terminada', cat: 'operacion', contexto: '', creada: t0, items: [{ id: 'c', texto: 'hecha', hecho: true }] },
  { id: 'n3', titulo: 'Solo título', cat: 'ideas', contexto: '', creada: t0, items: [] },
];
const intactas = () => ['n1', 'n2', 'n3'].every((id) => memoria['postit:' + id]) && memoria['postit:n1'].items.length === 2 && memoria['postit:n2'].items.length === 1;
sembrar(DIA_ANTERIOR(NOTAS())); memoria['postits:revision'] = null; memoria['postits:pospuesto'] = 0;
C = await abrirPestana('https://prueba.local/manana');
await C.waitForTimeout(1500);
const cab = (await textos(C, '.pmodal h2'))[0] || '';
ok(cab.startsWith('Buen día. Hoy es'), 'al abrir el día nuevo aparece la pregunta');
ok(((await textos(C, '.pmodal header p'))[0] || '').includes('3 post-its de ayer: 1 tareas pendientes y 2 hechas'), 'la pregunta resume lo que quedó de ayer');
ok(!(await textos(C, '.pmodal button')).some((t) => /borrar|solo lo pendiente/i.test(t)), 'la pregunta del día no ofrece borrar nada');
ok((await textos(C, '.pmini .pm-edad')).length === 3, 'los post-its que vienen de días anteriores muestran su edad');
await clic(C, '.pm-acciones button', 'Archivar los terminados');
await C.waitForTimeout(80);
e = estado();
ok(e.dia === HOY, 'decidir fija el día de trabajo en hoy');
ok(e.notas.map((n) => n.id).join() === 'n1,n3' && e.papelera.map((n) => n.id).join() === 'n2', '«Archivar los terminados» saca de la pila solo el que tiene todo hecho');
ok(intactas(), 'ningún post-it ni ninguna tarea se borró: las tareas hechas siguen ahí');
ok(!(await textos(C, '.pmodal')).length && memoria['postits:revision'] === null, 'la pregunta se cierra y suelta el turno');
await C.close(); paginas.clear();

// 15. «Mantener todos» y «Aplicar mi selección»
sembrar(DIA_ANTERIOR(NOTAS()));
C = await abrirPestana('https://prueba.local/manana');
await C.waitForTimeout(1500);
await clic(C, '.pm-acciones button', 'Mantener todos');
await C.waitForTimeout(80);
ok(estado().notas.length === 3 && !estado().papelera.length && intactas(), '«Mantener todos» deja los tres en la pila, sin tocar nada');
await C.close(); paginas.clear();

sembrar(DIA_ANTERIOR(NOTAS()));
C = await abrirPestana('https://prueba.local/manana');
await C.waitForTimeout(1500);
await C.evaluate(() => [...window.__sombra.querySelectorAll('.pm-nota')].find((n) => n.textContent.includes('Solo título')).click());
await clic(C, '.pmodal footer button', 'Aplicar mi selección');
await C.waitForTimeout(80);
e = estado();
ok(e.notas.map((n) => n.id).join() === 'n1,n2' && e.papelera.map((n) => n.id).join() === 'n3' && intactas(), '«Aplicar mi selección» archiva el desmarcado; no borra nada');
await C.close(); paginas.clear();

// 15-bis. El archivo no vence: un post-it archivado hace 40 días sigue guardado
sembrar({ dia: HOY, notas: [{ id: 'v1', titulo: 'Activo', cat: 'ideas', contexto: '', creada: Date.now(), items: [] }],
  papelera: [{ id: 'v2', titulo: 'Archivado hace 40 días', cat: 'ideas', contexto: '', creada: Date.now() - 41 * 864e5, borrada: Date.now() - 40 * 864e5, items: [{ id: 'x', texto: 'idea vieja', hecho: false }] }] });
C = await abrirPestana('https://prueba.local/hoy');
await C.waitForTimeout(400);
await C.evaluate(() => [...window.__sombra.querySelectorAll('.pmini')].find((m) => m.textContent.includes('Activo')).click());
await C.waitForTimeout(60);
await C.evaluate(() => { const t = window.__sombra.querySelector('.pt-titulo'); t.focus(); t.select(); });
await C.keyboard.type('Activo editado');
await C.keyboard.press('Escape');
await C.waitForTimeout(150);
ok(memoria['postit:v2'] && memoria['postit:v2'].items[0].texto === 'idea vieja', 'un post-it archivado hace 40 días no se borra al guardar otros cambios');
await C.close(); paginas.clear();

// 16. Una sola pestaña pregunta: con el turno tomado por otra pestaña reciente, no pregunta
sembrar(DIA_ANTERIOR(NOTAS()));
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
