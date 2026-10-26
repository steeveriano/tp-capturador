// ==UserScript==
// @name         TP Capturador
// @namespace    https://github.com/steeveriano/tp-capturador
// @version      2.3.1
// @description  Contactos a Google Sheets, menú propio de clic derecho, historial del portapapeles, recorte de zonas y puente Hermes ⇄ ChatGPT.
// @author       Steeve Riaño · tierraparaiso
// @homepageURL  https://github.com/steeveriano/tp-capturador
// @supportURL   https://github.com/steeveriano/tp-capturador/issues
// @updateURL    https://raw.githubusercontent.com/steeveriano/tp-capturador/main/tp-capturador.user.js
// @downloadURL  https://raw.githubusercontent.com/steeveriano/tp-capturador/main/tp-capturador.user.js
// @match        *://*/*
// @noframes
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js#sha256=e87e550794322e574a1fda0c1549a3c70dae5a93d9113417a429016838eab8cb
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      tierraparaiso.net
// ==/UserScript==

/*
 * TP Capturador · código fuente único.
 * Reglas para quien lo modifique (personas o Claude Code): ver AGENTS.md del repositorio.
 * Ningún secreto vive aquí: la dirección de la hoja y la clave llegan por el enlace de activación
 * y quedan guardadas solo en el almacenamiento de Tampermonkey de cada perfil de Chrome.
 */
(function () {
  'use strict';
  if (window.top !== window.self) return;

  const VERSION = '2.3.1';
  const REPO = 'https://github.com/steeveriano/tp-capturador';
  const HOST = location.hostname;

  // ───────────────────────── Configuración y almacenamiento ─────────────────────────
  const CFG_BASE = {
    endpoint: '',          // URL de la aplicación web de Apps Script
    token: '',             // clave que valida el Apps Script
    hoja: '',              // URL de la hoja, solo para abrirla
    perfil: '',            // nombre de este perfil de Chrome
    retencionHoras: 24,    // cuánto vive el historial
    maxHistorial: 100,
    resaltar: true,        // subrayar teléfonos y correos
    barraSeleccion: true,  // barra flotante al seleccionar texto
    menuDerecho: true,     // menú propio en clic derecho
    omitirSecretos: false, // si se enciende, no guarda en el historial lo que parezca contraseña o token
    puenteEncabezado: true, // al pasar entre Hermes y ChatGPT, anteponer "[Respuesta de …]"
  };
  const cfg = () => Object.assign({}, CFG_BASE, GM_getValue('cfg', {}));
  const setCfg = (cambios) => GM_setValue('cfg', Object.assign(cfg(), cambios));
  const desactivados = () => GM_getValue('desactivados', []);
  const sitioDesactivado = () => desactivados().includes(HOST);

  function alternarSitio() {
    const lista = desactivados();
    const i = lista.indexOf(HOST);
    if (i >= 0) lista.splice(i, 1); else lista.push(HOST);
    GM_setValue('desactivados', lista);
    location.reload();
  }

  // ───────────────────────── Interfaz aislada (Shadow DOM) ─────────────────────────
  const ESTILOS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .menu, .barra, .panel, .toast, .tip, .resultado {
      position: fixed; background: #111827; color: #f9fafb; border: 1px solid #374151;
      border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.35); font-size: 13px; line-height: 1.35;
    }
    .menu { min-width: 240px; max-width: 340px; padding: 6px; }
    .menu .sec { padding: 6px 10px 3px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: #9ca3af; }
    .menu .sep { height: 1px; background: #374151; margin: 5px 4px; }
    .menu button, .barra button, .panel button, .resultado button {
      all: unset; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 7px 10px; border-radius: 6px; color: #f9fafb; font-size: 13px; white-space: nowrap;
    }
    .menu button { width: 100%; box-sizing: border-box; }
    .menu button:hover, .barra button:hover, .panel button:hover, .resultado button:hover { background: #1f2937; }
    .menu button .k { color: #9ca3af; font-size: 11px; }
    .menu .pie { padding: 6px 10px 4px; color: #6b7280; font-size: 11px; }
    .menu .valor { padding: 2px 10px 6px; color: #fcd34d; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .barra { display: flex; gap: 2px; padding: 4px; }
    .barra button { padding: 6px 9px; font-size: 12px; }
    .tip { padding: 5px 9px; font-size: 12px; pointer-events: none; background: #1f2937; }
    .toasts { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
    .toast { position: static; padding: 10px 14px; max-width: 380px; }
    .toast.ok { border-color: #059669; } .toast.error { border-color: #dc2626; } .toast.aviso { border-color: #d97706; }
    .panel { right: 16px; top: 16px; bottom: 16px; width: 400px; display: flex; flex-direction: column; padding: 0; overflow: hidden; }
    .panel header { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #374151; font-weight: 600; }
    .panel input { all: unset; margin: 10px 14px; padding: 8px 10px; background: #1f2937; border-radius: 6px; color: #f9fafb; font-size: 13px; }
    .panel .lista { flex: 1; overflow-y: auto; padding: 0 8px 8px; }
    .panel .item { padding: 8px 8px; border-radius: 8px; cursor: pointer; }
    .panel .item:hover, .panel .item.sel { background: #1f2937; }
    .panel .item .t { white-space: pre-wrap; word-break: break-word; max-height: 4.2em; overflow: hidden; }
    .panel .item .m { color: #9ca3af; font-size: 11px; margin-top: 3px; display: flex; justify-content: space-between; gap: 8px; }
    .panel .item .acc { display: none; gap: 4px; margin-top: 4px; }
    .panel .item:hover .acc { display: flex; }
    .panel .item .acc button { padding: 3px 8px; font-size: 11px; background: #374151; }
    .panel footer { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; border-top: 1px solid #374151; color: #9ca3af; font-size: 11px; }
    .panel .vacio { color: #9ca3af; padding: 20px 8px; text-align: center; }
    .capa { position: fixed; inset: 0; cursor: crosshair; background: rgba(17,24,39,.25); }
    .caja { position: fixed; border: 2px solid #f59e0b; background: rgba(245,158,11,.12); display: none; }
    .ayuda { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); background: #111827; color: #f9fafb; padding: 8px 14px; border-radius: 8px; font-size: 13px; }
    .resultado { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(720px, 92vw); max-height: 88vh; display: flex; flex-direction: column; }
    .resultado header { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #374151; font-weight: 600; }
    .resultado .cuerpo { overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
    .resultado img { max-width: 100%; border: 1px solid #374151; border-radius: 6px; background: #fff; }
    .resultado textarea { all: unset; white-space: pre-wrap; background: #1f2937; border-radius: 6px; padding: 8px 10px; min-height: 80px; max-height: 200px; overflow: auto; font-size: 12px; }
    .resultado .acciones { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px; border-top: 1px solid #374151; }
    .resultado .acciones button { background: #1f2937; }
    .puente { all: unset; position: fixed; bottom: 18px; cursor: pointer; display: flex; gap: 10px; align-items: center;
      padding: 9px 14px; border-radius: 999px; background: #b45309; color: #fff; font-size: 13px; font-weight: 600;
      box-shadow: 0 6px 18px rgba(0,0,0,.35); }
    .puente:hover { background: #d97706; }
    .puente .k { font-weight: 400; opacity: .75; font-size: 11px; }
    .puente { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .puente.hermes { right: 24px; }
    .puente.chatgpt { right: 22px; bottom: 120px; }
  `;

  let raiz = null;
  let sombra = null;
  function ui() {
    if (raiz && raiz.isConnected) return sombra;
    if (!raiz) {
      raiz = document.createElement('tp-capturador');
      raiz.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
      sombra = raiz.attachShadow({ mode: 'closed' });
      const st = document.createElement('style');
      st.textContent = ESTILOS;
      sombra.appendChild(st);
      // Evita que un clic en la interfaz robe el foco del campo donde se va a pegar.
      sombra.addEventListener('mousedown', (e) => {
        const t = e.composedPath()[0];
        if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement)) e.preventDefault();
      });
    }
    (document.body || document.documentElement).appendChild(raiz);
    return sombra;
  }
  const esDeLaUI = (e) => !!raiz && e.composedPath().includes(raiz);

  function h(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
      else if (k === 'class') n.className = v;
      else if (v !== undefined && v !== null) n.setAttribute(k, v);
    }
    for (const c of hijos.flat()) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : String(c));
    return n;
  }

  function ubicar(nodo, x, y) {
    nodo.style.left = '0px'; nodo.style.top = '0px'; nodo.style.visibility = 'hidden';
    const r = nodo.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    nodo.style.left = Math.max(6, Math.min(x, vw - r.width - 6)) + 'px';
    nodo.style.top = Math.max(6, Math.min(y, vh - r.height - 6)) + 'px';
    nodo.style.visibility = 'visible';
  }

  let caja = null;
  function toast(msg, tipo) {
    const s = ui();
    if (!caja || !caja.isConnected) { caja = h('div', { class: 'toasts' }); s.appendChild(caja); }
    const t = h('div', { class: 'toast ' + (tipo || '') }, msg);
    caja.appendChild(t);
    setTimeout(() => t.remove(), tipo === 'error' ? 6000 : 3500);
  }

  // ───────────────────────── Portapapeles e historial ─────────────────────────
  function pareceSecreto(t) {
    const s = t.trim();
    if (/^(sk-|sk_live|ghp_|gho_|github_pat_|xox[abp]-|AKIA|eyJ[A-Za-z0-9_-]{10,}\.)/.test(s)) return true;
    if (/\s/.test(s) || s.length < 8 || s.length > 512) return false;
    if (/^https?:\/\//i.test(s) || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s) || /^\+?[\d\s().-]+$/.test(s)) return false;
    const clases = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(s)).length;
    return clases >= 3 && (/\d/.test(s) || /[^A-Za-z0-9]/.test(s));
  }

  function historial() {
    const c = cfg();
    const limite = Date.now() - c.retencionHoras * 3600e3;
    return GM_getValue('historial', []).filter((x) => x.t >= limite);
  }

  function registrar(texto, origen, elemento) {
    if (!texto || !texto.trim()) return;
    const c = cfg();
    if (elemento && elemento.matches && elemento.matches('input[type=password], [autocomplete="one-time-code"], [autocomplete="current-password"], [autocomplete="new-password"]')) return;
    if (c.omitirSecretos && pareceSecreto(texto)) return;
    const recortado = texto.length > 20000 ? texto.slice(0, 20000) : texto;
    const lista = historial().filter((x) => x.texto !== recortado);
    lista.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), texto: recortado, sitio: HOST, titulo: document.title.slice(0, 120), origen });
    GM_setValue('historial', lista.slice(0, c.maxHistorial));
  }

  function copiar(texto, origen) {
    GM_setClipboard(texto, 'text');
    registrar(texto, origen || 'menú');
  }

  function textoDeCampo(el) {
    if (!el || el.selectionStart === undefined || el.selectionStart === null) return '';
    try { return el.value.slice(el.selectionStart, el.selectionEnd); } catch (_) { return ''; }
  }

  function esCampoTexto(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return !el.readOnly && !el.disabled;
    if (el.tagName === 'INPUT') {
      const tipo = (el.type || 'text').toLowerCase();
      return ['text', 'search', 'email', 'tel', 'url', 'number'].includes(tipo) && !el.readOnly && !el.disabled;
    }
    return false;
  }

  function editableDe(el) {
    if (!el || el.nodeType !== 1) el = el && el.parentElement;
    if (!el) return null;
    if (esCampoTexto(el)) return el;
    const ce = el.closest('[contenteditable]:not([contenteditable="false"])');
    return ce && ce.isContentEditable ? ce : null;
  }

  function seleccionActual() {
    const a = document.activeElement;
    if (esCampoTexto(a) || (a && a.tagName === 'INPUT' && a.type === 'password')) return { texto: textoDeCampo(a), elemento: a };
    const s = getSelection();
    return { texto: s ? s.toString() : '', elemento: s && s.anchorNode ? s.anchorNode.parentElement : null };
  }

  // Copias hechas por el usuario con Ctrl+C / Ctrl+X o el menú nativo.
  document.addEventListener('copy', () => { const s = seleccionActual(); registrar(s.texto, 'copiar', s.elemento); }, true);
  document.addEventListener('cut', () => { const s = seleccionActual(); registrar(s.texto, 'cortar', s.elemento); }, true);

  // Guarda dónde estaba el cursor para poder pegar después de abrir un menú.
  function capturarDestino(objetivo) {
    const editable = editableDe(objetivo) || editableDe(document.activeElement);
    const d = { editable, inputSel: null, rango: null };
    if (!editable) return d;
    if (esCampoTexto(editable)) d.inputSel = { ini: editable.selectionStart, fin: editable.selectionEnd };
    else {
      const s = getSelection();
      if (s.rangeCount && editable.contains(s.getRangeAt(0).commonAncestorContainer)) d.rango = s.getRangeAt(0).cloneRange();
    }
    return d;
  }

  function pegarEn(destino, texto) {
    const el = destino && destino.editable;
    if (!el || !el.isConnected) { copiar(texto, 'historial'); toast('Copiado. No había un campo abierto donde pegar.', 'aviso'); return; }
    el.focus();
    let ok = false;
    if (esCampoTexto(el)) {
      if (destino.inputSel) try { el.setSelectionRange(destino.inputSel.ini, destino.inputSel.fin); } catch (_) { /* number no admite selección */ }
      ok = document.execCommand('insertText', false, texto);
      if (!ok) {
        try { el.setRangeText(texto, el.selectionStart, el.selectionEnd, 'end'); } catch (_) { el.value += texto; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        ok = true;
      }
    } else {
      const s = getSelection();
      if (destino.rango) { s.removeAllRanges(); s.addRange(destino.rango); }
      ok = document.execCommand('insertText', false, texto);
      if (!ok && s.rangeCount) {
        const r = s.getRangeAt(0);
        r.deleteContents();
        r.insertNode(document.createTextNode(texto));
        r.collapse(false);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: texto }));
        ok = true;
      }
    }
    if (ok) registrar(texto, 'pegar');
  }

  function cortarEn(destino) {
    const el = destino && destino.editable;
    if (!el) return;
    el.focus();
    let texto = '';
    if (esCampoTexto(el)) {
      if (destino.inputSel) el.setSelectionRange(destino.inputSel.ini, destino.inputSel.fin);
      texto = textoDeCampo(el);
    } else {
      const s = getSelection();
      if (destino.rango) { s.removeAllRanges(); s.addRange(destino.rango); }
      texto = s.toString();
    }
    if (!texto) return;
    copiar(texto, 'cortar');
    if (!document.execCommand('delete')) {
      if (esCampoTexto(el)) { el.setRangeText('', el.selectionStart, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  }

  async function leerPortapapelesSistema() {
    try { return await navigator.clipboard.readText(); }
    catch (_) { toast('Chrome no dejó leer el portapapeles en este sitio. Usa el historial o Ctrl+V.', 'aviso'); return null; }
  }

  // ───────────────────────── Detección de contactos ─────────────────────────
  // Celular colombiano (3xx), fijo colombiano nuevo (60x) o internacional con "+".
  const TEL_RE = /(?<![\w+/=])(?:(?:\+|00)57[\s.-]?)?\(?(?:3\d{2}|60\d)\)?[\s.-]?\d{3}[\s.-]?\d{4}(?![\w/])|(?<![\w+/=])\+(?!57)\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?![\w/])/g;
  const MAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}\b/g;
  const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

  function normalizarTel(raw) {
    let d = raw.replace(/[^\d+]/g, '');
    if (d.startsWith('00')) d = '+' + d.slice(2);
    const solo = d.replace(/\D/g, '');
    if (!d.startsWith('+')) d = /^(3\d{9}|60\d{8})$/.test(solo) ? '+57' + solo : '+' + solo;
    return d;
  }

  function contactosEn(texto) {
    const out = [];
    MAIL_RE.lastIndex = 0;
    let m;
    while ((m = MAIL_RE.exec(texto))) {
      if (IMG_EXT.test(m[0])) continue;
      out.push({ ini: m.index, fin: m.index + m[0].length, tipo: 'correo', valor: m[0].toLowerCase() });
    }
    TEL_RE.lastIndex = 0;
    while ((m = TEL_RE.exec(texto))) {
      const digitos = m[0].replace(/\D/g, '').length;
      if (digitos < 10 || digitos > 15) continue;
      const ini = m.index, fin = ini + m[0].length;
      if (out.some((o) => ini < o.fin && fin > o.ini)) continue;
      out.push({ ini, fin, tipo: 'telefono', valor: normalizarTel(m[0]) });
    }
    return out.sort((a, b) => a.ini - b.ini);
  }

  function contactoDeEnlace(a) {
    if (!a || !a.href) return null;
    const href = a.getAttribute('href') || '';
    if (/^tel:/i.test(href)) return { tipo: 'telefono', valor: normalizarTel(decodeURIComponent(href.slice(4))) };
    if (/^mailto:/i.test(href)) return { tipo: 'correo', valor: decodeURIComponent(href.slice(7).split('?')[0]).toLowerCase() };
    const wa = href.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=)\+?(\d{8,15})/i);
    if (wa) return { tipo: 'telefono', valor: '+' + wa[1] };
    return null;
  }

  const soportaResaltado = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function';
  const resTel = soportaResaltado ? new Highlight() : null;
  const resMail = soportaResaltado ? new Highlight() : null;
  const porNodo = new WeakMap();
  const MAX_COINCIDENCIAS = 4000;
  let coincidencias = 0;
  const OMITIR = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'SELECT', 'OPTION', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'TP-CAPTURADOR', 'HEAD']);

  function limpiarNodo(nodo) {
    const prev = porNodo.get(nodo);
    if (!prev) return;
    for (const p of prev) if ((p.tipo === 'telefono' ? resTel : resMail).delete(p.rango)) coincidencias--;
    porNodo.delete(nodo);
  }

  function procesarTexto(nodo) {
    limpiarNodo(nodo);
    const t = nodo.data;
    if (!t || t.length < 6 || t.length > 20000 || !/[\d@]/.test(t)) return;
    const encontrados = contactosEn(t);
    if (!encontrados.length) return;
    const lista = [];
    for (const c of encontrados) {
      if (coincidencias >= MAX_COINCIDENCIAS) break;
      const r = document.createRange();
      r.setStart(nodo, c.ini); r.setEnd(nodo, c.fin);
      (c.tipo === 'telefono' ? resTel : resMail).add(r);
      lista.push(Object.assign(c, { rango: r }));
      coincidencias++;
    }
    if (lista.length) porNodo.set(nodo, lista);
  }

  function recorrer(raizNodo, cola) {
    if (raizNodo.nodeType === 3) { cola.push(raizNodo); return; }
    if (raizNodo.nodeType !== 1 || OMITIR.has(raizNodo.nodeName.toUpperCase())) return;
    const w = document.createTreeWalker(raizNodo, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1) return OMITIR.has(n.nodeName.toUpperCase()) || n.isContentEditable ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        return n.data.length >= 6 && /[\d@]/.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    let n;
    while ((n = w.nextNode())) cola.push(n);
  }

  const pendientes = new Set();
  let programado = false;
  const enReposo = window.requestIdleCallback ? (fn) => requestIdleCallback(fn, { timeout: 800 }) : (fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 50);

  function programar() {
    if (programado) return;
    programado = true;
    enReposo(trabajar);
  }

  function trabajar(plazo) {
    programado = false;
    const cola = [];
    for (const n of pendientes) { pendientes.delete(n); if (n.isConnected) recorrer(n, cola); if (cola.length > 3000) break; }
    let i = 0;
    for (; i < cola.length; i++) {
      procesarTexto(cola[i]);
      if (i % 50 === 0 && plazo.timeRemaining() < 2) break;
    }
    for (let j = i + 1; j < cola.length; j++) pendientes.add(cola[j]);
    if (pendientes.size) programar();
  }

  function podar() {
    for (const hl of [resTel, resMail]) for (const r of [...hl]) if (!r.startContainer.isConnected && hl.delete(r)) coincidencias--;
  }

  function iniciarResaltado() {
    if (!soportaResaltado) return;
    GM_addStyle(`
      ::highlight(tp-tel) { background-color: rgba(234,179,8,.28); text-decoration: underline 2px rgba(202,138,4,.9); }
      ::highlight(tp-mail) { background-color: rgba(59,130,246,.16); text-decoration: underline 2px rgba(37,99,235,.8); }
    `);
    CSS.highlights.set('tp-tel', resTel);
    CSS.highlights.set('tp-mail', resMail);
    pendientes.add(document.body);
    programar();
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') pendientes.add(m.target);
        else for (const n of m.addedNodes) if (n !== raiz) pendientes.add(n);
      }
      if (pendientes.size) programar();
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(podar, 30000);
  }

  function contactoEnPunto(x, y) {
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (!r || r.startContainer.nodeType !== 3) return null;
    const lista = porNodo.get(r.startContainer);
    if (!lista) return null;
    for (const c of lista) {
      if (r.startOffset < c.ini || r.startOffset > c.fin) continue;
      for (const rc of c.rango.getClientRects()) if (x >= rc.left - 2 && x <= rc.right + 2 && y >= rc.top - 2 && y <= rc.bottom + 2) return c;
    }
    return null;
  }

  // ───────────────────────── Envío a la hoja de Google ─────────────────────────
  function post(url, datos) {
    return new Promise((res, rej) => {
      GM_xmlhttpRequest({
        method: 'POST', url, data: JSON.stringify(datos), timeout: 20000,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        onload: (r) => { try { res(JSON.parse(r.responseText)); } catch (_) { rej(new Error('respuesta ' + r.status)); } },
        onerror: () => rej(new Error('red')),
        ontimeout: () => rej(new Error('tiempo')),
      });
    });
  }

  function encolar(datos) {
    const cola = GM_getValue('cola', []);
    cola.push(datos);
    GM_setValue('cola', cola.slice(-500));
    return cola.length;
  }

  async function guardar(registro) {
    const c = cfg();
    if (!c.endpoint || !c.token) { toast('Este perfil no está activado. Abre el enlace de activación (bóveda: tp_capturador_enlace_activacion).', 'error'); return; }
    const datos = Object.assign({
      token: c.token, perfil: c.perfil, version: VERSION, sitio: HOST,
      titulo: document.title.slice(0, 300), url: location.origin + location.pathname, fechaCliente: new Date().toISOString(),
    }, registro);
    try {
      const r = await post(c.endpoint, datos);
      if (r.ok && r.repetido) toast(`Ya estaba en la hoja (fila ${r.fila}).`, 'aviso');
      else if (r.ok) toast(`Guardado en la hoja (fila ${r.fila}).`, 'ok');
      else toast('La hoja rechazó el envío: ' + (r.error || 'sin detalle') + '. Revisa la activación.', 'error');
    } catch (e) {
      const n = encolar(datos);
      toast(`Sin conexión con la hoja (${e.message}). Quedó en cola: ${n}.`, 'aviso');
    }
  }

  async function vaciarCola(forzar) {
    const cola = GM_getValue('cola', []);
    if (!cola.length) { if (forzar) toast('No hay envíos pendientes.'); return; }
    const ahora = Date.now();
    if (!forzar && ahora - GM_getValue('colaIntento', 0) < 60000) return;
    GM_setValue('colaIntento', ahora);
    const c = cfg();
    if (!c.endpoint || !c.token) return;
    const quedan = [];
    let enviados = 0;
    for (const d of cola) {
      try { const r = await post(c.endpoint, Object.assign({}, d, { token: c.token })); if (r.ok) enviados++; else quedan.push(d); }
      catch (_) { quedan.push(d); }
    }
    GM_setValue('cola', quedan);
    if (enviados || forzar) toast(`Pendientes enviados: ${enviados}. Siguen en cola: ${quedan.length}.`, quedan.length ? 'aviso' : 'ok');
  }

  // ───────────────────────── Menús flotantes ─────────────────────────
  let abierto = null; // { nodo, tipo }
  function cerrar() { if (abierto) { abierto.nodo.remove(); abierto = null; } }
  function abrir(nodo, x, y, tipo) {
    cerrar();
    ui().appendChild(nodo);
    ubicar(nodo, x, y);
    abierto = { nodo, tipo };
  }

  const boton = (texto, accion, atajo) => h('button', { on: { click: (e) => { e.stopPropagation(); cerrar(); accion(); } } }, h('span', null, texto), atajo ? h('span', { class: 'k' }, atajo) : null);
  const seccion = (t) => h('div', { class: 'sec' }, t);
  const sep = () => h('div', { class: 'sep' });

  function accionesContacto(c) {
    const items = [
      boton('Guardar en la hoja', () => guardar({ tipo: c.tipo, valor: c.valor })),
      boton('Guardar con nota…', () => { const nota = prompt('Nota para ' + c.valor + ':'); if (nota !== null) guardar({ tipo: c.tipo, valor: c.valor, nota }); }),
      boton('Copiar', () => { copiar(c.valor); toast('Copiado: ' + c.valor, 'ok'); }),
    ];
    if (c.tipo === 'telefono') {
      items.push(boton('Abrir en WhatsApp', () => GM_openInTab('https://wa.me/' + c.valor.replace(/\D/g, ''), { active: true })));
      items.push(boton('Llamar', () => { location.href = 'tel:' + c.valor; }));
    } else {
      items.push(boton('Escribir correo', () => { location.href = 'mailto:' + c.valor; }));
    }
    items.push(boton('Buscar en Google', () => GM_openInTab('https://www.google.com/search?q=' + encodeURIComponent('"' + c.valor + '"'), { active: true })));
    return items;
  }

  function menuContacto(c, x, y) {
    const nodo = h('div', { class: 'menu' }, seccion(c.tipo === 'telefono' ? 'Teléfono' : 'Correo'), h('div', { class: 'valor' }, c.valor), accionesContacto(c));
    abrir(nodo, x + 4, y + 10, 'contacto');
  }

  function menuContextual(e) {
    const x = e.clientX, y = e.clientY;
    const destino = capturarDestino(e.target);
    const sel = seleccionActual().texto;
    const enlace = e.target.closest ? e.target.closest('a[href]') : null;
    const imagen = e.target.closest ? e.target.closest('img') : null;
    const contacto = contactoEnPunto(x, y) || contactoDeEnlace(enlace);
    const items = [];

    if (contacto) items.push(seccion(contacto.tipo === 'telefono' ? 'Teléfono' : 'Correo'), h('div', { class: 'valor' }, contacto.valor), ...accionesContacto(contacto), sep());

    if (sel.trim()) {
      items.push(seccion('Selección'));
      items.push(boton('Copiar', () => copiar(sel), 'Ctrl+C'));
      if (destino.editable) items.push(boton('Cortar', () => cortarEn(destino), 'Ctrl+X'));
      items.push(boton('Guardar en la hoja', () => guardar({ tipo: 'texto', valor: sel })));
      items.push(boton('Buscar en Google', () => GM_openInTab('https://www.google.com/search?q=' + encodeURIComponent(sel.slice(0, 300)), { active: true })));
      items.push(sep());
    }

    if (destino.editable) {
      const ultimo = historial()[0];
      items.push(seccion('Pegar'));
      if (ultimo) items.push(boton('Pegar lo último copiado', () => pegarEn(destino, ultimo.texto), 'historial'));
      items.push(boton('Pegar del portapapeles de Windows', async () => { const t = await leerPortapapelesSistema(); if (t) pegarEn(destino, t); }, 'Ctrl+V'));
      items.push(boton('Pegar desde el historial…', () => abrirHistorial(destino), 'Alt+V'));
      items.push(sep());
    }

    if (enlace && !contacto) {
      items.push(seccion('Enlace'));
      items.push(boton('Copiar dirección del enlace', () => copiar(enlace.href)));
      items.push(boton('Copiar texto del enlace', () => copiar(enlace.innerText.trim())));
      items.push(sep());
    }
    if (imagen) {
      items.push(seccion('Imagen'));
      items.push(boton('Copiar dirección de la imagen', () => copiar(imagen.currentSrc || imagen.src)));
      items.push(sep());
    }

    if (LADO) {
      items.push(seccion('Puente'));
      items.push(boton('Pasar a… ' + (sel.trim() ? '(lo seleccionado)' : '(última respuesta)'), () => elegirChat(x, y)));
      items.push(boton(`Pasar directo a ${LADOS[OTRO].nombre} emparejado`, pasarRapido, 'Alt+P'));
      items.push(sep());
    }
    items.push(seccion('Página'));
    items.push(boton('Recortar una zona…', iniciarRecorte));
    items.push(boton('Lupa (rueda para ampliar)', () => iniciarLupa(x, y), 'Alt+L'));
    if (!destino.editable) items.push(boton('Historial del portapapeles', () => abrirHistorial(null), 'Alt+V'));
    items.push(boton('Copiar título y dirección', () => copiar(document.title + '\n' + location.href)));
    items.push(boton('Guardar esta página en la hoja', () => guardar({ tipo: 'pagina', valor: location.origin + location.pathname, nota: document.title })));
    items.push(sep());
    items.push(boton('Desactivar en este sitio', alternarSitio));
    items.push(boton('Pedir un cambio a Claude Code', pedirCambio));
    items.push(h('div', { class: 'pie' }, 'Clic derecho otra vez o Ctrl+clic derecho: menú de Chrome'));

    abrir(h('div', { class: 'menu' }, items), x, y, 'contextual');
  }

  // Barra flotante al seleccionar texto
  function mostrarBarra() {
    const c = cfg();
    if (!c.barraSeleccion) return;
    const { texto, elemento } = seleccionActual();
    const t = texto.trim();
    if (t.length < 2) return;
    let rect;
    const s = getSelection();
    if (s.rangeCount && s.toString()) rect = s.getRangeAt(0).getBoundingClientRect();
    else if (elemento) rect = elemento.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return;
    const destino = capturarDestino(elemento);
    const unico = contactosEn(t);
    const contacto = unico.length === 1 && unico[0].ini === 0 && unico[0].fin === t.length ? unico[0] : null;
    const botones = [
      boton('Copiar', () => { copiar(texto); toast('Copiado.', 'ok'); }),
      destino.editable ? boton('Cortar', () => cortarEn(destino)) : null,
      boton('Guardar', () => guardar(contacto ? { tipo: contacto.tipo, valor: contacto.valor } : { tipo: 'texto', valor: texto })),
      contacto && contacto.tipo === 'telefono' ? boton('WhatsApp', () => GM_openInTab('https://wa.me/' + contacto.valor.replace(/\D/g, ''), { active: true })) : null,
      boton('Buscar', () => GM_openInTab('https://www.google.com/search?q=' + encodeURIComponent(t.slice(0, 300)), { active: true })),
      boton('Recortar', iniciarRecorte),
    ].filter(Boolean);
    const nodo = h('div', { class: 'barra' }, botones);
    abrir(nodo, rect.left, rect.top - 44 < 6 ? rect.bottom + 8 : rect.top - 44, 'barra');
  }

  // ───────────────────────── Historial (panel) ─────────────────────────
  function hace(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return `hace ${m} min`;
    return `hace ${Math.round(m / 60)} h`;
  }

  let panelHist = null;
  function abrirHistorial(destino) {
    cerrar();
    if (panelHist) panelHist.remove();
    const s = ui();
    const lista = h('div', { class: 'lista' });
    const buscar = h('input', { placeholder: 'Buscar en el historial…', type: 'text' });
    let filtro = '';
    let marcado = 0;
    const panel = h('div', { class: 'panel' },
      h('header', null, h('span', null, destino && destino.editable ? 'Pegar desde el historial' : 'Historial del portapapeles'), boton('Cerrar', () => {})),
      buscar, lista,
      h('footer', null, h('span', null, `Se guarda ${cfg().retencionHoras} h, solo en este perfil`), h('button', { on: { click: () => { if (confirm('¿Borrar todo el historial de este perfil?')) { GM_setValue('historial', []); pintar(); } } } }, 'Borrar todo')));
    panel.querySelector('header button').addEventListener('click', () => panel.remove());

    function usar(it) {
      panel.remove();
      if (destino && destino.editable) pegarEn(destino, it.texto);
      else { copiar(it.texto, 'historial'); toast('Copiado. Pégalo con Ctrl+V o clic derecho.', 'ok'); }
    }

    function pintar() {
      const items = historial().filter((x) => !filtro || x.texto.toLowerCase().includes(filtro));
      lista.replaceChildren();
      if (!items.length) { lista.append(h('div', { class: 'vacio' }, filtro ? 'Nada coincide.' : 'Todavía no has copiado nada en este perfil.')); return; }
      marcado = Math.min(marcado, items.length - 1);
      items.forEach((it, i) => {
        const fila = h('div', { class: 'item' + (i === marcado ? ' sel' : '') },
          h('div', { class: 't' }, it.texto.length > 400 ? it.texto.slice(0, 400) + '…' : it.texto),
          h('div', { class: 'm' }, h('span', null, it.sitio), h('span', null, hace(it.t))),
          h('div', { class: 'acc' },
            h('button', { on: { click: (e) => { e.stopPropagation(); copiar(it.texto, 'historial'); toast('Copiado.', 'ok'); } } }, 'Copiar'),
            h('button', { on: { click: (e) => { e.stopPropagation(); guardar({ tipo: 'texto', valor: it.texto, nota: 'desde historial · ' + it.sitio }); } } }, 'A la hoja'),
            h('button', { on: { click: (e) => { e.stopPropagation(); GM_setValue('historial', historial().filter((x) => x.id !== it.id)); pintar(); } } }, 'Borrar')));
        fila.addEventListener('click', () => usar(it));
        lista.append(fila);
      });
    }

    buscar.addEventListener('input', () => { filtro = buscar.value.toLowerCase(); marcado = 0; pintar(); });
    buscar.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const items = historial().filter((x) => !filtro || x.texto.toLowerCase().includes(filtro));
      if (e.key === 'Escape') panel.remove();
      else if (e.key === 'ArrowDown') { marcado = Math.min(marcado + 1, items.length - 1); pintar(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { marcado = Math.max(marcado - 1, 0); pintar(); e.preventDefault(); }
      else if (e.key === 'Enter' && items[marcado]) usar(items[marcado]);
    });
    panelHist = panel;
    s.appendChild(panel);
    pintar();
    buscar.focus();
  }


  // ───────────────────────── Lupa ─────────────────────────
  // Amplía la página alrededor del cursor. Rueda: ampliar o reducir. Mover el mouse: recorrer.
  // Esc, clic derecho o reducir hasta 1× para salir. Los clics siguen funcionando con la lupa puesta.
  let lupa = null;
  function iniciarLupa(x, y) {
    if (lupa) return;
    cerrar();
    const html = document.documentElement;
    lupa = {
      z: 2, x: x === undefined ? innerWidth / 2 : x, y: y === undefined ? innerHeight / 2 : y,
      previo: { transform: html.style.transform, origin: html.style.transformOrigin, overflow: html.style.overflow, transition: html.style.transition },
    };
    html.style.overflow = 'hidden';
    html.style.transition = 'transform 80ms ease-out';
    aplicarLupa();
    window.addEventListener('wheel', ruedaLupa, { capture: true, passive: false });
    window.addEventListener('mousemove', moverLupa, { capture: true, passive: true });
    window.addEventListener('keydown', teclaLupa, true);
    window.addEventListener('contextmenu', salirLupaClicDerecho, true);
    toast('Lupa 2×. Rueda: ampliar o reducir. Esc o clic derecho: salir.', 'ok');
  }
  function aplicarLupa() {
    const html = document.documentElement;
    html.style.transformOrigin = `${lupa.x + scrollX}px ${lupa.y + scrollY}px`;
    html.style.transform = `scale(${lupa.z})`;
  }
  function ruedaLupa(e) {
    e.preventDefault();
    e.stopPropagation();
    lupa.z = Math.min(8, lupa.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    if (lupa.z <= 1.02) { salirLupa(); return; }
    aplicarLupa();
  }
  function moverLupa(e) { lupa.x = e.clientX; lupa.y = e.clientY; aplicarLupa(); }
  function teclaLupa(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); salirLupa(); } }
  function salirLupaClicDerecho(e) { e.preventDefault(); e.stopImmediatePropagation(); salirLupa(); }
  function salirLupa() {
    if (!lupa) return;
    const html = document.documentElement;
    html.style.transform = lupa.previo.transform;
    html.style.transformOrigin = lupa.previo.origin;
    html.style.overflow = lupa.previo.overflow;
    html.style.transition = lupa.previo.transition;
    window.removeEventListener('wheel', ruedaLupa, { capture: true });
    window.removeEventListener('mousemove', moverLupa, { capture: true });
    window.removeEventListener('keydown', teclaLupa, true);
    window.removeEventListener('contextmenu', salirLupaClicDerecho, true);
    lupa = null;
  }

  // ───────────────────────── Recorte de zona ─────────────────────────
  function textoEnZona(z) {
    const partes = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1) return OMITIR.has(n.nodeName.toUpperCase()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        return n.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const r = document.createRange();
    let n, vistos = 0;
    while ((n = w.nextNode()) && vistos++ < 30000) {
      r.selectNodeContents(n);
      for (const rc of r.getClientRects()) {
        const cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
        if (cx >= z.left && cx <= z.left + z.width && cy >= z.top && cy <= z.top + z.height) {
          partes.push({ top: Math.round(rc.top / 6), left: rc.left, texto: n.data.trim() });
          break;
        }
      }
    }
    partes.sort((a, b) => a.top - b.top || a.left - b.left);
    let out = '', fila = null;
    for (const p of partes) { out += fila === null ? p.texto : (p.top === fila ? ' ' : '\n') + p.texto; fila = p.top; }
    return out;
  }

  function iniciarRecorte() {
    cerrar();
    const s = ui();
    const cuadro = h('div', { class: 'caja' });
    const capa = h('div', { class: 'capa' }, cuadro, h('div', { class: 'ayuda' }, 'Arrastra para recortar · Esc para cancelar'));
    let x0 = 0, y0 = 0, activo = false, zona = null;
    const dibujar = (ev) => {
      zona = { left: Math.min(x0, ev.clientX), top: Math.min(y0, ev.clientY), width: Math.abs(ev.clientX - x0), height: Math.abs(ev.clientY - y0) };
      Object.assign(cuadro.style, { display: 'block', left: zona.left + 'px', top: zona.top + 'px', width: zona.width + 'px', height: zona.height + 'px' });
    };
    const salir = () => { capa.remove(); document.removeEventListener('keydown', esc, true); };
    const esc = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); salir(); } };
    capa.addEventListener('mousedown', (ev) => { activo = true; x0 = ev.clientX; y0 = ev.clientY; dibujar(ev); });
    capa.addEventListener('mousemove', (ev) => { if (activo) dibujar(ev); });
    capa.addEventListener('mouseup', () => {
      activo = false;
      salir();
      if (zona && zona.width > 8 && zona.height > 8) procesarRecorte(zona);
    });
    capa.addEventListener('contextmenu', (ev) => { ev.preventDefault(); salir(); });
    document.addEventListener('keydown', esc, true);
    s.appendChild(capa);
  }

  async function procesarRecorte(z) {
    const texto = textoEnZona(z);
    let blob = null, url = null;
    if (typeof html2canvas === 'function') {
      toast('Procesando el recorte…');
      try {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const lienzo = await html2canvas(document.body, {
          x: z.left + window.scrollX, y: z.top + window.scrollY, width: z.width, height: z.height,
          scale: window.devicePixelRatio || 1, useCORS: true, logging: false, backgroundColor: null,
          ignoreElements: (el) => el === raiz,
        });
        blob = await new Promise((r) => lienzo.toBlob(r, 'image/png'));
        url = blob ? URL.createObjectURL(blob) : null;
      } catch (e) {
        toast('No pude generar la imagen en esta página (' + (e && e.message ? e.message.slice(0, 80) : 'error') + '). El texto sí quedó.', 'aviso');
      }
    }
    mostrarResultado(texto, blob, url);
  }

  function mostrarResultado(texto, blob, url) {
    const s = ui();
    const area = h('textarea', { readonly: 'readonly' });
    area.value = texto || '(no hay texto legible en esa zona)';
    const nodo = h('div', { class: 'resultado' },
      h('header', null, h('span', null, 'Recorte'), h('button', { on: { click: () => quitar() } }, 'Cerrar')),
      h('div', { class: 'cuerpo' }, url ? h('img', { src: url, alt: 'Recorte' }) : null, area),
      h('div', { class: 'acciones' },
        blob ? h('button', { on: { click: async () => {
          try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Imagen copiada. Pégala con Ctrl+V en WhatsApp, correo o documentos.', 'ok'); }
          catch (_) { toast('Chrome no dejó copiar la imagen aquí. Usa Descargar.', 'aviso'); }
        } } }, 'Copiar imagen') : null,
        texto ? h('button', { on: { click: () => { copiar(texto, 'recorte'); toast('Texto copiado.', 'ok'); } } }, 'Copiar texto') : null,
        blob ? h('button', { on: { click: () => {
          const a = document.createElement('a');
          a.href = url; a.download = `recorte-${HOST}-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`;
          a.click();
        } } }, 'Descargar imagen') : null,
        texto ? h('button', { on: { click: () => guardar({ tipo: 'recorte', valor: texto }) } }, 'Guardar texto en la hoja') : null));
    const quitar = () => { nodo.remove(); if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); };
    cerrar();
    s.appendChild(nodo);
  }

  // ───────────────────────── Puente entre pestañas (Hermes ⇄ ChatGPT) ─────────────────────────
  // Un clic toma la última respuesta (o lo seleccionado) y la pega en la caja de la otra pestaña.
  // Nunca envía: la persona revisa y pulsa Enter.
  const VIVA_MS = 10 * 60e3;

  function getJSON(url) {
    return new Promise((res, rej) => GM_xmlhttpRequest({
      method: 'GET', url, timeout: 15000,
      onload: (r) => {
        if (r.status !== 200) return rej(new Error('Hermes respondió ' + r.status + '. Recarga la página de Hermes.'));
        try { res(JSON.parse(r.responseText)); } catch (_) { rej(new Error('Hermes no devolvió datos (¿venció el acceso de Cloudflare? recarga la página).')); }
      },
      onerror: () => rej(new Error('sin conexión con Hermes')),
      ontimeout: () => rej(new Error('Hermes tardó demasiado')),
    }));
  }

  async function sesionHermes() {
    let id = new URLSearchParams(location.search).get('resume');
    if (!id) {
      const j = await getJSON(location.origin + '/api/sessions?limit=20');
      const s = (j.sessions || []).filter((x) => x.message_count > 0)
        .sort((a, b) => (b.last_activity_at || b.started_at || 0) - (a.last_activity_at || a.started_at || 0))[0];
      if (!s) throw new Error('No encontré una conversación de Hermes con mensajes.');
      id = s.id;
    }
    try {
      const d = await getJSON(`${location.origin}/api/sessions/${encodeURIComponent(id)}/latest-descendant`);
      if (d && d.session_id) id = d.session_id;
    } catch (_) { /* sin descendiente: se usa la misma */ }
    return id;
  }

  async function leerHermes() {
    const id = await sesionHermes();
    const j = await getJSON(`${location.origin}/api/sessions/${encodeURIComponent(id)}/messages`);
    const arr = (j.messages || []).filter((m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim());
    if (!arr.length) throw new Error('Esa conversación de Hermes todavía no tiene respuestas.');
    arr.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return arr[arr.length - 1].content.trim();
  }

  async function leerChatGPT() {
    if (document.querySelector('[data-testid="stop-button"], button[aria-label*="Detener"], button[aria-label*="Stop streaming"]')) {
      throw new Error('ChatGPT todavía está escribiendo. Espera a que termine.');
    }
    const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
    const ult = msgs[msgs.length - 1];
    if (!ult) throw new Error('No encontré respuestas de ChatGPT en esta pestaña.');
    return (ult.querySelector('.markdown') || ult).innerText.trim();
  }

  async function esperarElemento(selectores, ms) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      for (const s of selectores) { const e = document.querySelector(s); if (e) return e; }
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  }

  // Pega como lo haría Ctrl+V: el sitio recibe un evento "paste" con el texto. Sirve para la
  // terminal de Hermes (xterm) y para el editor de ChatGPT, y respeta los saltos de línea.
  function pegarPorEvento(el, texto) {
    el.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', texto);
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  }

  async function escribirHermes(texto) {
    const ta = await esperarElemento(['.xterm-helper-textarea'], 5000);
    if (!ta) throw new Error('esa pestaña de Hermes no tiene el Chat abierto');
    if (!pegarPorEvento(ta, texto)) throw new Error('la terminal de Hermes no aceptó el texto');
  }

  async function escribirChatGPT(texto) {
    const el = await esperarElemento(['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]', 'form [contenteditable="true"]', 'form textarea'], 5000);
    if (!el) throw new Error('no encontré la caja de texto de ChatGPT');
    const largo = () => (el.value !== undefined ? el.value : el.innerText || '').length;
    const antes = largo();
    pegarPorEvento(el, texto);
    await new Promise((r) => setTimeout(r, 200));
    if (largo() <= antes) {
      el.focus();
      if (!document.execCommand('insertText', false, texto)) throw new Error('ChatGPT no aceptó el texto');
    }
  }

  const LADOS = {
    hermes: { nombre: 'Hermes', es: () => /^hermes[\w-]*\.tierraparaiso\.net$/.test(HOST), leer: leerHermes, escribir: escribirHermes },
    chatgpt: { nombre: 'ChatGPT', es: () => /^(chatgpt\.com|chat\.openai\.com)$/.test(HOST), leer: leerChatGPT, escribir: escribirChatGPT },
  };
  const LADO = Object.keys(LADOS).find((k) => LADOS[k].es()) || null;
  const OTRO = LADO === 'hermes' ? 'chatgpt' : LADO === 'chatgpt' ? 'hermes' : null;
  const ID_PESTANA = (() => {
    try {
      let id = sessionStorage.getItem('tp-pestana');
      if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('tp-pestana', id); }
      return id;
    } catch (_) { return Math.random().toString(36).slice(2, 10); }
  })();

  function claveConversacion(url) {
    try {
      const u = new URL(url);
      if (/chatgpt\.com|openai\.com/.test(u.hostname)) return u.hostname + u.pathname;
      const r = u.searchParams.get('resume');
      return u.hostname + (r ? '#' + r : u.pathname);
    } catch (_) { return url; }
  }
  const mismaConversacion = (a, b) => !!a && !!b && claveConversacion(a) === claveConversacion(b);

  function tituloConversacion() {
    if (LADO === 'hermes') {
      const h1 = document.querySelector('header h1, main h1, h1');
      const t = h1 && h1.innerText.trim();
      const r = new URLSearchParams(location.search).get('resume');
      return (t && !/^chat$/i.test(t) ? t : 'Chat') + (r ? ' · ' + r.slice(-6) : '');
    }
    return document.title.replace(/\s*[-|·]\s*ChatGPT\s*$/i, '').trim() || 'ChatGPT';
  }

  function presencia(cambios) {
    const p = GM_getValue('puente:pestanas', {});
    const ahora = Date.now();
    for (const [k, v] of Object.entries(p)) if (ahora - v.t > VIVA_MS) delete p[k];
    if (cambios === null) delete p[ID_PESTANA];
    else p[ID_PESTANA] = Object.assign(p[ID_PESTANA] || {}, { lado: LADO, url: location.href, titulo: tituloConversacion().slice(0, 80), t: ahora }, cambios || {});
    GM_setValue('puente:pestanas', p);
  }

  // Todas las conversaciones abiertas en otras pestañas de este perfil (Hermes y ChatGPT),
  // primero la emparejada y luego la última que tuvo el foco.
  function candidatos() {
    const p = GM_getValue('puente:pestanas', {});
    const par = GM_getValue('puente:par', {}) || {};
    return Object.entries(p)
      .filter(([id, v]) => id !== ID_PESTANA && LADOS[v.lado] && Date.now() - v.t < VIVA_MS)
      .map(([id, v]) => Object.assign({ id, emparejada: mismaConversacion(v.url, par[v.lado]) && v.lado !== LADO }, v))
      .sort((a, b) => (b.emparejada - a.emparejada) || ((b.lado === OTRO) - (a.lado === OTRO)) || ((b.foco || b.t) - (a.foco || a.t)));
  }

  function guardarPar(ladoDestino, urlDestino) {
    if (!urlDestino || ladoDestino === LADO) return;
    GM_setValue('puente:par', { [LADO]: location.href, [ladoDestino]: urlDestino, t: Date.now() });
  }

  async function textoAPasar() {
    let texto = seleccionActual().texto.trim();
    let que = 'lo seleccionado';
    if (!texto) {
      texto = await LADOS[LADO].leer();
      que = 'la última respuesta';
    }
    if (!texto) throw new Error('No encontré qué pasar.');
    const cuerpo = cfg().puenteEncabezado ? `[Respuesta de ${LADOS[LADO].nombre}]\n\n${texto}` : texto;
    return { cuerpo, que };
  }

  async function enviarA(dest) {
    let t;
    try { t = await textoAPasar(); } catch (e) { toast(e.message, 'error'); return; }
    const nombre = `${LADOS[dest.lado].nombre} «${dest.titulo}»`;
    const msg = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), de: LADO, para: dest.lado, texto: t.cuerpo, url: location.href, t: Date.now() };
    if (dest.abrir) {
      GM_setValue('puente:pendiente', Object.assign(msg, { destino: null, urlDestino: dest.url }));
      GM_openInTab(dest.url, { active: true });
      toast(`Abrí ${nombre}; el texto se pega cuando cargue.`, 'aviso');
      return;
    }
    msg.destino = dest.id;
    let respondio = false;
    const oyente = GM_addValueChangeListener('puente:ack', (_k, _v, ack) => {
      if (!ack || ack.id !== msg.id) return;
      respondio = true;
      GM_removeValueChangeListener(oyente);
      if (ack.ok) { guardarPar(dest.lado, ack.url); toast(`Pegué ${t.que} en ${nombre}. Ve a esa pestaña, revisa y pulsa Enter.`, 'ok'); }
      else toast(`${nombre} no pudo pegarlo: ${ack.error}.`, 'error');
    });
    setTimeout(() => {
      if (respondio) return;
      GM_removeValueChangeListener(oyente);
      toast(`${nombre} no respondió. Haz clic una vez en esa pestaña (Chrome la tenía dormida) y repite.`, 'error');
    }, 9000);
    GM_setValue('puente:mensaje', msg);
  }

  // Alt+P: directo a la conversación emparejada o a la última usada del otro lado.
  function pasarRapido() {
    if (!LADO) return;
    const c = candidatos().find((x) => x.lado === OTRO);
    if (c) { enviarA(c); return; }
    const parOtro = (GM_getValue('puente:par', {}) || {})[OTRO];
    if (parOtro) { enviarA({ lado: OTRO, url: parOtro, titulo: 'emparejada', abrir: true }); return; }
    toast(`No hay ninguna pestaña de ${LADOS[OTRO].nombre} abierta en este perfil. Ábrela y vuelve a pulsar.`, 'error');
  }

  // Botón: muestra a qué conversación enviar.
  function elegirChat(x, y) {
    if (!LADO) return;
    const lista = candidatos();
    const par = GM_getValue('puente:par', {}) || {};
    const items = [seccion('Pasar a…'), h('div', { class: 'valor' }, seleccionActual().texto.trim() ? 'Lo seleccionado' : 'La última respuesta de esta pestaña')];
    for (const c of lista) {
      items.push(h('button', { on: { click: (e) => { e.stopPropagation(); cerrar(); enviarA(c); } } },
        h('span', null, `${LADOS[c.lado].nombre} · ${c.titulo}`),
        h('span', { class: 'k' }, c.emparejada ? 'emparejada' : c.lado === LADO ? 'mismo tipo' : '')));
    }
    if (par[OTRO] && !lista.some((c) => c.lado === OTRO && mismaConversacion(c.url, par[OTRO]))) {
      items.push(boton(`Abrir la emparejada de ${LADOS[OTRO].nombre} y pegar ahí`, () => enviarA({ lado: OTRO, url: par[OTRO], titulo: 'emparejada', abrir: true })));
    }
    if (!lista.length && !par[OTRO]) items.push(h('div', { class: 'pie' }, `No hay otra conversación de Hermes o ChatGPT abierta en este perfil de Chrome.`));
    items.push(h('div', { class: 'pie' }, 'Alt+P envía directo a la emparejada. Nada se envía solo: revisas y pulsas Enter.'));
    abrir(h('div', { class: 'menu' }, items), x, y, 'contextual');
  }

  async function recibir(msg) {
    let ack;
    try {
      await LADOS[LADO].escribir(msg.texto);
      ack = { id: msg.id, ok: true, url: location.href };
      toast(`Llegó texto de ${LADOS[msg.de].nombre}. Revisa y pulsa Enter para enviarlo.`, 'ok');
    } catch (e) {
      ack = { id: msg.id, ok: false, error: e.message };
    }
    GM_setValue('puente:ack', ack);
    return ack;
  }

  let botonPuente = null;
  function iniciarPuente() {
    if (!LADO) return;
    presencia({ foco: document.hasFocus() ? Date.now() : 0 });
    setInterval(() => { if (!document.hidden) presencia(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) presencia({ foco: Date.now() }); });
    window.addEventListener('focus', () => presencia({ foco: Date.now() }));
    window.addEventListener('pagehide', () => presencia(null));

    GM_addValueChangeListener('puente:mensaje', (_k, _v, msg) => {
      if (msg && msg.para === LADO && msg.destino === ID_PESTANA) recibir(msg);
    });

    const pend = GM_getValue('puente:pendiente', null);
    if (pend && pend.para === LADO && Date.now() - pend.t < 120000 && mismaConversacion(pend.urlDestino, location.href)) {
      GM_setValue('puente:pendiente', null);
      setTimeout(async () => {
        const a = await recibir(pend);
        if (a.ok && pend.de !== LADO) GM_setValue('puente:par', { [LADO]: location.href, [pend.de]: pend.url, t: Date.now() });
      }, 1500);
    }

    const s = ui();
    botonPuente = h('button', {
      class: 'puente ' + LADO, title: 'Elige a qué conversación pasar la última respuesta (o lo seleccionado). Alt+P: directo a la emparejada.',
      on: { click: (e) => { e.stopPropagation(); const r = botonPuente.getBoundingClientRect(); elegirChat(r.left, r.top - 10); } },
    }, 'Pasar a…', h('span', { class: 'k' }, 'Alt+P'));
    s.appendChild(botonPuente);
  }

  // ───────────────────────── Activación y comandos ─────────────────────────
  function revisarActivacion() {
    if (HOST !== 'github.com' || !location.pathname.toLowerCase().startsWith('/steeveriano/tp-capturador')) return;
    const p = new URLSearchParams(location.hash.slice(1));
    if (!p.has('tp-activar')) return;
    const endpoint = p.get('e') || '', token = p.get('k') || '', hoja = p.get('h') || '';
    history.replaceState(null, '', location.pathname + location.search);
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint) || token.length < 20) { toast('El enlace de activación está incompleto o dañado.', 'error'); return; }
    if (!confirm('¿Activar TP Capturador en este perfil de Chrome?\n\nLas capturas irán a tu hoja de Google.')) return;
    const perfil = prompt('Nombre de este perfil (para saber de dónde vino cada captura):', cfg().perfil || '') || cfg().perfil || 'sin nombre';
    setCfg({ endpoint, token, hoja, perfil });
    toast(`Activado en el perfil "${perfil}". Prueba: selecciona un texto y pulsa Guardar.`, 'ok');
  }

  function configurarAMano() {
    const c = cfg();
    const endpoint = prompt('Dirección de la aplicación web de Apps Script (termina en /exec):', c.endpoint);
    if (endpoint === null) return;
    const token = prompt('Clave (token) de la hoja:', c.token);
    if (token === null) return;
    const perfil = prompt('Nombre de este perfil:', c.perfil) || c.perfil;
    setCfg({ endpoint: endpoint.trim(), token: token.trim(), perfil });
    toast('Configuración guardada.', 'ok');
  }

  function pedirCambio() {
    const cuerpo = [
      '**Qué quiero que haga:**', '', '',
      '**Dónde pasa:** ' + HOST + ' (no pegues datos personales ni claves aquí)',
      '**Versión instalada:** ' + VERSION,
      '**Perfil:** ' + (cfg().perfil || 'sin nombre'),
    ].join('\n');
    GM_openInTab(`${REPO}/issues/new?title=${encodeURIComponent('Cambio: ')}&body=${encodeURIComponent(cuerpo)}`, { active: true });
  }

  function registrarComandos() {
    if (sitioDesactivado()) { GM_registerMenuCommand('Activar en este sitio (' + HOST + ')', alternarSitio); return; }
    GM_registerMenuCommand('Historial del portapapeles (Alt+V)', () => abrirHistorial(capturarDestino(document.activeElement)));
    GM_registerMenuCommand('Recortar una zona', iniciarRecorte);
    GM_registerMenuCommand('Lupa (Alt+L)', () => iniciarLupa());
    const c = cfg();
    if (c.hoja) GM_registerMenuCommand('Abrir la hoja de capturas', () => GM_openInTab(c.hoja, { active: true }));
    GM_registerMenuCommand(`Enviar pendientes (${GM_getValue('cola', []).length})`, () => vaciarCola(true));
    GM_registerMenuCommand('Desactivar en este sitio (' + HOST + ')', alternarSitio);
    GM_registerMenuCommand((c.resaltar ? 'Apagar' : 'Encender') + ' resaltado de contactos', () => { setCfg({ resaltar: !cfg().resaltar }); location.reload(); });
    GM_registerMenuCommand((c.barraSeleccion ? 'Apagar' : 'Encender') + ' barra al seleccionar', () => setCfg({ barraSeleccion: !cfg().barraSeleccion }));
    GM_registerMenuCommand((c.menuDerecho ? 'Apagar' : 'Encender') + ' menú de clic derecho', () => setCfg({ menuDerecho: !cfg().menuDerecho }));
    if (LADO) {
      GM_registerMenuCommand(`Pasar directo a ${LADOS[OTRO].nombre} emparejado (Alt+P)`, pasarRapido);
      const par = GM_getValue('puente:par', null);
      if (par && par[OTRO]) GM_registerMenuCommand(`Abrir la conversación emparejada de ${LADOS[OTRO].nombre}`, () => GM_openInTab(par[OTRO], { active: true }));
      if (par) GM_registerMenuCommand('Olvidar el emparejamiento Hermes ⇄ ChatGPT', () => { GM_setValue('puente:par', null); toast('Emparejamiento borrado.', 'ok'); });
      GM_registerMenuCommand((c.puenteEncabezado ? 'Quitar' : 'Poner') + ' el encabezado "[Respuesta de …]" al pasar', () => setCfg({ puenteEncabezado: !cfg().puenteEncabezado }));
    }
    GM_registerMenuCommand('Configurar a mano', configurarAMano);
    GM_registerMenuCommand('Pedir un cambio a Claude Code', pedirCambio);
    GM_registerMenuCommand(`Versión ${VERSION} · perfil: ${c.perfil || 'sin activar'}`, () => GM_openInTab(REPO, { active: true }));
  }

  // ───────────────────────── Arranque ─────────────────────────
  revisarActivacion();
  registrarComandos();
  if (sitioDesactivado()) return;

  if (cfg().resaltar) iniciarResaltado();
  iniciarPuente();

  window.addEventListener('contextmenu', (e) => {
    if (!cfg().menuDerecho || e.defaultPrevented || esDeLaUI(e)) return; // el sitio tiene menú propio, o es nuestra UI
    if (e.ctrlKey || e.shiftKey || e.metaKey) { cerrar(); return; }     // atajo al menú de Chrome
    if (abierto && abierto.tipo === 'contextual') { cerrar(); return; }  // segundo clic derecho: menú de Chrome
    e.preventDefault();
    menuContextual(e);
  });

  document.addEventListener('click', (e) => {
    if (esDeLaUI(e)) return;
    cerrar();
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (e.target.closest && e.target.closest('a, button, input, textarea, select, label, [role=button], [contenteditable]:not([contenteditable="false"])')) return;
    if (getSelection().toString()) return;
    const c = contactoEnPunto(e.clientX, e.clientY);
    if (c) menuContacto(c, e.clientX, e.clientY);
  });

  let inicioArrastre = null;
  document.addEventListener('mousedown', (e) => { if (!esDeLaUI(e)) inicioArrastre = { x: e.clientX, y: e.clientY }; }, true);
  document.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || esDeLaUI(e)) return;
    const movio = inicioArrastre && Math.hypot(e.clientX - inicioArrastre.x, e.clientY - inicioArrastre.y) > 6;
    if (movio || e.detail >= 2) setTimeout(mostrarBarra, 10);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && abierto) { cerrar(); return; }
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyL') {
      e.preventDefault(); e.stopPropagation();
      if (lupa) salirLupa(); else iniciarLupa(ultimoPunto.x, ultimoPunto.y);
      return;
    }
    if (LADO && e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyP') {
      e.preventDefault(); e.stopPropagation();
      pasarRapido();
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyV') {
      e.preventDefault(); e.stopPropagation();
      abrirHistorial(capturarDestino(document.activeElement));
      return;
    }
    if (abierto && abierto.tipo === 'barra') cerrar();
  }, true);

  window.addEventListener('scroll', () => { if (abierto) cerrar(); }, { capture: true, passive: true });
  window.addEventListener('blur', () => { if (abierto && abierto.tipo !== 'contextual') cerrar(); });

  // Pista al pasar el mouse sobre un contacto
  let tip = null, ultimoMov = 0;
  const ultimoPunto = { x: undefined, y: undefined };
  document.addEventListener('mousemove', (e) => {
    ultimoPunto.x = e.clientX; ultimoPunto.y = e.clientY;
    const ahora = Date.now();
    if (ahora - ultimoMov < 120 || !soportaResaltado || !coincidencias) return;
    ultimoMov = ahora;
    const c = contactoEnPunto(e.clientX, e.clientY);
    if (!c) { if (tip) { tip.remove(); tip = null; } return; }
    if (!tip) { tip = h('div', { class: 'tip' }); ui().appendChild(tip); }
    tip.textContent = `${c.valor} · clic para opciones`;
    ubicar(tip, e.clientX + 14, e.clientY - 34);
  }, { passive: true });

  setTimeout(() => vaciarCola(false), 4000);
})();
