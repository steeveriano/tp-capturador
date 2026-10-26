// Prueba de extremo a extremo del userscript en Chromium real, con Tampermonkey simulado.
// Uso: npm test   (necesita playwright y html2canvas instalados con npm install)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPT = readFileSync(path.join(raiz, 'tp-capturador.user.js'), 'utf8');
const H2C = readFileSync(require.resolve('html2canvas/dist/html2canvas.min.js'), 'utf8');
const ENDPOINT = 'https://script.google.com/macros/s/PRUEBA123/exec';
const TOKEN = 'x'.repeat(40);

const PAGINA = `<!doctype html><html><head><meta charset="utf-8"><title>Directorio de prueba</title></head>
<body style="font:16px Arial;padding:20px">
  <p id="p1">Llámenos al 317 723 5440 o escriba a ventas@hotelprueba.com.co hoy.</p>
  <p id="p2">Fijo Cali: (602) 555 1234 · NIT 900123456-7 · Pedido 1234567890</p>
  <p id="p3">Internacional: +1 415 555 0199 · logo@2x.png no es correo</p>
  <p><a id="tel" href="tel:+573001112233">Llamar a recepción</a></p>
  <input id="campo" type="text" value="" style="width:300px">
  <textarea id="area"></textarea>
  <div id="ce" contenteditable="true" style="border:1px solid #ccc;min-height:30px">Editable</div>
  <div id="zona" style="margin-top:20px;width:400px;padding:10px;background:#eef">Texto para recortar: Hotel El Edén, Santa Elena.</div>
</body></html>`;

const fallas = [];
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALLA') + '  ' + msg); if (!cond) fallas.push(msg); };

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const pagina = await ctx.newPage();
const recibidos = [];
pagina.on('dialog', async (d) => { await d.accept(d.type() === 'prompt' ? 'Perfil Prueba' : undefined); });
pagina.on('pageerror', (e) => fallas.push('error de página: ' + e.message));

await ctx.route('https://prueba.local/**', (r) => r.fulfill({ contentType: 'text/html', body: PAGINA }));
await ctx.route('https://github.com/steeveriano/tp-capturador**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>repo</body></html>' }));
await ctx.route(ENDPOINT, async (r) => {
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  const d = JSON.parse(r.request().postData());
  recibidos.push(d);
  const repetido = recibidos.filter((x) => x.valor === d.valor).length > 1;
  r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d.token === TOKEN ? { ok: true, fila: recibidos.length + 1, repetido } : { ok: false, error: 'token' }) });
});

// Tampermonkey simulado. La memoria vive en Node para compartirse entre sitios, como en Tampermonkey real.
const memoria = {};
await ctx.exposeBinding('__gmSet', (_f, k, v) => { memoria[k] = v; });
const SHIM = (mem) => `
  (() => {
    const orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (o) { const s = orig.call(this, Object.assign({}, o, { mode: 'open' })); window.__sombra = s; return s; };
    const mem = ${JSON.stringify(mem)};
    window.GM_getValue = (k, d) => (k in mem ? JSON.parse(JSON.stringify(mem[k])) : d);
    window.GM_setValue = (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); window.__gmSet(k, mem[k]); };
    window.GM_setClipboard = (t) => { window.__clip = t; };
    window.GM_registerMenuCommand = (n) => { (window.__menu = window.__menu || []).push(n); };
    window.GM_addStyle = (c) => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); };
    window.GM_openInTab = (u) => { (window.__tabs = window.__tabs || []).push(u); };
    window.GM_xmlhttpRequest = (o) => fetch(o.url, { method: o.method, body: o.data, headers: o.headers })
      .then(async (r) => o.onload({ status: r.status, responseText: await r.text() })).catch(() => o.onerror && o.onerror());
  })();`;

async function cargar(url) {
  await pagina.goto(url);
  await pagina.evaluate(SHIM(memoria));
  await pagina.evaluate(H2C);
  await pagina.evaluate(SCRIPT);
  await pagina.waitForTimeout(400);
}
const enSombra = (sel) => pagina.evaluate((s) => [...window.__sombra.querySelectorAll(s)].map((n) => n.textContent), sel);
async function clicEnSombra(texto) {
  const hecho = await pagina.evaluate((t) => {
    const b = [...window.__sombra.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(t));
    if (!b) return false; b.click(); return true;
  }, texto);
  ok(hecho, `botón "${texto}" existe`);
}
async function centroDe(sel, sub) {
  return pagina.evaluate(([s, t]) => {
    const el = document.querySelector(s); const i = el.textContent.indexOf(t);
    const r = document.createRange(); r.setStart(el.firstChild, i); r.setEnd(el.firstChild, i + t.length);
    const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, [sel, sub]);
}

// 1. Activación desde el enlace de la bóveda
await cargar(`https://github.com/steeveriano/tp-capturador#tp-activar&e=${encodeURIComponent(ENDPOINT)}&k=${TOKEN}&h=${encodeURIComponent('https://docs.google.com/spreadsheets/d/x')}`);
const cfg = await pagina.evaluate(() => GM_getValue('cfg', {}));
ok(cfg.endpoint === ENDPOINT && cfg.token === TOKEN && cfg.perfil === 'Perfil Prueba', 'activación guarda endpoint, clave y perfil');
ok(!(await pagina.evaluate(() => location.hash)), 'la clave se borra de la barra de direcciones');

// 2. Activación desde otro sitio debe ignorarse
await cargar(`https://prueba.local/#tp-activar&e=${encodeURIComponent('https://script.google.com/macros/s/ATACANTE/exec')}&k=${'y'.repeat(40)}`);
ok((await pagina.evaluate(() => GM_getValue('cfg', {}))).endpoint === ENDPOINT, 'un enlace de activación fuera del repositorio no cambia nada');

// 3. Resaltado
await cargar('https://prueba.local/');
const n = await pagina.evaluate(() => ({ tel: CSS.highlights.get('tp-tel').size, mail: CSS.highlights.get('tp-mail').size }));
ok(n.tel === 3, `teléfonos resaltados: ${n.tel} (esperado 3: celular, fijo 602, +1)`);
ok(n.mail === 1, `correos resaltados: ${n.mail} (esperado 1; logo@2x.png no cuenta)`);

// 4. Clic en un teléfono → menú → guardar en la hoja
let p = await centroDe('#p1', '317 723 5440');
await pagina.mouse.click(p.x, p.y);
await pagina.waitForTimeout(100);
ok((await enSombra('.menu .valor'))[0] === '+573177235440', 'menú del teléfono muestra +573177235440');
await clicEnSombra('Guardar en la hoja');
await pagina.waitForTimeout(400);
ok(recibidos.at(-1)?.tipo === 'telefono' && recibidos.at(-1)?.valor === '+573177235440', 'la hoja recibe el teléfono normalizado');
ok(recibidos.at(-1)?.url === 'https://prueba.local/' && recibidos.at(-1)?.perfil === 'Perfil Prueba', 'la hoja recibe dirección sin parámetros y el perfil');
ok((await enSombra('.toast')).some((t) => t.includes('Guardado en la hoja')), 'aviso de guardado');

// 5. Contenido que llega después (páginas dinámicas)
await pagina.evaluate(() => { const d = document.createElement('p'); d.id = 'nuevo'; d.textContent = 'Nuevo contacto: 3209998877'; document.body.appendChild(d); });
await pagina.waitForTimeout(1200);
ok((await pagina.evaluate(() => CSS.highlights.get('tp-tel').size)) === 4, 'detecta teléfonos agregados después de cargar');

// 6. Copiar con Ctrl+C queda en el historial, y se pega desde el clic derecho
await pagina.evaluate(() => { const r = document.createRange(); const z = document.querySelector('#zona').firstChild; r.setStart(z, 0); r.setEnd(z, 19); getSelection().removeAllRanges(); getSelection().addRange(r); });
await pagina.keyboard.press('Control+C');
await pagina.waitForTimeout(50);
ok((await pagina.evaluate(() => GM_getValue('historial', [])[0]?.texto)) === 'Texto para recortar', 'Ctrl+C queda en el historial');
await pagina.click('#campo');
await pagina.click('#campo', { button: 'right' });
await pagina.waitForTimeout(100);
await clicEnSombra('Pegar lo último copiado');
ok((await pagina.inputValue('#campo')) === 'Texto para recortar', 'pegar desde el menú escribe en el campo');

// 7. Segundo clic derecho deja pasar el menú de Chrome; Ctrl+clic derecho también
await pagina.mouse.click(5, 5, { button: 'right' });
const prevenido = await pagina.evaluate(() => new Promise((res) => {
  window.addEventListener('contextmenu', (e) => setTimeout(() => res(e.defaultPrevented)), { once: true });
  document.body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
}));
ok(prevenido === false, 'segundo clic derecho abre el menú de Chrome');

// 8. Contraseña: no entra al historial
await pagina.fill('#area', 'Clave$Segura2026');
await pagina.evaluate(() => { const a = document.querySelector('#area'); a.focus(); a.select(); });
await pagina.keyboard.press('Control+C');
await pagina.waitForTimeout(50);
ok(await pagina.evaluate(() => GM_getValue('historial', []).some((x) => x.texto.includes('Clave$'))), 'todo lo copiado entra al historial, también lo que parece clave');
ok(!(await enSombra('.toast')).some((t) => t.includes('parece una contraseña')), 'no aparece el aviso de contraseña');

// 9. Clic derecho dentro de un campo con texto seleccionado ofrece Cortar
await pagina.mouse.click(5, 5);
await pagina.fill('#area', 'cortar esto ya');
await pagina.evaluate(() => { const a = document.querySelector('#area'); a.focus(); a.setSelectionRange(0, 6); });
const ar = await pagina.locator('#area').boundingBox();
await pagina.evaluate(([x, y]) => document.querySelector('#area').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })), [ar.x + 5, ar.y + 8]);
await pagina.waitForTimeout(100);
ok((await enSombra('.menu button')).some((t) => t.startsWith('Cortar')), 'clic derecho en un campo ofrece Cortar');
await clicEnSombra('Cortar');
ok((await pagina.inputValue('#area')) === ' esto ya', 'Cortar quita el texto del campo');

// Barra flotante tras arrastrar para seleccionar
const p2 = await pagina.locator('#p2').boundingBox();
await pagina.mouse.click(5, 5);
await pagina.mouse.move(p2.x + 2, p2.y + 8);
await pagina.mouse.down();
await pagina.mouse.move(p2.x + 120, p2.y + 8, { steps: 5 });
await pagina.mouse.up();
await pagina.waitForTimeout(150);
ok((await enSombra('.barra button')).includes('Copiar'), 'aparece la barra flotante al seleccionar arrastrando');

// 10. Historial con Alt+V
await pagina.mouse.click(5, 5);
await pagina.keyboard.press('Alt+v');
await pagina.waitForTimeout(100);
ok((await enSombra('.panel .item .t')).includes('Texto para recortar'), 'Alt+V abre el historial con lo copiado');
await pagina.keyboard.press('Escape');

// 11. Recorte de zona: texto e imagen
await pagina.mouse.click(5, 5, { button: 'right' });
await pagina.waitForTimeout(100);
await clicEnSombra('Recortar una zona');
const z = await pagina.locator('#zona').boundingBox();
await pagina.mouse.move(z.x - 4, z.y - 4);
await pagina.mouse.down();
await pagina.mouse.move(z.x + z.width + 4, z.y + z.height + 4, { steps: 6 });
await pagina.mouse.up();
await pagina.waitForTimeout(2500);
const recorte = await pagina.evaluate(() => ({ texto: window.__sombra.querySelector('.resultado textarea')?.value, img: !!window.__sombra.querySelector('.resultado img') }));
ok(recorte.texto && recorte.texto.includes('Hotel El Edén'), 'el recorte extrae el texto de la zona');
ok(recorte.img, 'el recorte genera la imagen');
await clicEnSombra('Guardar texto en la hoja');
await pagina.waitForTimeout(300);
ok(recibidos.at(-1)?.tipo === 'recorte', 'el texto del recorte llega a la hoja');

// 11b. Lupa: se abre desde el clic derecho, la rueda amplía y reduce, Esc sale
await pagina.mouse.click(5, 5);
await pagina.mouse.click(300, 60, { button: 'right' });
await pagina.waitForTimeout(100);
await clicEnSombra('Lupa');
const escala = () => pagina.evaluate(() => { const m = document.documentElement.style.transform.match(/scale\(([\d.]+)\)/); return m ? +m[1] : 1; });
ok((await escala()) === 2, 'la lupa arranca en 2×');
const scrollAntes = await pagina.evaluate(() => scrollY);
await pagina.mouse.move(300, 60);
await pagina.mouse.wheel(0, -100);
await pagina.waitForTimeout(150);
ok((await escala()) > 2, 'rueda hacia arriba amplía');
ok((await pagina.evaluate(() => scrollY)) === scrollAntes, 'con la lupa la rueda no desplaza la página');
await pagina.mouse.wheel(0, 100); await pagina.mouse.wheel(0, 100);
await pagina.waitForTimeout(150);
ok((await escala()) < 2, 'rueda hacia abajo reduce');
await pagina.keyboard.press('Escape');
ok((await escala()) === 1 && !(await pagina.evaluate(() => document.documentElement.style.transform)), 'Esc quita la lupa y deja la página como estaba');
await pagina.keyboard.press('Alt+l');
ok((await escala()) === 2, 'Alt+L abre la lupa');
await pagina.mouse.click(300, 60, { button: 'right' });
ok((await escala()) === 1, 'clic derecho cierra la lupa');
ok(!(await enSombra('.menu')).length, 'ese clic derecho no abre el menú');

// 12. Repetido
p = await centroDe('#p1', '317 723 5440');
await pagina.mouse.click(5, 5);
await pagina.mouse.click(p.x, p.y);
await pagina.waitForTimeout(100);
await clicEnSombra('Guardar en la hoja');
await pagina.waitForTimeout(400);
ok((await enSombra('.toast')).some((t) => t.includes('Ya estaba en la hoja')), 'avisa cuando el contacto ya estaba');

// 13. Sin conexión: queda en cola
await ctx.unroute(ENDPOINT);
await ctx.route(ENDPOINT, (r) => r.abort());
await pagina.mouse.click(5, 5);
p = await centroDe('#p3', '+1 415 555 0199');
await pagina.mouse.click(p.x, p.y);
await pagina.waitForTimeout(100);
await clicEnSombra('Guardar en la hoja');
await pagina.waitForTimeout(500);
ok((await pagina.evaluate(() => GM_getValue('cola', []).length)) === 1, 'sin conexión, el envío queda en cola');

await navegador.close();
console.log(fallas.length ? `\n${fallas.length} falla(s):\n- ${fallas.join('\n- ')}` : '\nTodo en verde.');
process.exit(fallas.length ? 1 : 0);
