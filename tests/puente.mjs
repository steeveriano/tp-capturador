// Prueba del puente Hermes ⇄ ChatGPT con dos pestañas reales de Chromium y Tampermonkey simulado.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPT = readFileSync(path.join(raiz, 'tp-capturador.user.js'), 'utf8');
const H2C = readFileSync(require.resolve('html2canvas/dist/html2canvas.min.js'), 'utf8');

const SESION = 'local-abc123';
const URL_HERMES = `https://hermes-asus.tierraparaiso.net/chat?profile=default&resume=${SESION}`;
const URL_CHATGPT = 'https://chatgpt.com/c/conversacion-1';

const PAGINA_HERMES = `<!doctype html><html><head><title>Hermes Agent - Dashboard</title></head><body style="background:#000;color:#0f0">
  <div class="xterm"><textarea class="xterm-helper-textarea"></textarea><canvas></canvas></div>
  <script>
    window.__pegado = [];
    document.querySelector('.xterm-helper-textarea').addEventListener('paste', (e) => {
      window.__pegado.push(e.clipboardData.getData('text/plain')); e.preventDefault();
    });
  </script></body></html>`;

const PAGINA_CHATGPT = `<!doctype html><html><head><title>ChatGPT</title></head><body>
  <main>
    <div data-message-author-role="user"><div>Pregunta vieja</div></div>
    <div data-message-author-role="assistant"><div class="markdown">Respuesta vieja de ChatGPT</div></div>
    <div data-message-author-role="user"><div>Otra pregunta</div></div>
    <div data-message-author-role="assistant"><div class="markdown">Plan final:\n1. Revisar respaldos\n2. Llamar al 317 723 5440</div></div>
  </main>
  <form><div id="prompt-textarea" contenteditable="true" class="ProseMirror" style="min-height:40px;border:1px solid #ccc"></div></form>
  <script>
    document.querySelector('#prompt-textarea').addEventListener('paste', (e) => {
      e.preventDefault();
      e.target.innerText += e.clipboardData.getData('text/plain');
    });
  </script></body></html>`;

const MENSAJES = {
  session_id: SESION,
  messages: [
    { role: 'user', content: 'hola', timestamp: 1 },
    { role: 'assistant', content: 'Respuesta intermedia', timestamp: 2 },
    { role: 'tool', content: '{"x":1}', timestamp: 3 },
    { role: 'assistant', content: 'Respuesta final de Hermes:\n- punto A\n- punto B', timestamp: 5 },
    { role: 'assistant', content: '', timestamp: 6, tool_calls: [{}] },
  ],
  pagination: { limit: 500, offset: 0, order: 'latest', returned: 5 },
};

const fallas = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + '  ' + m); if (!c) fallas.push(m); };

const nav = await chromium.launch();
const ctx = await nav.newContext();
const paginas = new Set();
const memoria = {};
await ctx.exposeBinding('__gmSet', async (fuente, k, v) => {
  memoria[k] = v;
  for (const p of paginas) if (p !== fuente.page) p.evaluate(([k, v]) => window.__gmNotify && window.__gmNotify(k, v), [k, v]).catch(() => {});
});
await ctx.route('https://hermes-asus.tierraparaiso.net/**', (r) => {
  const u = new URL(r.request().url());
  if (u.pathname === `/api/sessions/${SESION}/latest-descendant`) return r.fulfill({ json: { requested_session_id: SESION, session_id: SESION, path: [], changed: false } });
  if (u.pathname === `/api/sessions/${SESION}/messages`) return r.fulfill({ json: MENSAJES });
  return r.fulfill({ contentType: 'text/html', body: PAGINA_HERMES });
});
await ctx.route('https://chatgpt.com/**', (r) => r.fulfill({ contentType: 'text/html', body: PAGINA_CHATGPT }));

const SHIM = (mem) => `
  (() => {
    const orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (o) { const s = orig.call(this, Object.assign({}, o, { mode: 'open' })); window.__sombra = s; return s; };
    const mem = ${JSON.stringify(mem)};
    const oyentes = {}; let n = 0;
    const avisar = (k, viejo, v, remoto) => Object.values(oyentes).filter((o) => o.k === k).forEach((o) => o.cb(k, viejo, v, remoto));
    window.__gmNotify = (k, v) => { const viejo = mem[k]; mem[k] = v; avisar(k, viejo, v, true); };
    window.GM_getValue = (k, d) => (k in mem && mem[k] !== undefined ? JSON.parse(JSON.stringify(mem[k])) : d);
    window.GM_setValue = (k, v) => { const viejo = mem[k]; mem[k] = JSON.parse(JSON.stringify(v)); window.__gmSet(k, mem[k]); avisar(k, viejo, mem[k], false); };
    window.GM_addValueChangeListener = (k, cb) => { n++; oyentes[n] = { k, cb }; return n; };
    window.GM_removeValueChangeListener = (id) => { delete oyentes[id]; };
    window.GM_setClipboard = (t) => { window.__clip = t; };
    window.GM_registerMenuCommand = (t) => { (window.__menu = window.__menu || []).push(t); };
    window.GM_addStyle = (c) => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); };
    window.GM_openInTab = (u) => { (window.__tabs = window.__tabs || []).push(u); };
    window.GM_xmlhttpRequest = (o) => fetch(o.url, { method: o.method, body: o.data, headers: o.headers })
      .then(async (r) => o.onload({ status: r.status, responseText: await r.text() })).catch(() => o.onerror && o.onerror());
  })();`;

async function abrir(url) {
  const p = await ctx.newPage();
  paginas.add(p);
  p.on('pageerror', (e) => fallas.push('error en ' + url + ': ' + e.message));
  await p.goto(url);
  await p.evaluate(SHIM(memoria));
  await p.evaluate(H2C);
  await p.evaluate(SCRIPT);
  await p.waitForTimeout(300);
  return p;
}
const textos = (p, sel) => p.evaluate((s) => [...window.__sombra.querySelectorAll(s)].map((n) => n.textContent), sel);
const clicBoton = (p) => p.evaluate(() => window.__sombra.querySelector('.puente').click());
const promptChatGPT = (p) => p.evaluate(() => document.querySelector('#prompt-textarea').innerText);

const hermes = await abrir(URL_HERMES);
const chatgpt = await abrir(URL_CHATGPT);
await hermes.bringToFront();
await hermes.evaluate(() => window.dispatchEvent(new Event('focus')));

ok((await textos(hermes, '.puente'))[0]?.startsWith('Pasar a ChatGPT'), 'Hermes muestra el botón "Pasar a ChatGPT"');
ok((await textos(chatgpt, '.puente'))[0]?.startsWith('Pasar a Hermes'), 'ChatGPT muestra el botón "Pasar a Hermes"');

const lado = await hermes.evaluate(() => { const r = window.__sombra.querySelector('.puente').getBoundingClientRect(); return { derecha: innerWidth - r.right, fuente: getComputedStyle(window.__sombra.querySelector('.puente')).fontFamily }; });
ok(lado.derecha < 40, 'en Hermes el botón está a la derecha');
ok(!/^(serif|"?Times)/i.test(lado.fuente), 'el botón usa letra sin serifa');

// 1. Hermes → ChatGPT: última respuesta con texto, por la API de la sesión del enlace
await clicBoton(hermes);
await hermes.waitForTimeout(800);
const enChatGPT = await promptChatGPT(chatgpt);
ok(enChatGPT.includes('[Respuesta de Hermes]') && enChatGPT.includes('Respuesta final de Hermes') && enChatGPT.includes('- punto B'), 'la última respuesta de Hermes llega completa a la caja de ChatGPT');
ok(!enChatGPT.includes('Respuesta intermedia'), 'no mezcla respuestas anteriores');
ok((await textos(hermes, '.toast')).some((t) => t.includes('Pegué la última respuesta en ChatGPT')), 'Hermes confirma que ChatGPT recibió el texto');
ok((await textos(chatgpt, '.toast')).some((t) => t.includes('Llegó texto de Hermes')), 'ChatGPT avisa que llegó texto');
const par = memoria['puente:par'];
ok(par && par.hermes === URL_HERMES && par.chatgpt === URL_CHATGPT, 'queda emparejada la conversación de Hermes con la de ChatGPT');

// 2. ChatGPT → Hermes: última respuesta, pegada en la terminal sin enviar
await chatgpt.evaluate(() => window.dispatchEvent(new Event('focus')));
await clicBoton(chatgpt);
await chatgpt.waitForTimeout(800);
const enHermes = await hermes.evaluate(() => window.__pegado.at(-1) || '');
ok(enHermes.startsWith('[Respuesta de ChatGPT]') && enHermes.includes('Plan final:') && enHermes.includes('2. Llamar'), 'la última respuesta de ChatGPT llega a la terminal de Hermes');
ok(!enHermes.includes('Respuesta vieja'), 'toma la última respuesta de ChatGPT, no una anterior');

// 3. Lo seleccionado tiene prioridad sobre la última respuesta (Alt+P)
await chatgpt.evaluate(() => { const n = document.querySelector('[data-message-author-role="assistant"] .markdown').firstChild; const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 9); getSelection().removeAllRanges(); getSelection().addRange(r); });
await chatgpt.keyboard.press('Alt+p');
await chatgpt.waitForTimeout(800);
ok((await hermes.evaluate(() => window.__pegado.at(-1))) === '[Respuesta de ChatGPT]\n\nRespuesta', 'Alt+P con texto seleccionado pasa solo lo seleccionado');

// 4. ChatGPT todavía escribiendo: no pasa nada a medias
await chatgpt.evaluate(() => { getSelection().removeAllRanges(); const b = document.createElement('button'); b.dataset.testid = 'stop-button'; document.body.append(b); });
const antes = await hermes.evaluate(() => window.__pegado.length);
await clicBoton(chatgpt);
await chatgpt.waitForTimeout(500);
ok((await hermes.evaluate(() => window.__pegado.length)) === antes, 'mientras ChatGPT escribe, no se pasa nada');
ok((await textos(chatgpt, '.toast')).some((t) => t.includes('todavía está escribiendo')), 'avisa que ChatGPT todavía está escribiendo');
await chatgpt.evaluate(() => document.querySelector('[data-testid="stop-button"]').remove());

// 5. Sin la otra pestaña abierta: abre la conversación emparejada y deja el texto pendiente
await hermes.evaluate(() => window.dispatchEvent(new Event('pagehide')));
await hermes.waitForTimeout(200);
await clicBoton(chatgpt);
await chatgpt.waitForTimeout(600);
ok((await chatgpt.evaluate(() => window.__tabs || [])).includes(URL_HERMES), 'si Hermes no está abierto, abre la conversación emparejada');
ok(memoria['puente:pendiente']?.para === 'hermes', 'el texto queda pendiente para cuando cargue Hermes');
await hermes.close(); paginas.delete(hermes);
const hermes2 = await abrir(URL_HERMES);
await hermes2.waitForTimeout(2200);
ok((await hermes2.evaluate(() => window.__pegado.at(-1) || '')).includes('Plan final:'), 'la pestaña de Hermes que se abre recibe el texto pendiente');
ok(!memoria['puente:pendiente'], 'el pendiente se consume una sola vez');

// 6. Otros sitios no muestran el botón
const otro = await ctx.newPage(); paginas.add(otro);
await ctx.route('https://prueba.local/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>nada</body></html>' }));
await otro.goto('https://prueba.local/'); await otro.evaluate(SHIM(memoria)); await otro.evaluate(H2C); await otro.evaluate(SCRIPT); await otro.waitForTimeout(200);
ok(!(await otro.evaluate(() => !!(window.__sombra && window.__sombra.querySelector('.puente')))), 'el botón del puente no aparece en otros sitios');

await nav.close();
console.log(fallas.length ? `\n${fallas.length} falla(s):\n- ${fallas.join('\n- ')}` : '\nPuente: todo en verde.');
process.exit(fallas.length ? 1 : 0);
