// Prueba: pegar dentro de un post-it en páginas que atrapan el pegado (como claude.ai), y
// «+ Nuevo» con texto seleccionado.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPT = readFileSync(path.join(raiz, 'tp-capturador.user.js'), 'utf8');
const H2C = readFileSync(require.resolve('html2canvas/dist/html2canvas.min.js'), 'utf8');

// Página que se queda con todo pegado y lo manda a su propia caja, como hacen los chats.
const ATRAPA_DOCUMENTO = `<!doctype html><html><head><meta charset="utf-8"><title>Chat que atrapa el pegado</title></head><body style="font:16px Arial;padding:20px">
  <p id="parrafo">Revisar el contrato de Albania antes del viernes.</p>
  <div id="caja" contenteditable="true" style="border:1px solid #ccc;min-height:30px"></div>
  <script>
    document.addEventListener('paste', (e) => {
      e.preventDefault(); e.stopPropagation();
      document.getElementById('caja').textContent += e.clipboardData.getData('text/plain');
    }, true);
  </script></body></html>`;
// Otra que lo bloquea desde window, antes de que cargue el script.
const ATRAPA_VENTANA = ATRAPA_DOCUMENTO.replace("document.addEventListener('paste'", "window.addEventListener('paste'");

const fallas = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + '  ' + m); if (!c) fallas.push(m); };
const nav = await chromium.launch();
const ctx = await nav.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1280, height: 800 } });
const memoria = {};
await ctx.exposeBinding('__gmSet', (_f, k, v) => { if (v === undefined) delete memoria[k]; else memoria[k] = v; });
await ctx.route('https://atrapa.local/documento', (r) => r.fulfill({ contentType: 'text/html', body: ATRAPA_DOCUMENTO }));
await ctx.route('https://atrapa.local/ventana', (r) => r.fulfill({ contentType: 'text/html', body: ATRAPA_VENTANA }));
const SHIM = (mem) => `(() => {
  const o = Element.prototype.attachShadow; Element.prototype.attachShadow = function (x) { return (window.__sombra = o.call(this, Object.assign({}, x, { mode: 'open' }))); };
  const mem = ${JSON.stringify(mem)};
  window.GM_getValue = (k, d) => (k in mem && mem[k] != null ? JSON.parse(JSON.stringify(mem[k])) : d);
  window.GM_setValue = (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); window.__gmSet(k, mem[k]); };
  window.GM_deleteValue = (k) => { delete mem[k]; window.__gmSet(k, undefined); };
  window.GM_listValues = () => Object.keys(mem);
  window.GM_addValueChangeListener = () => 0; window.GM_removeValueChangeListener = () => {};
  window.GM_setClipboard = (t) => navigator.clipboard.writeText(t); window.GM_registerMenuCommand = () => {};
  window.GM_addStyle = () => {}; window.GM_openInTab = () => {}; window.GM_xmlhttpRequest = (o) => o.onerror && o.onerror();
})();`;
async function abrir(url) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fallas.push('error de página: ' + e.message));
  await p.goto(url);
  await p.evaluate(SHIM(memoria)); await p.evaluate(H2C); await p.evaluate(SCRIPT);
  await p.waitForTimeout(300);
  return p;
}
const notas = () => Object.keys(memoria).filter((k) => k.startsWith('postit:') && memoria[k]).map((k) => memoria[k]).sort((a, b) => (b.orden || 0) - (a.orden || 0));

for (const [url, como] of [['https://atrapa.local/documento', 'desde el documento'], ['https://atrapa.local/ventana', 'desde window, antes que el script']]) {
  const p = await abrir(url);
  await p.evaluate(() => navigator.clipboard.writeText('Llamar a Fabián mañana'));
  await p.evaluate(() => window.__sombra.querySelector('.pnuevo').click());
  await p.waitForTimeout(150);
  await p.keyboard.press('Control+V');
  await p.waitForTimeout(500);
  ok((await p.evaluate(() => window.__sombra.querySelector('.pt-titulo').value)) === 'Llamar a Fabián mañana', `pegar en el título funciona aunque la página atrape el pegado ${como}`);
  // Si la página lo atrapa desde window antes que el script, también se queda con su copia: eso no se puede evitar.
  if (como.startsWith('desde el documento')) ok((await p.evaluate(() => document.getElementById('caja').textContent)) === '', `y la caja de la página no se queda con lo pegado (${como})`);
  await p.evaluate(() => { const t = window.__sombra.querySelector('.pt-nueva-in'); t.focus(); });
  await p.keyboard.press('Control+V');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);
  ok(notas()[0].titulo === 'Llamar a Fabián mañana' && notas()[0].items.some((i) => i.texto === 'Llamar a Fabián mañana'), `lo pegado queda guardado en el post-it (${como})`);
  await p.keyboard.press('Escape');
  await p.close();
}

// «+ Nuevo» con texto seleccionado: la selección entra al post-it con su origen
const p = await abrir('https://atrapa.local/documento');
await p.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('parrafo')); getSelection().removeAllRanges(); getSelection().addRange(r); });
await p.evaluate(() => window.__sombra.querySelector('.pnuevo').click());
await p.waitForTimeout(150);
const n = notas()[0];
ok(n.items[0] && n.items[0].texto === 'Revisar el contrato de Albania antes del viernes.', '«+ Nuevo» con texto seleccionado lo pone como tarea');
ok(n.origen.url.startsWith('https://atrapa.local/documento#:~:text=Revisar%20el%20contrato'), '…y guarda la dirección con salto a ese párrafo');
ok(await p.evaluate(() => window.__sombra.activeElement && window.__sombra.activeElement.classList.contains('pt-titulo')), '…y deja el cursor en el título para escribirlo');
await p.keyboard.press('Escape');
await p.evaluate(() => getSelection().removeAllRanges());
await p.mouse.click(600, 600);
await p.evaluate(() => window.__sombra.querySelector('.pnuevo').click());
await p.waitForTimeout(150);
ok(notas()[0].id !== n.id && !notas()[0].items.length, 'sin selección, «+ Nuevo» crea un post-it vacío (control)');

await nav.close();
console.log(fallas.length ? `\n${fallas.length} FALLAS` : '\nTodo en orden.');
process.exit(fallas.length ? 1 : 0);
