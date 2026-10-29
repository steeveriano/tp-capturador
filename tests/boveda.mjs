// Prueba de la captura de secretos (orden de la ACH del 29-oct-2026) en Chromium real,
// con Tampermonkey simulado y el ayudante local simulado. Solo secretos inventados al vuelo.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPT = readFileSync(path.join(raiz, 'tp-capturador.user.js'), 'utf8');
const H2C = readFileSync(require.resolve('html2canvas/dist/html2canvas.min.js'), 'utf8');
const AYUDANTE = 'http://127.0.0.1:47321';
const HOJA = 'https://script.google.com/macros/s/PRUEBA123/exec';

// Inventados en tiempo de ejecución; el repositorio no guarda ningún valor con forma de clave.
const inventado = () => 'Prb' + randomBytes(12).toString('base64url') + '9$x';
const CLAVE_AYUDANTE = 'k-' + randomBytes(16).toString('hex');
const SECRETO = inventado();
// Frase de varias palabras: no «parece» secreto, así que prueba que el pegado desde la Bóveda
// no toca el historial por diseño, no por la detección.
const SECRETO_GUARDADO = 'frase de prueba ' + randomBytes(4).toString('hex') + ' caballo pila';
const TOKEN_EN_PARRAFO = ['s', 'k-'].join('') + randomBytes(18).toString('hex');

const PAGINA = `<!doctype html><html><head><meta charset="utf-8"><title>Panel de claves</title></head><body style="font:16px Arial;padding:20px">
  <p id="clave">${SECRETO}</p>
  <p id="parrafo">Configura el cliente con la clave ${TOKEN_EN_PARRAFO} y reinicia el servicio.</p>
  <p id="normal">Texto normal de la página para copiar.</p>
  <input id="pass" type="password" value="${SECRETO}">
  <input id="destino" type="text" style="width:300px">
</body></html>`;

const fallas = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + '  ' + m); if (!c) fallas.push(m); };

const nav = await chromium.launch();
const ctx = await nav.newContext();
const memoria = { cfg: { endpoint: HOJA, token: 'x'.repeat(40), perfil: 'Prueba', limpiarPortapapelesSeg: 1 } };
await ctx.exposeBinding('__gmSet', (_f, k, v) => { memoria[k] = v; });

// Ayudante simulado: mismas reglas que el real (clave, no sobrescribir, nunca devuelve el valor al guardar).
const boveda = new Map([['servicio_guardado_prod_token', SECRETO_GUARDADO]]);
const peticionesAyudante = [];
let vinculacionAbierta = true;
await ctx.route(`${AYUDANTE}/**`, async (r) => {
  const req = r.request();
  const u = new URL(req.url());
  const cab = req.headers();
  const cuerpo = req.postData() ? JSON.parse(req.postData()) : null;
  peticionesAyudante.push({ ruta: u.pathname, cab, cuerpo });
  const json = (status, obj) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
  if (u.pathname === '/vincular') {
    if (cab['x-tp-vincular'] !== '1' || !vinculacionAbierta) return json(403, { ok: false });
    vinculacionAbierta = false;
    return json(200, { ok: true, clave: CLAVE_AYUDANTE });
  }
  if (u.pathname === '/salud') return json(200, { ok: true, version: '1.0.0', destino: 'local' });
  if (cab['x-tp-clave'] !== CLAVE_AYUDANTE) return json(401, { ok: false, error: 'clave' });
  if (u.pathname === '/nombres') return json(200, { ok: true, nombres: [...boveda.keys()].sort() });
  if (u.pathname === '/guardar') {
    const n = [cuerpo.servicio, cuerpo.entorno, cuerpo.tipo].map((x) => x.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')).join('_');
    if (boveda.has(n)) return json(409, { ok: false, error: 'ya existe' });
    boveda.set(n, cuerpo.valor);
    return json(200, { ok: true, nombre: n, destino: 'local' });
  }
  if (u.pathname === '/obtener') return boveda.has(cuerpo.nombre) ? json(200, { ok: true, valor: boveda.get(cuerpo.nombre) }) : json(404, { ok: false });
  return json(404, {});
});
const envíosHoja = [];
await ctx.route(HOJA, (r) => { envíosHoja.push(r.request().postData()); r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"fila":2}' }); });
await ctx.route('https://prueba.local/**', (r) => r.fulfill({ contentType: 'text/html', body: PAGINA }));

const SHIM = (mem) => `
  (() => {
    const orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (o) { const s = orig.call(this, Object.assign({}, o, { mode: 'open' })); window.__sombra = s; return s; };
    const mem = ${JSON.stringify(mem)};
    window.__portapapeles = [];
    window.GM_getValue = (k, d) => (k in mem && mem[k] !== undefined ? JSON.parse(JSON.stringify(mem[k])) : d);
    window.GM_setValue = (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); window.__gmSet(k, mem[k]); };
    window.GM_addValueChangeListener = () => 1;
    window.GM_removeValueChangeListener = () => {};
    window.GM_setClipboard = (t) => { window.__portapapeles.push(t); };
    window.GM_registerMenuCommand = (t, f) => { (window.__menu = window.__menu || {})[t] = f; };
    window.GM_addStyle = (c) => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); };
    window.GM_openInTab = () => {};
    window.GM_xmlhttpRequest = (o) => fetch(o.url, { method: o.method, body: o.data, headers: o.headers })
      .then(async (r) => o.onload({ status: r.status, responseText: await r.text() })).catch(() => o.onerror && o.onerror());
  })();`;

const pagina = await ctx.newPage();
pagina.on('pageerror', (e) => fallas.push('error de página: ' + e.message));
pagina.on('dialog', (d) => d.accept());
async function cargar() {
  await pagina.goto('https://prueba.local/');
  await pagina.evaluate(SHIM(memoria));
  await pagina.evaluate(H2C);
  await pagina.evaluate(SCRIPT);
  await pagina.waitForTimeout(300);
}
const enSombra = (sel) => pagina.evaluate((s) => [...window.__sombra.querySelectorAll(s)].map((n) => n.textContent), sel);
const clic = (t) => pagina.evaluate((t) => { const b = [...window.__sombra.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(t)); if (b) b.click(); return !!b; }, t);
const seleccionar = (id) => pagina.evaluate((id) => { const r = document.createRange(); r.selectNodeContents(document.getElementById(id)); getSelection().removeAllRanges(); getSelection().addRange(r); }, id);
const derecho = async (id) => { const b = await pagina.locator('#' + id).boundingBox(); await pagina.mouse.click(b.x + 10, b.y + b.height / 2, { button: 'right' }); await pagina.waitForTimeout(100); };
const nadaFiltrado = (v) => !JSON.stringify(memoria).includes(v);

// 0. Cabecera: versión fija en sbntpnet, sin actualización desde la rama principal
const cabecera = SCRIPT.split('==/UserScript==')[0];
ok(/@updateURL\s+https:\/\/raw\.githubusercontent\.com\/sbntpnet\/tp-capturador\/v2\.4\.0\//.test(cabecera) && !/\/main\//.test(cabecera), 'versión fija: @updateURL apunta a la etiqueta v2.4.0 de sbntpnet, no a main');
ok(/@connect\s+127\.0\.0\.1/.test(cabecera), 'puede hablar con el ayudante en 127.0.0.1');

// 1. Migración de configuración: «Omitir secretos» vuelve a encenderse
memoria.cfg.omitirSecretos = false;
await cargar();
ok(memoria.cfg.omitirSecretos === true && memoria.cfg.cfgVersion === 2, '«Omitir secretos» queda encendido aunque estuviera apagado');

// 2. Sin vincular: no envía nada
await seleccionar('clave');
await derecho('clave');
ok(await clic('A la Bóveda'), 'el clic derecho sobre lo seleccionado ofrece «A la Bóveda»');
ok((await enSombra('.toast')).some((t) => t.includes('vincula este navegador')), 'sin vincular, pide vincular primero');
ok(!peticionesAyudante.some((p) => p.ruta === '/guardar'), 'sin vincular no llega nada al ayudante');

// 3. Vincular
await pagina.evaluate(() => window.__menu['Vincular con el ayudante de la Bóveda']());
await pagina.waitForTimeout(300);
ok(memoria['boveda:clave'] === CLAVE_AYUDANTE, 'la vinculación guarda la clave del ayudante');
ok(peticionesAyudante.find((p) => p.ruta === '/vincular').cab['x-tp-clave'] === undefined, 'la vinculación no manda ninguna clave');

// 4. Captura desde lo seleccionado
await seleccionar('clave');
await derecho('clave');
await clic('A la Bóveda');
await pagina.waitForTimeout(100);
ok((await enSombra('.boveda .oculto'))[0]?.includes('•') && !(await enSombra('.boveda')).join('').includes(SECRETO), 'el formulario no muestra el valor');
await pagina.evaluate(() => {
  const f = window.__sombra.querySelector('.boveda');
  const [servicio, objeto, titular] = f.querySelectorAll('input');
  const [entorno, tipo] = f.querySelectorAll('select');
  const pon = (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); };
  pon(servicio, 'Open AI'); pon(objeto, 'Bot de prueba'); pon(titular, 'Titular de prueba');
  entorno.value = 'prod'; entorno.dispatchEvent(new Event('input'));
  tipo.value = 'api_key'; tipo.dispatchEvent(new Event('input'));
});
ok((await enSombra('.boveda .vista'))[0] === 'Se guardará como open_ai_prod_api_key', 'muestra el nombre normalizado servicio_entorno_tipo');
await clic('Guardar en la Bóveda');
await pagina.waitForTimeout(300);
const g = peticionesAyudante.find((p) => p.ruta === '/guardar' && p.cab['x-tp-clave'] === CLAVE_AYUDANTE);
ok(g && g.cuerpo.valor === SECRETO && g.cuerpo.objeto === 'Bot de prueba' && g.cuerpo.titular === 'Titular de prueba', 'el ayudante recibe valor, objeto y titular con la clave');
ok(g && g.cuerpo.origen === 'https://prueba.local/', 'la página de origen va sin parámetros');
ok(boveda.get('open_ai_prod_api_key') === SECRETO, 'queda guardado con el nombre normalizado');
ok((await enSombra('.toast')).some((t) => t.includes('Guardado en la Bóveda como open_ai_prod_api_key')), 'confirma el guardado');
ok(nadaFiltrado(SECRETO), 'el valor no quedó en el almacenamiento de Tampermonkey ni en el historial');

// 5. No sobrescribe: mismo nombre → aviso y el valor original intacto
await derecho('pass');
ok(await clic('A la Bóveda… (este campo)'), 'clic derecho en un campo de contraseña ofrece «A la Bóveda (este campo)»');
await pagina.evaluate(() => {
  const f = window.__sombra.querySelector('.boveda');
  const [servicio, objeto, titular] = f.querySelectorAll('input');
  const [entorno, tipo] = f.querySelectorAll('select');
  servicio.value = 'Open AI'; objeto.value = 'x'; titular.value = 'y'; entorno.value = 'prod'; tipo.value = 'api_key';
});
await clic('Guardar en la Bóveda');
await pagina.waitForTimeout(300);
ok((await enSombra('.boveda .aviso'))[0]?.includes('Ya existe'), 'si el nombre existe, avisa y no sobrescribe');
await clic('Cancelar');

// 6. Pegar desde la Bóveda en el campo activo, sin historial ni portapapeles
await pagina.click('#destino');
await derecho('destino');
ok(await clic('Pegar desde la Bóveda'), 'el clic derecho en un campo ofrece «Pegar desde la Bóveda»');
await pagina.waitForTimeout(300);
ok((await enSombra('.panel .item .t')).includes('servicio_guardado_prod_token'), 'busca por nombre en la Bóveda');
await pagina.evaluate(() => { const i = window.__sombra.querySelector('.panel input'); i.value = 'guardado'; i.dispatchEvent(new Event('input')); });
await pagina.evaluate(() => [...window.__sombra.querySelectorAll('.panel .item')][0].click());
await pagina.waitForTimeout(300);
ok((await pagina.inputValue('#destino')) === SECRETO_GUARDADO, 'pega el secreto en el campo activo');
ok(!(await pagina.evaluate(() => window.__portapapeles)).includes(SECRETO_GUARDADO), 'pegado en campo: no pasa por el portapapeles');
ok(nadaFiltrado(SECRETO_GUARDADO), 'pegado en campo: no queda en el historial');

// 7. Sin campo activo: copia y limpia el portapapeles
await pagina.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__menu['Pegar desde la Bóveda'](); });
await pagina.waitForTimeout(300);
await pagina.evaluate(() => [...window.__sombra.querySelectorAll('.panel .item')].find((x) => x.textContent === 'servicio_guardado_prod_token').click());
await pagina.waitForTimeout(200);
ok((await pagina.evaluate(() => window.__portapapeles)).at(-1) === SECRETO_GUARDADO, 'sin campo: lo copia al portapapeles');
await pagina.waitForTimeout(1300);
ok((await pagina.evaluate(() => window.__portapapeles)).at(-1) === '', 'y lo limpia pasado el plazo');
ok(nadaFiltrado(SECRETO_GUARDADO), 'sin campo: tampoco queda en el historial');

// 8. Bloqueos: historial, hoja
await seleccionar('parrafo');
await pagina.keyboard.press('Control+C');
await seleccionar('normal');
await pagina.keyboard.press('Control+C');
await pagina.waitForTimeout(100);
const hist = memoria.historial || [];
ok(!hist.some((x) => x.texto.includes(TOKEN_EN_PARRAFO)), 'un párrafo con una clave adentro no entra al historial');
ok(hist.some((x) => x.texto.includes('Texto normal de la página')), 'el texto normal sí entra al historial');
await seleccionar('parrafo');
await derecho('parrafo');
await clic('Guardar en la hoja');
await pagina.waitForTimeout(300);
ok(!envíosHoja.some((d) => d.includes(TOKEN_EN_PARRAFO)), 'lo que contiene un secreto no va a la hoja');
ok((await enSombra('.toast')).some((t) => t.includes('no va a la hoja')), 'avisa que no va a la hoja');
await seleccionar('normal');
await derecho('normal');
await clic('Guardar en la hoja');
await pagina.waitForTimeout(300);
ok(envíosHoja.some((d) => d.includes('Texto normal de la página')), 'el texto normal sí va a la hoja');

await nav.close();
console.log(fallas.length ? `\n${fallas.length} falla(s):\n- ${fallas.join('\n- ')}` : '\nBóveda: todo en verde.');
process.exit(fallas.length ? 1 : 0);
