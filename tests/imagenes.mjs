// Prueba de imágenes y vista previa del portapapeles, en Chromium real con Tampermonkey simulado.
// Una imagen es del mismo sitio; la otra viene de otro sitio que no permite CORS (como casi todas).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPT = readFileSync(path.join(raiz, 'tp-capturador.user.js'), 'utf8');
const H2C = readFileSync(require.resolve('html2canvas/dist/html2canvas.min.js'), 'utf8');
const ROJA = readFileSync(path.join(raiz, 'tests', 'roja.png'));
const AZUL = readFileSync(path.join(raiz, 'tests', 'azul.png'));

const PAGINA = `<!doctype html><html><head><meta charset="utf-8"><title>Galería</title></head>
<body style="font:16px Arial;padding:20px">
  <img id="propia" src="/roja.png" alt="Logo rojo" width="120" height="80">
  <img id="ajena" src="https://otro.local/azul.png" alt="Banner azul" width="150" height="100">
  <p id="vacio" style="height:60px">Zona sin nada</p>
  <div id="editor" contenteditable="true" style="min-height:40px;border:1px solid #ccc">Editor</div>
  <input id="campo" type="text" style="width:300px">
  <div id="galeria"></div>
  <script>
    window.__archivos = [];
    document.getElementById('editor').addEventListener('paste', (e) => {
      const f = [...e.clipboardData.files];
      if (f.length) { e.preventDefault(); window.__archivos.push(...f.map((x) => x.type + ':' + x.size)); }
    });
  </script>
</body></html>`;

const fallas = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + '  ' + m); if (!c) fallas.push(m); };

const nav = await chromium.launch();
const ctx = await nav.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1280, height: 900 } });
await ctx.route('https://prueba.local/**', (r) => (r.request().url().endsWith('/roja.png')
  ? r.fulfill({ contentType: 'image/png', body: ROJA })
  : r.fulfill({ contentType: 'text/html', body: PAGINA })));
// El otro sitio solo responde con CORS a la descarga privilegiada de Tampermonkey (marcada con gm=1).
// La imagen se ve en la página, pero el sitio no deja que la página la descargue por su cuenta
// (como un sitio sin CORS o con protección contra enlaces): solo la descarga privilegiada (gm=1) pasa.
await ctx.route('https://otro.local/**', (r) => {
  const permitido = r.request().resourceType() === 'image' || r.request().url().includes('gm=1');
  return permitido ? r.fulfill({ contentType: 'image/png', body: AZUL }) : r.fulfill({ status: 403, body: 'no' });
});

const memoria = {};
await ctx.exposeBinding('__gmSet', (_f, k, v) => { if (v === undefined) delete memoria[k]; else memoria[k] = v; });
const SHIM = (mem) => `
  (() => {
    const orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (o) { const s = orig.call(this, Object.assign({}, o, { mode: 'open' })); window.__sombra = s; return s; };
    const mem = ${JSON.stringify(mem)};
    window.GM_getValue = (k, d) => (k in mem && mem[k] != null ? JSON.parse(JSON.stringify(mem[k])) : d);
    window.GM_setValue = (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); window.__gmSet(k, mem[k]); };
    window.GM_deleteValue = (k) => { delete mem[k]; window.__gmSet(k, undefined); };
    window.GM_listValues = () => Object.keys(mem);
    window.GM_addValueChangeListener = () => 0; window.GM_removeValueChangeListener = () => {};
    window.GM_setClipboard = (t) => navigator.clipboard.writeText(t);
    window.GM_registerMenuCommand = () => {}; window.GM_addStyle = () => {}; window.GM_openInTab = () => {};
    window.__gmPedidos = 0;
    window.GM_xmlhttpRequest = (o) => {
      window.__gmPedidos++;
      fetch(o.url + (o.url.includes('?') ? '&' : '?') + 'gm=1')
        .then(async (r) => o.onload({ status: r.status, response: await r.blob() }))
        .catch(() => o.onerror && o.onerror());
    };
  })();`;

const pagina = await ctx.newPage();
pagina.on('pageerror', (e) => fallas.push('error de página: ' + e.message));
async function cargar(url) {
  await pagina.goto(url);
  await pagina.evaluate(SHIM(memoria));
  await pagina.evaluate(H2C);
  await pagina.evaluate(SCRIPT);
  await pagina.waitForTimeout(300);
}
const textos = (sel) => pagina.evaluate((s) => [...window.__sombra.querySelectorAll(s)].map((n) => n.textContent), sel);
const clic = (sel, texto) => pagina.evaluate(([s, t]) => {
  const b = [...window.__sombra.querySelectorAll(s)].find((x) => x.textContent.includes(t));
  if (!b) return false; b.click(); return true;
}, [sel, texto]);
async function clicDerecho(sel) {
  await pagina.mouse.click(700, 870);
  await pagina.evaluate((s) => { const el = document.querySelector(s); if (el.isContentEditable || el.tagName === 'INPUT') el.focus(); }, sel);
  const b = await pagina.locator(sel).boundingBox();
  await pagina.evaluate(([s, x, y]) => document.querySelector(s).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })), [sel, b.x + 10, b.y + 10]);
  await pagina.waitForTimeout(400);
}
// Lo que hay de verdad en el portapapeles: tipo, tamaño y color del centro.
const portapapeles = () => pagina.evaluate(async () => {
  const [it] = await navigator.clipboard.read();
  if (it.types.includes('image/png')) {
    const bmp = await createImageBitmap(await it.getType('image/png'));
    const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
    const [r, gg, b] = g.getImageData(bmp.width >> 1, bmp.height >> 1, 1, 1).data;
    return { tipo: 'imagen', ancho: bmp.width, alto: bmp.height, rgb: [r, gg, b] };
  }
  return { tipo: 'texto', texto: await (await it.getType('text/plain')).text() };
});
const hist = () => memoria.historial || [];
const imgKeys = () => Object.keys(memoria).filter((k) => k.startsWith('img:'));

await cargar('https://prueba.local/galeria');

// 1. Copiar una imagen del mismo sitio
await clicDerecho('#propia');
ok((await textos('.menu button')).some((t) => t.startsWith('Copiar imagen')), 'clic derecho sobre una imagen ofrece «Copiar imagen»');
await clic('.menu button', 'Copiar imagen');
await pagina.waitForTimeout(600);
let pp = await portapapeles();
ok(pp.tipo === 'imagen' && pp.ancho === 120 && pp.alto === 80 && pp.rgb[0] > 200 && pp.rgb[2] < 60, 'la imagen roja queda en el portapapeles de verdad (120×80, roja)');
let h0 = hist()[0] || {};
ok(h0.tipo === 'imagen' && h0.texto === 'Logo rojo · Imagen 120×80' && /^data:image\/webp/.test(h0.mini), 'el historial guarda la imagen con miniatura y descripción');
ok(h0.completa === true && imgKeys().includes('img:' + h0.id), 'el historial guarda también la imagen completa aparte');
ok((await pagina.evaluate(() => [...window.__sombra.querySelectorAll('.toast .tmini img')].length)) > 0, 'el aviso muestra la miniatura de lo copiado');

// 2. Copiar una imagen de otro sitio que no permite CORS
ok(await pagina.evaluate(() => fetch('https://otro.local/azul.png').then((r) => !r.ok, () => true)), 'control: la página sola no puede descargar la imagen ajena');
await clicDerecho('#ajena');
await clic('.menu button', 'Copiar imagen');
await pagina.waitForTimeout(800);
pp = await portapapeles();
ok(pp.tipo === 'imagen' && pp.ancho === 300 && pp.rgb[2] > 200 && pp.rgb[0] < 60, 'la imagen de otro sitio se copia completa (300×200, azul) por Tampermonkey');
ok((await pagina.evaluate(() => window.__gmPedidos)) >= 1, 'la descarga de la imagen ajena pasó por Tampermonkey');

// 3. Vista previa en el clic derecho: Windows ahora + últimas copias
await clicDerecho('#vacio');
const secciones = await textos('.menu .sec');
ok(secciones.includes('Portapapeles'), 'el clic derecho muestra la sección «Portapapeles»');
const win = await pagina.evaluate(() => { const f = window.__sombra.querySelector('.menu .windows'); return f ? { t: f.textContent, img: !!f.querySelector('img') } : null; });
ok(win && win.t.startsWith('Windows') && win.t.includes('Imagen 300×200') && win.img, 'la fila «Windows» muestra lo que hay ahora: la imagen azul con miniatura');
ok(hist().filter((x) => x.tipo === 'imagen' && x.ancho === 300).length === 1, 'leer de Windows la misma imagen no la duplica en el historial');
ok((await pagina.evaluate(() => window.__sombra.querySelectorAll('.menu .pv-b img').length)) >= 2, 'las últimas copias se ven con miniatura');

// 4. Texto copiado fuera del script
await pagina.evaluate(() => navigator.clipboard.writeText('Texto copiado en Windows'));
await clicDerecho('#vacio');
ok(((await textos('.menu .windows'))[0] || '').includes('Texto copiado en Windows'), 'la fila «Windows» muestra el texto copiado en otra aplicación');
ok(hist().some((x) => x.texto === 'Texto copiado en Windows' && x.origen === 'windows'), 'lo leído de Windows entra al historial');

// 5. Pegar una imagen del historial en un editor que acepta imágenes (como ChatGPT o Gmail)
await clicDerecho('#editor');
ok((await textos('.menu .sec')).includes('Pegar'), 'dentro de un campo la sección se llama «Pegar»');
await clic('.menu .pv-b', 'Logo rojo');
await pagina.waitForTimeout(500);
const archivos = await pagina.evaluate(() => window.__archivos);
ok(archivos.length === 1 && archivos[0].startsWith('image/png:'), 'la imagen llega al editor como un Ctrl+V con archivo PNG');

// 6. Un campo que no acepta imágenes: queda copiada para pegarla a mano
await clicDerecho('#campo');
await clic('.menu .pv-b', 'Banner azul');
await pagina.waitForTimeout(700);
pp = await portapapeles();
ok(pp.tipo === 'imagen' && pp.ancho === 300, 'si el campo no recibe imágenes, la imagen queda en el portapapeles');
ok((await textos('.toast')).some((t) => t.includes('no recibe imágenes')), 'y avisa que hay que pulsar Ctrl+V');

// 7. Panel del historial (Alt+V)
await pagina.mouse.click(700, 870);
await pagina.keyboard.press('Alt+v');
await pagina.waitForTimeout(500);
ok((await pagina.evaluate(() => window.__sombra.querySelectorAll('.panel .item img.img').length)) >= 2, 'el historial (Alt+V) muestra las imágenes en miniatura');
ok(!!(await pagina.evaluate(() => window.__sombra.querySelector('.panel .windows'))), 'el historial muestra arriba lo que hay en Windows');
await pagina.keyboard.press('Escape');
await pagina.evaluate(() => window.__sombra.querySelectorAll('.panel').forEach((p) => p.remove()));

// 8. Solo las últimas imágenes guardan el archivo completo
for (let i = 0; i < 9; i++) {
  await pagina.evaluate((n) => {
    const c = document.createElement('canvas'); c.width = 40 + n; c.height = 30; const g = c.getContext('2d');
    g.fillStyle = `hsl(${n * 37},70%,50%)`; g.fillRect(0, 0, c.width, c.height);
    const img = document.createElement('img'); img.id = 'g' + n; img.src = c.toDataURL(); img.alt = 'Generada ' + n;
    document.getElementById('galeria').append(img);
  }, i);
  await pagina.waitForTimeout(50);
  await clicDerecho('#g' + i);
  await clic('.menu button', 'Copiar imagen');
  await pagina.waitForTimeout(350);
}
const imgs = hist().filter((x) => x.tipo === 'imagen');
ok(imgKeys().length === 8 && imgs.filter((x) => x.completa).length === 8, `solo 8 imágenes guardan el archivo completo (hay ${imgKeys().length})`);
ok(imgs.length >= 11 && imgs.at(-1).completa === false && imgs.at(-1).mini, 'las más viejas quedan en miniatura dentro del historial');

// 9. Una imagen vieja sin archivo completo se vuelve a copiar desde su dirección
const vieja = imgs.find((x) => !x.completa && x.src);
await pagina.mouse.click(700, 870);
await pagina.keyboard.press('Alt+v');
await pagina.waitForTimeout(400);
await pagina.evaluate((id) => {
  const filas = [...window.__sombra.querySelectorAll('.panel .item')];
  const f = filas.find((x) => x.textContent.includes(id));
  f.querySelector('.acc button').click();
}, vieja.texto);
await pagina.waitForTimeout(800);
pp = await portapapeles();
ok(pp.tipo === 'imagen' && pp.ancho === vieja.ancho, `una imagen vieja se copia completa desde su dirección (${vieja.texto})`);

// 10. Borrar el historial borra también los archivos de imagen
await pagina.evaluate(() => window.__sombra.querySelectorAll('.panel').forEach((p) => p.remove()));
pagina.once('dialog', (d) => d.accept());
await pagina.keyboard.press('Alt+v');
await pagina.waitForTimeout(400);
await clic('.panel footer button', 'Borrar todo');
await pagina.waitForTimeout(200);
ok(!imgKeys().length && !hist().length, 'borrar el historial borra también las imágenes guardadas');

await nav.close();
console.log(fallas.length ? `\n${fallas.length} FALLAS` : '\nTodo en orden.');
process.exit(fallas.length ? 1 : 0);
