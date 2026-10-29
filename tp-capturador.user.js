// ==UserScript==
// @name         TP Capturador
// @namespace    https://github.com/steeveriano/tp-capturador
// @version      2.3.3
// @description  Contactos a Google Sheets, menú propio de clic derecho, historial del portapapeles, recorte de zonas, post-its del día y puente Hermes ⇄ ChatGPT.
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
// @grant        GM_deleteValue
// @grant        GM_listValues
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      tierraparaiso.net
// @connect      *
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

  const VERSION = '2.3.3';
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
    postits: true,         // pila de post-its en el borde derecho
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


    /* ── Vista previa del portapapeles e imágenes ── */
    .menu .prev:empty { display: none; }
    .menu .pv-b, .panel .pv-b { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 9px; width: 100%; padding: 6px 10px; border-radius: 6px; color: #f9fafb; font-size: 12.5px; }
    .menu .pv-b:hover, .panel .pv-b:hover { background: #1f2937; }
    .pv-img { flex: none; width: 40px; height: 30px; object-fit: cover; border-radius: 4px; background: #fff; border: 1px solid #374151; }
    .pv-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pv-t.tenue { color: #9ca3af; white-space: normal; padding: 6px 10px; font-size: 11.5px; }
    .pv-et { flex: none; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #111827; background: #93c5fd; border-radius: 4px; padding: 2px 5px; }
    .pv-b .k { flex: none; color: #9ca3af; font-size: 11px; }
    .menu .pv-pedir, .panel .pv-pedir { all: unset; cursor: pointer; display: block; margin: 2px 6px; padding: 6px 8px; border-radius: 6px; border: 1px dashed #4b5563; color: #93c5fd; font-size: 12px; }
    .menu .pv-pedir:hover, .panel .pv-pedir:hover { background: #1f2937; }
    .panel .windows { margin: 0 8px 6px; padding: 4px 0; border: 1px solid #374151; border-radius: 8px; }
    .panel .item .img { display: block; max-width: 100%; max-height: 120px; border-radius: 6px; background: #fff; margin-bottom: 4px; }
    .tmini { display: flex; align-items: center; gap: 10px; }
    .tmini img { width: 56px; height: 42px; object-fit: cover; border-radius: 4px; background: #fff; }
    /* ── Post-its ── */
    .menu .punto { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--c); margin-right: 8px; vertical-align: 1px; }
    .pdock { position: fixed; right: 0; display: flex; align-items: flex-start; pointer-events: none; }
    .pdock .pcol { width: 178px; display: flex; flex-direction: column; gap: 8px; padding: 0 8px 8px 10px; }
    .pdock.plegado .pcol { display: none; }
    .pdock .pcol > *, .pdock .ptab { pointer-events: auto; }
    .ptab { all: unset; cursor: pointer; writing-mode: vertical-rl; transform: rotate(180deg); display: flex; align-items: center; gap: 7px;
      padding: 12px 6px; background: #111827; color: #f9fafb; border: 1px solid #374151; border-left: 0; border-radius: 0 9px 9px 0;
      font: 600 11px/1 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: .06em; text-transform: uppercase; box-shadow: 0 6px 18px rgba(0,0,0,.3); user-select: none; }
    .ptab:hover { background: #1f2937; }
    .ptab b { background: #f59e0b; color: #111827; border-radius: 999px; padding: 4px 2px; min-height: 12px; text-align: center; font-size: 10px; letter-spacing: 0; }
    .phead { background: #111827; color: #d1d5db; border: 1px solid #374151; border-radius: 9px; padding: 7px 8px; display: flex; flex-direction: column; gap: 7px;
      font-size: 11px; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
    .phead .fila { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
    .phead b { color: #f9fafb; font-size: 12px; }
    .phead .pres { color: #9ca3af; font-size: 10.5px; margin-top: -4px; }
    .pnuevo { all: unset; cursor: pointer; white-space: nowrap; padding: 3px 8px; border-radius: 6px; background: #b45309; color: #fff; font-size: 11px; font-weight: 600; }
    .pnuevo:hover { background: #d97706; }
    .pfiltros { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
    .pfiltros button { all: unset; cursor: pointer; }
    .pfiltros .todas { padding: 2px 7px; border-radius: 999px; background: #374151; color: #e5e7eb; font-size: 10px; }
    .pfiltros .todas.on { background: #f9fafb; color: #111827; }
    .pfiltros .dot { width: 13px; height: 13px; border-radius: 50%; background: var(--c); opacity: .5; }
    .pfiltros .dot:hover { opacity: .85; }
    .pfiltros .dot.on { opacity: 1; box-shadow: 0 0 0 2px #111827, 0 0 0 3.5px #f9fafb; }
    .plista { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; padding: 2px 4px 4px 2px; margin: -2px -4px 0 -2px; scrollbar-width: thin; }
    .pvacio { background: #fffdf7; color: #4b5563; border-radius: 6px; padding: 10px; font-size: 11.5px; line-height: 1.4; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
    .pmini { all: unset; box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; gap: 5px; width: 100%; padding: 8px 10px 9px;
      background: color-mix(in srgb, var(--c) 13%, #fffdf6); color: #1f2937; border-top: 3px solid var(--c); border-radius: 2px 2px 4px 14px;
      box-shadow: 0 1px 2px rgba(0,0,0,.14), 0 6px 14px rgba(0,0,0,.16); transition: transform .12s ease, box-shadow .12s ease;
      font: 12px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .pmini:hover { transform: translateX(-3px); box-shadow: 0 2px 4px rgba(0,0,0,.16), 0 10px 22px rgba(0,0,0,.22); }
    .pmini.activa { outline: 2px solid var(--c); outline-offset: 2px; }
    .pmini.lista { opacity: .72; }
    .pmini.lista .pm-t { text-decoration: line-through; text-decoration-color: rgba(0,0,0,.35); }
    .pm-cat { display: flex; justify-content: space-between; gap: 6px; font-size: 9.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
      color: color-mix(in srgb, var(--c) 72%, #000); }
    .pm-edad { color: #6b7280; letter-spacing: 0; text-transform: none; font-weight: 600; }
    .pm-t { font-size: 12.5px; font-weight: 600; color: #111827; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
    .pm-prog { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: #4b5563; }
    .pm-barra { flex: 1; height: 4px; border-radius: 2px; background: rgba(0,0,0,.09); overflow: hidden; }
    .pm-barra i { display: block; height: 100%; background: var(--c); }
    .ptarjeta { position: fixed; width: 330px; max-height: 82vh; display: flex; flex-direction: column; overflow: hidden;
      background: color-mix(in srgb, var(--c) 9%, #fffdf8); color: #1f2937; border-top: 5px solid var(--c); border-radius: 4px 4px 8px 8px;
      box-shadow: 0 2px 5px rgba(0,0,0,.14), 0 20px 44px rgba(0,0,0,.3); font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .pt-cab { display: flex; align-items: center; gap: 2px; padding: 9px 8px 0 12px; }
    .pt-esp { flex: 1; }
    .pt-chip { all: unset; cursor: pointer; padding: 3px 9px; border-radius: 999px; background: var(--c); color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
    .pt-icono { all: unset; cursor: pointer; padding: 4px 7px; border-radius: 6px; color: #4b5563; font-size: 11.5px; }
    .pt-icono:hover { background: rgba(0,0,0,.07); color: #111827; }
    .pt-cats { display: flex; flex-wrap: wrap; gap: 5px; padding: 8px 12px 2px; }
    .pt-cats[hidden] { display: none; }
    .pt-cat { all: unset; cursor: pointer; padding: 3px 9px; border-radius: 999px; font-size: 11px; border: 1.5px solid var(--k, #9ca3af); color: color-mix(in srgb, var(--k, #6b7280) 75%, #000); background: #fff; }
    .pt-cat.on { background: var(--k); color: #fff; }
    .pt-cat.editar { border-style: dashed; border-color: #9ca3af; color: #4b5563; }
    .pt-titulo { all: unset; display: block; margin: 8px 12px 4px; font-size: 16px; font-weight: 700; color: #111827; }
    .pt-titulo::placeholder, .pt-nueva-in::placeholder, .pt-contexto::placeholder { color: #9ca3af; font-weight: 400; }
    .pt-lista { overflow-y: auto; padding: 2px 6px; scrollbar-width: thin; }
    .pt-fila { display: flex; align-items: flex-start; gap: 8px; padding: 4px 6px; border-radius: 6px; }
    .pt-fila:hover { background: rgba(0,0,0,.04); }
    .pt-fila .pt-icono { visibility: hidden; padding: 0 6px; font-size: 15px; line-height: 20px; }
    .pt-fila:hover .pt-icono { visibility: visible; }
    .pt-check { all: unset; box-sizing: border-box; cursor: pointer; flex: none; width: 16px; height: 16px; margin-top: 2px; border: 1.5px solid #6b7280; border-radius: 4px;
      background: #fff; display: grid; place-items: center; }
    .pt-check.on { background: var(--c); border-color: var(--c); }
    .pt-check.on::after { content: ''; width: 7px; height: 3.5px; border-left: 2px solid #fff; border-bottom: 2px solid #fff; transform: translateY(-1px) rotate(-45deg); }
    .pt-texto { all: unset; flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; field-sizing: content; min-height: 1.4em; max-height: 8.4em; overflow: auto; color: #1f2937; }
    .pt-fila.hecha .pt-texto { text-decoration: line-through; color: #6b7280; }
    .pt-link { color: #6b7280; text-decoration: none; font-size: 12px; line-height: 20px; }
    .pt-link:hover { color: #111827; }
    .pt-nueva { display: flex; align-items: center; gap: 8px; margin: 4px 12px 0; padding: 7px 0 5px; border-top: 1px dashed rgba(0,0,0,.16); }
    .pt-mas { width: 16px; text-align: center; color: #9ca3af; font-weight: 700; }
    .pt-nueva-in { all: unset; flex: 1; color: #1f2937; }
    .pt-contexto { all: unset; display: block; margin: 6px 12px 0; padding: 7px 9px; background: rgba(255,255,255,.7); border: 1px solid rgba(0,0,0,.08); border-radius: 6px;
      font-size: 12.5px; white-space: pre-wrap; word-break: break-word; field-sizing: content; min-height: 2.8em; max-height: 9em; overflow: auto; color: #1f2937; }
    .pt-pie { display: flex; justify-content: space-between; padding: 8px 12px 10px; font-size: 11px; color: #6b7280; }
    .pvelo { position: fixed; inset: 0; background: rgba(17,24,39,.5); display: grid; place-items: center; }
    .pmodal { width: min(560px, 92vw); max-height: 86vh; display: flex; flex-direction: column; overflow: hidden; background: #111827; color: #f9fafb;
      border: 1px solid #374151; border-radius: 12px; box-shadow: 0 24px 60px rgba(0,0,0,.45); font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .pmodal.pequeno { width: min(460px, 92vw); }
    .pmodal header { padding: 18px 20px 8px; }
    .pmodal h2 { margin: 0 0 4px; font-size: 18px; font-weight: 700; }
    .pmodal header p { margin: 0; color: #9ca3af; }
    .pm-acciones { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 10px 20px 4px; }
    .pm-acciones button { all: unset; cursor: pointer; display: flex; flex-direction: column; gap: 3px; padding: 10px 11px; border-radius: 9px; background: #1f2937; border: 1px solid #374151; }
    .pm-acciones button:hover { border-color: #6b7280; }
    .pm-acciones button.prim { background: #b45309; border-color: #b45309; }
    .pm-acciones button.prim:hover { background: #d97706; }
    .pm-acciones b { font-size: 13px; }
    .pm-acciones small { font-size: 11px; color: #d1d5db; line-height: 1.3; }
    .pm-acciones button:not(.prim) small { color: #9ca3af; }
    .pm-sub { padding: 12px 20px 4px; color: #9ca3af; font-size: 11.5px; }
    .pm-lista { overflow-y: auto; padding: 2px 12px 8px; scrollbar-width: thin; }
    .pm-nota { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 7px; cursor: pointer; }
    .pm-nota:hover { background: #1f2937; }
    .pm-nota.fuera .pm-nt { text-decoration: line-through; color: #6b7280; }
    .pm-nota .pt-check { margin: 0; border-color: #6b7280; background: transparent; }
    .pm-nota .pt-check.on { background: var(--c); border-color: var(--c); }
    .pm-cat-dot { flex: none; width: 82px; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: color-mix(in srgb, var(--c) 55%, #fff); }
    .pm-nt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pm-np { color: #9ca3af; font-size: 11px; font-variant-numeric: tabular-nums; }
    .pmodal footer { display: flex; align-items: center; gap: 8px; padding: 10px 20px 14px; border-top: 1px solid #374151; }
    .pmodal footer button { all: unset; cursor: pointer; padding: 7px 12px; border-radius: 7px; background: #1f2937; color: #e5e7eb; font-size: 12.5px; }
    .pmodal footer button:hover { background: #374151; }
    .pmodal footer button.prim { background: #f9fafb; color: #111827; font-weight: 600; }
    .pc-fila { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 7px; }
    .pc-fila:hover { background: #1f2937; }
    .pc-color { all: unset; cursor: pointer; width: 18px; height: 18px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 2px #111827, 0 0 0 3px #4b5563; }
    .pc-nombre { all: unset; flex: 1; padding: 4px 7px; border-radius: 5px; background: #1f2937; color: #f9fafb; }
    .pc-usos { color: #9ca3af; font-size: 11px; width: 70px; text-align: right; }
    .pc-quitar { all: unset; cursor: pointer; color: #fca5a5; font-size: 11.5px; padding: 3px 6px; border-radius: 5px; }
    .pc-quitar:hover { background: #3f1d1d; }
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
        if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement) && !(t instanceof HTMLSelectElement)) e.preventDefault();
      });
      // Lo que se escribe en un campo de la interfaz no llega a los atajos de teclado de la página.
      for (const tipo of ['keydown', 'keyup', 'keypress']) {
        sombra.addEventListener(tipo, (e) => {
          const t = e.composedPath()[0];
          if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) e.stopPropagation();
        });
      }
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
    const lista = historial().filter((x) => x.tipo === 'imagen' || x.texto !== recortado);
    lista.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), texto: recortado, sitio: HOST, titulo: document.title.slice(0, 120), origen });
    guardarHistorial(lista);
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
      items.push(boton('Agregar post-it…', () => menuPostit(sel.trim(), x, y)));
      items.push(boton('Buscar en Google', () => GM_openInTab('https://www.google.com/search?q=' + encodeURIComponent(sel.slice(0, 300)), { active: true })));
      items.push(sep());
    }

    // Lo que hay en Windows ahora y las últimas copias, con vista previa. Clic: pega (en un campo) o copia.
    items.push(seccion(destino.editable ? 'Pegar' : 'Portapapeles'));
    items.push(filaWindows(destino, cerrar));
    for (const it of historial().slice(0, 3)) items.push(filaPrevia(it, destino, cerrar));
    items.push(boton(destino.editable ? 'Pegar desde el historial…' : 'Todo el historial del portapapeles…', () => abrirHistorial(destino.editable ? destino : null), 'Alt+V'));
    items.push(sep());

    if (enlace && !contacto) {
      items.push(seccion('Enlace'));
      items.push(boton('Copiar dirección del enlace', () => copiar(enlace.href)));
      items.push(boton('Copiar texto del enlace', () => copiar(enlace.innerText.trim())));
      items.push(sep());
    }
    if (imagen) {
      items.push(seccion('Imagen'));
      items.push(boton('Copiar imagen', () => copiarImagenDePagina(imagen)));
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
    items.push(boton('Nuevo post-it', () => crearNota('')));
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
      boton('Post-it', () => menuPostit(t, rect.left, rect.bottom + 8)),
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
      buscar, filaWindows(destino, () => panel.remove()), lista,
      h('footer', null, h('span', null, `Se guarda ${cfg().retencionHoras} h, solo en este perfil`), h('button', { on: { click: () => { if (confirm('¿Borrar todo el historial de este perfil?')) { guardarHistorial([]); pintar(); } } } }, 'Borrar todo')));
    panel.querySelector('header button').addEventListener('click', () => panel.remove());

    function usar(it) {
      panel.remove();
      usarDelHistorial(it, destino);
    }

    function pintar() {
      const items = historial().filter((x) => !filtro || x.texto.toLowerCase().includes(filtro));
      lista.replaceChildren();
      if (!items.length) { lista.append(h('div', { class: 'vacio' }, filtro ? 'Nada coincide.' : 'Todavía no has copiado nada en este perfil.')); return; }
      marcado = Math.min(marcado, items.length - 1);
      items.forEach((it, i) => {
        const imagen = it.tipo === 'imagen';
        const fila = h('div', { class: 'item' + (i === marcado ? ' sel' : '') },
          imagen ? h('img', { class: 'img', src: it.mini, alt: '' }) : null,
          h('div', { class: 't' }, it.texto.length > 400 ? it.texto.slice(0, 400) + '…' : it.texto),
          h('div', { class: 'm' }, h('span', null, it.origen === 'windows' ? 'Windows' : it.sitio), h('span', null, hace(it.t))),
          h('div', { class: 'acc' },
            h('button', { on: { click: (e) => { e.stopPropagation(); if (imagen) copiarImagen(() => imagenDeHistorial(it), { src: it.src, origen: 'historial' }); else { copiar(it.texto, 'historial'); toast('Copiado.', 'ok'); } } } }, 'Copiar'),
            imagen ? null : h('button', { on: { click: (e) => { e.stopPropagation(); guardar({ tipo: 'texto', valor: it.texto, nota: 'desde historial · ' + it.sitio }); } } }, 'A la hoja'),
            h('button', { on: { click: (e) => { e.stopPropagation(); guardarHistorial(historial().filter((x) => x.id !== it.id)); pintar(); } } }, 'Borrar')));
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


  // ───────────────────────── Post-its ─────────────────────────
  // Notas flotantes con lista de tareas y categoría, pegadas al borde derecho de la pantalla.
  // Viven solo en este perfil de Chrome y se ven igual en todas sus pestañas.
  // Cada día nuevo (hora de Bogotá) se pregunta qué hacer con las del día anterior.
  const CATS_BASE = [
    { id: 'urgente', nombre: 'Urgente', color: '#dc2626' },
    { id: 'comercial', nombre: 'Comercial', color: '#059669' },
    { id: 'operacion', nombre: 'Operación', color: '#d97706' },
    { id: 'desarrollo', nombre: 'Desarrollo', color: '#2563eb' },
    { id: 'gestion', nombre: 'Gestión', color: '#7c3aed' },
    { id: 'personal', nombre: 'Personal', color: '#db2777' },
    { id: 'ideas', nombre: 'Ideas', color: '#64748b' },
  ];
  const PALETA = ['#dc2626', '#ea580c', '#d97706', '#65a30d', '#059669', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#64748b'];
  const PAPELERA_DIAS = 7;
  const ID_TAB = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fechaBogota = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(t ? new Date(t) : new Date());
  const hoyBogota = () => fechaBogota();
  const diaLargo = (iso) => new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00Z'));
  const diaCorto = (iso) => new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00Z')).replace(' de ', ' ').replace('.', '');
  const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const corto = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

  const categorias = () => { const c = GM_getValue('postits:cats', null); return Array.isArray(c) && c.length ? c : CATS_BASE; };
  // Si la categoría de un post-it ya no existe, pasa a «Gestión» o, si tampoco existe, a la primera.
  const respaldoCat = (lista) => lista.find((c) => c.id === 'gestion') || lista[0];
  const categoria = (id) => { const l = categorias(); return l.find((c) => c.id === id) || respaldoCat(l); };
  function estadoNotas() {
    const e = GM_getValue('postits', null) || {};
    return { dia: e.dia || '', notas: Array.isArray(e.notas) ? e.notas : [], papelera: Array.isArray(e.papelera) ? e.papelera : [] };
  }
  function mutarNotas(fn) {
    const e = estadoNotas();
    fn(e);
    const limite = Date.now() - PAPELERA_DIAS * 864e5;
    e.papelera = e.papelera.filter((n) => n.borrada > limite).slice(0, 100);
    GM_setValue('postits', e);
    pintarPostits();
    return e;
  }
  const buscarNota = (e, id) => e.notas.find((n) => n.id === id);
  const origenActual = () => ({ url: location.origin + location.pathname, pagina: corto(document.title || HOST, 120) });
  const tituloDe = (n) => n.titulo || (n.items[0] && corto(n.items[0].texto, 80)) || corto(n.contexto, 80) || 'Sin título';

  function crearNota(texto) {
    const id = nid();
    const ultima = GM_getValue('postits:ultimaCat', 'gestion');
    mutarNotas((e) => {
      e.notas.unshift({
        id, titulo: '', cat: categoria(ultima).id, contexto: '', creada: Date.now(),
        items: texto ? [Object.assign({ id: nid(), texto: texto.slice(0, 1000), hecho: false, t: Date.now() }, origenActual())] : [],
      });
    });
    if (!cfg().postits) setCfg({ postits: true });
    abrirTarjeta(id, { foco: 'titulo' });
  }
  function agregarTarea(id, texto, conOrigen) {
    mutarNotas((e) => {
      const n = buscarNota(e, id);
      if (n) n.items.push(Object.assign({ id: nid(), texto: texto.slice(0, 1000), hecho: false, t: Date.now() }, conOrigen ? origenActual() : {}));
    });
  }
  function borrarNota(id) {
    mutarNotas((e) => {
      const n = buscarNota(e, id);
      if (!n) return;
      e.notas = e.notas.filter((x) => x.id !== id);
      e.papelera.unshift(Object.assign(n, { borrada: Date.now() }));
    });
  }
  function textoDeNota(n) {
    return [tituloDe(n) + ' [' + categoria(n.cat).nombre + ']']
      .concat(n.items.map((i) => (i.hecho ? '[x] ' : '[ ] ') + i.texto))
      .concat(n.contexto ? ['', n.contexto] : []).join('\n');
  }

  // Menú «Agregar post-it»: nuevo con lo seleccionado, o como tarea de uno existente.
  function menuPostit(texto, x, y) {
    const e = estadoNotas();
    const items = [seccion('Agregar post-it'), h('div', { class: 'valor' }, corto(texto, 60)),
      boton('Nuevo post-it con esto', () => crearNota(texto))];
    if (e.notas.length) {
      items.push(sep(), seccion('Agregar como tarea a'));
      for (const n of e.notas.slice(0, 10)) {
        const c = categoria(n.cat);
        items.push(boton([h('i', { class: 'punto', style: '--c:' + c.color }), corto(tituloDe(n), 34)], () => {
          agregarTarea(n.id, texto, true);
          toast('Agregado a «' + corto(tituloDe(n), 40) + '».', 'ok');
        }));
      }
    }
    abrir(h('div', { class: 'menu' }, items), x, y, 'postit');
  }

  // ── Pila flotante (dock) ──
  let dock = null;
  let filtroCat = null;
  let arrastrado = false;
  const uiNotas = () => GM_getValue('postits:ui', {}) || {};

  function pintarPostits() {
    if (!cfg().postits) { if (dock) { dock.remove(); dock = null; } return; }
    const s = ui();
    const u = uiNotas();
    const e = estadoNotas();
    const hoy = hoyBogota();
    if (!dock || !dock.isConnected) { dock = h('div', { class: 'pdock' }); s.insertBefore(dock, s.children[1] || null); }
    const alto = window.innerHeight;
    const top = Math.max(8, Math.min(Math.round((u.y ?? 0.22) * alto), alto - 140));
    dock.style.top = top + 'px';
    dock.classList.toggle('plegado', !!u.plegado);
    const pendientes = e.notas.reduce((a, n) => a + n.items.filter((i) => !i.hecho).length, 0);

    const pestana = h('button', { class: 'ptab', title: 'Post-its · clic: mostrar u ocultar (Alt+N) · arrastra para moverlos' },
      h('span', null, 'Post-its'), h('b', null, String(e.notas.length)));
    pestana.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return;
      const y0 = ev.clientY, t0 = dock.getBoundingClientRect().top;
      let movio = false;
      const mover = (m) => {
        if (Math.abs(m.clientY - y0) > 4) movio = true;
        if (movio) dock.style.top = Math.max(8, Math.min(t0 + m.clientY - y0, window.innerHeight - 140)) + 'px';
      };
      const soltar = () => {
        window.removeEventListener('mousemove', mover, true);
        window.removeEventListener('mouseup', soltar, true);
        if (movio) { arrastrado = true; GM_setValue('postits:ui', Object.assign(uiNotas(), { y: parseFloat(dock.style.top) / window.innerHeight })); pintarPostits(); }
      };
      window.addEventListener('mousemove', mover, true);
      window.addEventListener('mouseup', soltar, true);
    });
    pestana.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (arrastrado) { arrastrado = false; return; }
      plegarNotas();
    });

    const usadas = categorias().filter((c) => e.notas.some((n) => categoria(n.cat).id === c.id));
    if (filtroCat && !usadas.some((c) => c.id === filtroCat)) filtroCat = null;
    const filtros = usadas.length > 1 ? h('div', { class: 'pfiltros' },
      h('button', { class: 'todas' + (filtroCat ? '' : ' on'), on: { click: (ev) => { ev.stopPropagation(); filtroCat = null; pintarPostits(); } } }, 'Todas'),
      usadas.map((c) => h('button', {
        class: 'dot' + (filtroCat === c.id ? ' on' : ''), style: '--c:' + c.color, title: c.nombre,
        on: { click: (ev) => { ev.stopPropagation(); filtroCat = filtroCat === c.id ? null : c.id; pintarPostits(); } },
      }))) : null;

    const cabeza = h('div', { class: 'phead' },
      h('div', { class: 'fila' },
        h('b', null, 'Hoy · ' + diaCorto(hoy)),
        h('button', { class: 'pnuevo', title: 'Nuevo post-it', on: { click: (ev) => { ev.stopPropagation(); crearNota(''); } } }, '+ Nuevo')),
      h('div', { class: 'pres' }, e.notas.length ? `${pendientes} por hacer · ${e.notas.length} post-its` : 'Sin post-its'),
      filtros);

    const visibles = e.notas.filter((n) => !filtroCat || categoria(n.cat).id === filtroCat);
    const minis = visibles.map((n) => {
      const c = categoria(n.cat);
      const hechas = n.items.filter((i) => i.hecho).length, total = n.items.length;
      const edad = diasEntre(fechaBogota(n.creada), hoy);
      return h('button', {
        class: 'pmini' + (tarjeta && tarjeta.id === n.id ? ' activa' : '') + (total && hechas === total ? ' lista' : ''),
        style: '--c:' + c.color, title: tituloDe(n),
        on: { click: (ev) => { ev.stopPropagation(); if (tarjeta && tarjeta.id === n.id) cerrarTarjeta(); else abrirTarjeta(n.id); } },
      },
      h('span', { class: 'pm-cat' }, h('span', null, c.nombre), edad >= 1 ? h('span', { class: 'pm-edad', title: 'Viene de días anteriores' }, edad + ' d') : null),
      h('span', { class: 'pm-t' }, tituloDe(n)),
      total
        ? h('span', { class: 'pm-prog' }, h('span', { class: 'pm-barra' }, h('i', { style: 'width:' + Math.round((hechas / total) * 100) + '%' })), h('span', null, hechas + '/' + total))
        : h('span', { class: 'pm-prog' }, n.contexto ? 'nota' : 'sin tareas'));
    });
    const vacio = e.notas.length ? null : h('div', { class: 'pvacio' }, 'Sin post-its. Selecciona un texto › clic derecho › Agregar post-it, o pulsa «+ Nuevo».');
    const columna = h('div', { class: 'pcol' }, cabeza, h('div', { class: 'plista' }, minis, vacio));
    columna.querySelector('.plista').style.maxHeight = Math.max(140, alto - top - (filtros ? 130 : 110)) + 'px';
    dock.replaceChildren(columna, pestana);
  }

  function plegarNotas(forzar) {
    if (!cfg().postits) { setCfg({ postits: true }); GM_setValue('postits:ui', Object.assign(uiNotas(), { plegado: false })); pintarPostits(); return; }
    const plegado = forzar !== undefined ? forzar : !uiNotas().plegado;
    GM_setValue('postits:ui', Object.assign(uiNotas(), { plegado }));
    if (plegado) cerrarTarjeta();
    pintarPostits();
  }

  // ── Tarjeta abierta (detalle de un post-it) ──
  let tarjeta = null; // { id, nodo }
  const temporizadores = new Map();
  function guardarLuego(clave, fn) {
    const previo = temporizadores.get(clave);
    if (previo) clearTimeout(previo.t);
    temporizadores.set(clave, { fn, t: setTimeout(() => { temporizadores.delete(clave); fn(); }, 350) });
  }
  function guardarYa() {
    for (const [clave, p] of [...temporizadores]) { clearTimeout(p.t); temporizadores.delete(clave); p.fn(); }
  }
  function descartarPendientes() {
    for (const p of temporizadores.values()) clearTimeout(p.t);
    temporizadores.clear();
  }
  const enfocadoEn = (nodo) => { const a = sombra && sombra.activeElement; return !!a && nodo.contains(a); };

  function cerrarTarjeta() {
    if (!tarjeta) return;
    guardarYa();
    const id = tarjeta.id;
    tarjeta.nodo.remove();
    tarjeta = null;
    // Un post-it recién creado y abandonado sin escribir nada no se queda.
    const n = buscarNota(estadoNotas(), id);
    if (n && !n.titulo && !n.items.length && !n.contexto) mutarNotas((e) => { e.notas = e.notas.filter((x) => x.id !== id); });
    else pintarPostits();
  }

  function abrirTarjeta(id, opciones) {
    if (tarjeta) cerrarTarjeta();
    if (!buscarNota(estadoNotas(), id)) return;
    if (uiNotas().plegado) GM_setValue('postits:ui', Object.assign(uiNotas(), { plegado: false }));
    const nodo = h('div', { class: 'ptarjeta' });
    nodo.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); cerrarTarjeta(); } });
    tarjeta = { id, nodo };
    ui().appendChild(nodo);
    pintarPostits();
    pintarTarjeta(opciones);
  }

  function ubicarTarjeta() {
    if (!tarjeta) return;
    const n = tarjeta.nodo;
    const d = dock && dock.isConnected ? dock.getBoundingClientRect() : { left: window.innerWidth, top: 80 };
    const r = n.getBoundingClientRect();
    n.style.left = Math.max(8, d.left - r.width - 10) + 'px';
    n.style.top = Math.max(8, Math.min(d.top, window.innerHeight - r.height - 8)) + 'px';
  }

  function pintarTarjeta(opciones) {
    if (!tarjeta) return;
    const o = opciones || {};
    const id = tarjeta.id;
    const n = buscarNota(estadoNotas(), id);
    if (!n) { tarjeta.nodo.remove(); tarjeta = null; return; }
    const c = categoria(n.cat);
    const nodo = tarjeta.nodo;
    nodo.style.setProperty('--c', c.color);
    const cambiar = (fn) => mutarNotas((e) => { const x = buscarNota(e, id); if (x) fn(x); });
    const icono = (texto, titulo, fn) => h('button', { class: 'pt-icono', title: titulo, on: { click: (ev) => { ev.stopPropagation(); fn(); } } }, texto);

    const titulo = h('input', { class: 'pt-titulo', type: 'text', placeholder: 'Título del post-it', maxlength: '120' });
    titulo.value = n.titulo;
    titulo.addEventListener('input', () => guardarLuego('titulo', () => cambiar((x) => { x.titulo = titulo.value.trim(); })));
    titulo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); nueva.focus(); } });

    const filas = n.items.map((it) => {
      const caja = h('textarea', { class: 'pt-texto', rows: '1', maxlength: '1000' });
      caja.value = it.texto;
      caja.addEventListener('input', () => guardarLuego('item:' + it.id, () => cambiar((x) => { const i = x.items.find((y) => y.id === it.id); if (i) i.texto = caja.value; })));
      caja.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); nueva.focus(); } });
      caja.addEventListener('blur', () => {
        if (caja.value.trim()) return;
        guardarYa();
        cambiar((x) => { x.items = x.items.filter((y) => y.id !== it.id); });
        pintarTarjeta();
      });
      return h('div', { class: 'pt-fila' + (it.hecho ? ' hecha' : '') },
        h('button', {
          class: 'pt-check' + (it.hecho ? ' on' : ''), role: 'checkbox', 'aria-checked': String(!!it.hecho), title: it.hecho ? 'Marcar como pendiente' : 'Marcar como hecha',
          on: { click: (ev) => { ev.stopPropagation(); guardarYa(); cambiar((x) => { const i = x.items.find((y) => y.id === it.id); if (i) i.hecho = !i.hecho; }); pintarTarjeta(); } },
        }),
        caja,
        it.url ? h('a', { class: 'pt-link', href: it.url, target: '_blank', rel: 'noopener', title: 'De: ' + (it.pagina || it.url) }, '↗') : null,
        icono('×', 'Quitar esta tarea', () => { guardarYa(); cambiar((x) => { x.items = x.items.filter((y) => y.id !== it.id); }); pintarTarjeta(); }));
    });

    const nueva = h('input', { class: 'pt-nueva-in', type: 'text', placeholder: 'Agregar tarea y pulsar Enter', maxlength: '1000' });
    nueva.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' || !nueva.value.trim()) return;
      ev.preventDefault();
      guardarYa();
      const t = nueva.value.trim();
      cambiar((x) => x.items.push({ id: nid(), texto: t, hecho: false, t: Date.now() }));
      pintarTarjeta({ foco: 'nueva' });
    });

    const contexto = h('textarea', { class: 'pt-contexto', placeholder: 'Notas de contexto…', maxlength: '4000' });
    contexto.value = n.contexto || '';
    contexto.addEventListener('input', () => guardarLuego('contexto', () => cambiar((x) => { x.contexto = contexto.value; })));

    let selector = null;
    const chip = h('button', { class: 'pt-chip', title: 'Cambiar la categoría', on: { click: (ev) => { ev.stopPropagation(); selector.hidden = !selector.hidden; } } }, c.nombre + ' ▾');
    selector = h('div', { class: 'pt-cats' },
      categorias().map((k) => h('button', {
        class: 'pt-cat' + (k.id === c.id ? ' on' : ''), style: '--k:' + k.color,
        on: { click: (ev) => { ev.stopPropagation(); GM_setValue('postits:ultimaCat', k.id); cambiar((x) => { x.cat = k.id; }); pintarTarjeta(); } },
      }, k.nombre)),
      h('button', { class: 'pt-cat editar', on: { click: (ev) => { ev.stopPropagation(); editarCategorias(); } } }, 'Editar categorías…'));
    selector.hidden = true;

    const hechas = n.items.filter((i) => i.hecho).length;
    nodo.replaceChildren(
      h('div', { class: 'pt-cab' }, chip, h('span', { class: 'pt-esp' }),
        icono('Copiar', 'Copiar como texto', () => { guardarYa(); copiar(textoDeNota(buscarNota(estadoNotas(), id))); toast('Post-it copiado.', 'ok'); }),
        icono('Borrar', 'Mover a la papelera (se recupera durante 7 días)', () => { descartarPendientes(); tarjeta.nodo.remove(); tarjeta = null; borrarNota(id); toast('Post-it borrado. Se recupera 7 días desde el menú de Tampermonkey.', 'aviso'); }),
        icono('✕', 'Cerrar (Esc)', cerrarTarjeta)),
      selector, titulo,
      h('div', { class: 'pt-lista' }, filas),
      h('div', { class: 'pt-nueva' }, h('span', { class: 'pt-mas' }, '+'), nueva),
      contexto,
      h('div', { class: 'pt-pie' },
        h('span', null, n.items.length ? hechas + ' de ' + n.items.length + ' hechas' : 'Sin tareas'),
        h('span', null, 'desde ' + diaCorto(fechaBogota(n.creada)))));
    ubicarTarjeta();
    if (o.foco === 'titulo') titulo.focus();
    else if (o.foco === 'nueva') nueva.focus();
  }

  // ── Categorías ──
  function editarCategorias() {
    cerrar();
    const s = ui();
    const velo = h('div', { class: 'pvelo' });
    const caja = h('div', { class: 'pmodal pequeno' });
    velo.append(caja);
    const salir = () => { velo.remove(); pintarPostits(); if (tarjeta) pintarTarjeta(); };
    velo.addEventListener('click', (ev) => { if (ev.target === velo) salir(); });
    velo.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') salir(); });
    const guardarCats = (lista) => { GM_setValue('postits:cats', lista); pintar(); };
    function pintar() {
      const lista = categorias().map((c) => Object.assign({}, c));
      const usos = (id) => estadoNotas().notas.filter((n) => categoria(n.cat).id === id).length;
      caja.replaceChildren(
        h('header', null, h('h2', null, 'Categorías de post-its'), h('p', null, 'Clic en el color para cambiarlo. Los cambios se ven en todas las pestañas de este perfil.')),
        h('div', { class: 'pm-lista' }, lista.map((c, i) => {
          const nombre = h('input', { class: 'pc-nombre', type: 'text', maxlength: '24' });
          nombre.value = c.nombre;
          nombre.addEventListener('change', () => { if (nombre.value.trim()) { lista[i].nombre = nombre.value.trim(); guardarCats(lista); } });
          return h('div', { class: 'pc-fila' },
            h('button', { class: 'pc-color', style: '--c:' + c.color, title: 'Cambiar color', on: { click: () => { lista[i].color = PALETA[(PALETA.indexOf(c.color) + 1) % PALETA.length]; guardarCats(lista); } } }),
            nombre,
            h('span', { class: 'pc-usos' }, usos(c.id) + ' post-its'),
            lista.length > 1 ? h('button', {
              class: 'pc-quitar', title: 'Quitar categoría',
              on: { click: () => {
                const n = usos(c.id);
                if (n && !confirm(`${n} post-its usan «${c.nombre}». Pasarán a «${respaldoCat(lista.filter((x) => x.id !== c.id)).nombre}». ¿Quitar la categoría?`)) return;
                guardarCats(lista.filter((x) => x.id !== c.id));
              } },
            }, 'Quitar') : null);
        })),
        h('footer', null,
          h('button', { on: { click: () => { if (confirm('¿Volver a las 7 categorías iniciales?')) { GM_setValue('postits:cats', null); pintar(); } } } }, 'Restablecer'),
          h('span', { class: 'pt-esp' }),
          h('button', { on: { click: () => {
            const nombre = (prompt('Nombre de la nueva categoría:') || '').trim().slice(0, 24);
            if (!nombre) return;
            const usados = new Set(lista.map((x) => x.color));
            lista.push({ id: 'c' + nid(), nombre, color: PALETA.find((p) => !usados.has(p)) || PALETA[lista.length % PALETA.length] });
            guardarCats(lista);
          } } }, '+ Nueva categoría'),
          h('button', { class: 'prim', on: { click: salir } }, 'Listo')));
    }
    s.appendChild(velo);
    pintar();
  }

  // ── Papelera ──
  function recuperarNotas() {
    const e = estadoNotas();
    if (!e.papelera.length) { toast('La papelera de post-its está vacía.', 'ok'); return; }
    const items = [seccion('Post-its borrados · últimos 7 días')];
    for (const n of e.papelera.slice(0, 15)) {
      items.push(boton([h('i', { class: 'punto', style: '--c:' + categoria(n.cat).color }), corto(tituloDe(n), 34)], () => {
        mutarNotas((x) => {
          const i = x.papelera.findIndex((y) => y.id === n.id);
          if (i < 0) return;
          const [r] = x.papelera.splice(i, 1);
          delete r.borrada;
          x.notas.unshift(r);
        });
        if (!cfg().postits) setCfg({ postits: true });
        toast('Recuperado: ' + corto(tituloDe(n), 50), 'ok');
      }, diaCorto(fechaBogota(n.borrada))));
    }
    abrir(h('div', { class: 'menu' }, items), window.innerWidth / 2 - 150, 90, 'papelera');
  }

  // ── Día nuevo: qué hacer con los post-its del día anterior ──
  let modalDia = null;
  function revisarDia(forzar) {
    if (!cfg().postits && !forzar) return;
    const hoy = hoyBogota();
    const e = estadoNotas();
    if (!forzar && e.dia === hoy) return;
    if (!e.notas.length) { if (e.dia !== hoy) mutarNotas((x) => { x.dia = hoy; }); if (forzar) toast('No hay post-its para revisar.', 'ok'); return; }
    if (modalDia) return;
    if (!forzar) {
      if (Date.now() < GM_getValue('postits:pospuesto', 0)) return;
      const cerrojo = GM_getValue('postits:revision', null);
      if (cerrojo && cerrojo.id !== ID_TAB && Date.now() - cerrojo.t < 5 * 60e3) return; // otra pestaña ya está preguntando
    }
    GM_setValue('postits:revision', { id: ID_TAB, t: Date.now() });
    mostrarDia(e, hoy, !!forzar);
  }

  function mostrarDia(e, hoy, forzado) {
    const ids = e.notas.map((n) => n.id);
    const mantener = new Set(ids);
    const pend = e.notas.reduce((a, n) => a + n.items.filter((i) => !i.hecho).length, 0);
    const hechas = e.notas.reduce((a, n) => a + n.items.filter((i) => i.hecho).length, 0);
    const ayer = new Date(Date.parse(hoy + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
    const deCuando = forzado || !e.dia ? 'abiertos' : e.dia === ayer ? 'de ayer' : 'del ' + diaCorto(e.dia);

    const terminar = (fn, aviso) => {
      mutarNotas((x) => { if (fn) fn(x); x.dia = hoy; });
      GM_setValue('postits:revision', null);
      velo.remove(); modalDia = null;
      if (aviso) toast(aviso, 'ok');
    };
    const aPapelera = (x, quedan) => {
      const ahora = Date.now();
      const van = x.notas.filter((n) => ids.includes(n.id) && !quedan(n));
      x.notas = x.notas.filter((n) => !van.includes(n));
      x.papelera.unshift(...van.map((n) => Object.assign(n, { borrada: ahora })));
    };
    // Quita las tareas hechas. Un post-it con todas sus tareas hechas y sin notas de contexto
    // se va a la papelera; uno que nunca tuvo tareas (solo título o notas) se queda.
    const soloPendiente = (x) => {
      const teniaTareas = new Set(e.notas.filter((n) => n.items.length).map((n) => n.id));
      for (const n of x.notas) if (ids.includes(n.id)) n.items = n.items.filter((i) => !i.hecho);
      aPapelera(x, (n) => n.items.length > 0 || !!n.contexto || !teniaTareas.has(n.id));
    };

    const filas = h('div', { class: 'pm-lista' });
    const pintarFilas = () => filas.replaceChildren(...e.notas.map((n) => {
      const c = categoria(n.cat);
      const hn = n.items.filter((i) => i.hecho).length;
      return h('div', {
        class: 'pm-nota' + (mantener.has(n.id) ? '' : ' fuera'),
        on: { click: () => { if (mantener.has(n.id)) mantener.delete(n.id); else mantener.add(n.id); pintarFilas(); } },
      },
      h('span', { class: 'pt-check' + (mantener.has(n.id) ? ' on' : ''), style: '--c:' + c.color, role: 'checkbox', 'aria-checked': String(mantener.has(n.id)) }),
      h('span', { class: 'pm-cat-dot', style: '--c:' + c.color }, c.nombre),
      h('span', { class: 'pm-nt' }, tituloDe(n)),
      h('span', { class: 'pm-np' }, n.items.length ? hn + '/' + n.items.length : '—'));
    }));
    pintarFilas();

    const accion = (titulo, desc, fn, clase) => h('button', { class: clase || '', on: { click: fn } }, h('b', null, titulo), h('small', null, desc));
    const caja = h('div', { class: 'pmodal', role: 'dialog', 'aria-label': 'Post-its del día anterior' },
      h('header', null,
        h('h2', null, 'Buen día. Hoy es ' + diaLargo(hoy) + '.'),
        h('p', null, `Tienes ${e.notas.length} post-its ${deCuando}: ${pend} tareas pendientes y ${hechas} hechas. ¿Qué hacemos con ellos?`)),
      h('div', { class: 'pm-acciones' },
        accion('Mantener todos', 'Siguen igual, con lo hecho tachado', () => terminar(null, 'Post-its conservados.')),
        accion('Solo lo pendiente', 'Quita las tareas hechas y los post-its terminados', () => terminar(soloPendiente, 'Listo: quedó solo lo pendiente.'), 'prim'),
        accion('Borrar todos', 'Empiezas el día en blanco', () => terminar((x) => aPapelera(x, () => false), 'Post-its borrados. Se recuperan 7 días desde el menú de Tampermonkey.'))),
      h('div', { class: 'pm-sub' }, 'O decide uno por uno: marca los que se quedan.'),
      filas,
      h('footer', null,
        h('button', { on: { click: () => { GM_setValue('postits:pospuesto', Date.now() + 60 * 60e3); GM_setValue('postits:revision', null); velo.remove(); modalDia = null; } } }, 'Decidir en una hora'),
        h('span', { class: 'pt-esp' }),
        h('button', { class: 'prim', on: { click: () => terminar((x) => aPapelera(x, (n) => mantener.has(n.id)), `Quedan ${mantener.size} post-its.`) } }, 'Aplicar mi selección')));
    const velo = h('div', { class: 'pvelo' }, caja);
    modalDia = velo;
    ui().appendChild(velo);
  }

  function iniciarPostits() {
    GM_addValueChangeListener('postits', (_k, _v, _n, remoto) => {
      if (!remoto) return;
      pintarPostits();
      if (tarjeta) {
        if (!buscarNota(estadoNotas(), tarjeta.id)) { descartarPendientes(); tarjeta.nodo.remove(); tarjeta = null; pintarPostits(); }
        else if (!enfocadoEn(tarjeta.nodo)) pintarTarjeta();
      }
      if (modalDia && estadoNotas().dia === hoyBogota()) { modalDia.remove(); modalDia = null; }
    });
    for (const k of ['postits:cats', 'postits:ui', 'cfg']) {
      GM_addValueChangeListener(k, (_k, _v, _n, remoto) => {
        if (!remoto) return;
        pintarPostits();
        if (tarjeta && !enfocadoEn(tarjeta.nodo)) pintarTarjeta();
      });
    }
    window.addEventListener('resize', () => { pintarPostits(); ubicarTarjeta(); });
    pintarPostits();
    setTimeout(() => revisarDia(), 1200);
    setInterval(() => { if (!document.hidden) revisarDia(); }, 5 * 60e3);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => revisarDia(), 600); });
  }

  // ───────────────────────── Imágenes y portapapeles de Windows ─────────────────────────
  // Copiar imágenes de cualquier página, guardarlas en el historial con miniatura y ver qué hay
  // ahora mismo en el portapapeles de Windows (Chrome pide permiso una vez por sitio).
  const MAX_IMAGENES = 8;           // imágenes completas que guarda el historial; las demás quedan en miniatura
  const MAX_BYTES_IMAGEN = 1.5e6;   // más grandes que esto quedan solo en miniatura (y su dirección)
  const idNuevo = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esWeb = (u) => /^https?:\/\//i.test(u || '');

  function blobADataUrl(b) {
    return new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(b); });
  }
  // Huella por píxeles, no por bytes: Windows y Chrome vuelven a codificar la imagen al copiarla,
  // y la misma imagen tiene que reconocerse como la misma.
  async function huella(b) {
    const m = await aMapa(b);
    const w = m.width || m.naturalWidth, hh = m.height || m.naturalHeight;
    const px = lienzoDe(m, 24, 24).getContext('2d').getImageData(0, 0, 24, 24).data;
    const d = await crypto.subtle.digest('SHA-256', px.map((v) => v >> 3));
    return w + 'x' + hh + ':' + [...new Uint8Array(d)].slice(0, 10).map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function aMapa(blob) {
    try { return await createImageBitmap(blob); } catch (_) { /* SVG y otros: se dibujan con <img> */ }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  function lienzoDe(fuente, ancho, alto) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(ancho)); c.height = Math.max(1, Math.round(alto));
    c.getContext('2d').drawImage(fuente, 0, 0, c.width, c.height);
    return c;
  }
  const lienzoABlob = (c, tipo, calidad) => new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('sin imagen'))), tipo, calidad));
  async function aPng(blob) {
    if (blob.type === 'image/png') return blob;
    const m = await aMapa(blob);
    return lienzoABlob(lienzoDe(m, m.width || m.naturalWidth, m.height || m.naturalHeight), 'image/png');
  }
  async function miniatura(blob) {
    const m = await aMapa(blob);
    const w = m.width || m.naturalWidth, hh = m.height || m.naturalHeight;
    const f = Math.min(1, 240 / Math.max(w, hh));
    return { mini: await blobADataUrl(await lienzoABlob(lienzoDe(m, w * f, hh * f), 'image/webp', 0.82)), ancho: w, alto: hh };
  }

  // La imagen ya está cargada en la página: si es del mismo sitio (o permite CORS) se dibuja directo.
  async function blobDeImgCargada(img) {
    if (!img || !img.complete || !img.naturalWidth) return null;
    try { return await lienzoABlob(lienzoDe(img, img.naturalWidth, img.naturalHeight), 'image/png'); } catch (_) { return null; }
  }
  // Si no, se descarga: primero como la página; si el sitio no lo permite, por Tampermonkey.
  function bajarImagen(src) {
    if (/^(data|blob):/i.test(src)) return fetch(src).then((r) => r.blob());
    return fetch(src, { credentials: 'include' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .catch(() => new Promise((ok, mal) => GM_xmlhttpRequest({
        method: 'GET', url: src, responseType: 'blob', timeout: 20000,
        onload: (r) => (r.status >= 200 && r.status < 400 && r.response ? ok(r.response) : mal(new Error('HTTP ' + r.status))),
        onerror: () => mal(new Error('sin conexión')), ontimeout: () => mal(new Error('tardó demasiado')),
      })));
  }

  function guardarHistorial(lista) {
    const c = cfg();
    lista = lista.slice(0, c.maxHistorial);
    // Solo las últimas imágenes conservan el archivo completo; las demás quedan en miniatura.
    let completas = 0;
    for (const x of lista) {
      if (x.tipo !== 'imagen' || !x.completa) continue;
      if (++completas > MAX_IMAGENES) { x.completa = false; GM_deleteValue('img:' + x.id); }
    }
    GM_setValue('historial', lista);
    // Archivos de imágenes que ya salieron del historial (vencidas o borradas).
    const vivas = new Set(lista.filter((x) => x.completa).map((x) => 'img:' + x.id));
    for (const k of GM_listValues()) if (k.startsWith('img:') && !vivas.has(k)) GM_deleteValue(k);
  }

  async function registrarImagen(png, datos) {
    const marca = await huella(png);
    const previa = historial().find((x) => x.tipo === 'imagen' && x.huella === marca);
    if (previa) {
      guardarHistorial([Object.assign(previa, { t: Date.now(), origen: datos.origen || previa.origen })].concat(historial().filter((x) => x.id !== previa.id)));
      return previa;
    }
    const { mini, ancho, alto } = await miniatura(png);
    const id = idNuevo();
    const completa = png.size <= MAX_BYTES_IMAGEN;
    if (completa) GM_setValue('img:' + id, await blobADataUrl(png));
    const it = {
      id, t: Date.now(), tipo: 'imagen', huella: marca, mini, ancho, alto, completa,
      src: esWeb(datos.src) ? datos.src.slice(0, 2000) : '',
      texto: (datos.alt ? corto(datos.alt, 80) + ' · ' : '') + `Imagen ${ancho}×${alto}`,
      sitio: HOST, titulo: document.title.slice(0, 120), origen: datos.origen || 'menú',
    };
    guardarHistorial([it].concat(historial()));
    return it;
  }

  async function imagenDeHistorial(it) {
    const d = GM_getValue('img:' + it.id, null);
    if (d) return (await fetch(d)).blob();
    if (it.src) { try { return await aPng(await bajarImagen(it.src)); } catch (_) { /* sigue con la miniatura */ } }
    return aPng(await (await fetch(it.mini)).blob());
  }

  const avisoImagen = (mini, msg) => h('span', { class: 'tmini' }, mini ? h('img', { src: mini, alt: '' }) : null, msg);

  // Copia una imagen al portapapeles. La escritura se pide en el mismo clic (Chrome lo exige) y la
  // imagen se resuelve mientras tanto.
  async function copiarImagen(obtener, datos) {
    const promesa = obtener().then(aPng);
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': promesa })]);
    } catch (e) {
      toast('No pude copiar esa imagen (' + corto(e && e.message, 70) + '). Clic derecho otra vez para usar el menú de Chrome.', 'error');
      return null;
    }
    const it = await registrarImagen(await promesa, datos);
    toast(avisoImagen(it.mini, 'Imagen copiada. Pégala con Ctrl+V.'), 'ok');
    return it;
  }
  const copiarImagenDePagina = (img) => {
    const src = img.currentSrc || img.src;
    return copiarImagen(async () => (await blobDeImgCargada(img)) || bajarImagen(src), { src, alt: img.alt, origen: 'menú' });
  };

  // Pega una imagen en un campo: los editores que aceptan imágenes (ChatGPT, Gmail, WhatsApp Web…)
  // la reciben como un Ctrl+V. Si el campo no la acepta, queda copiada para pegarla a mano.
  async function pegarImagenEn(destino, it) {
    const png = await imagenDeHistorial(it);
    const el = destino && destino.editable;
    if (el && el.isConnected) {
      el.focus();
      if (destino.rango) { const s = getSelection(); s.removeAllRanges(); s.addRange(destino.rango); }
      const dt = new DataTransfer();
      dt.items.add(new File([png], 'imagen.png', { type: 'image/png' }));
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true });
      el.dispatchEvent(ev);
      if (ev.defaultPrevented) { guardarHistorial([Object.assign(it, { t: Date.now() })].concat(historial().filter((x) => x.id !== it.id))); return; }
    }
    await copiarImagen(async () => png, { src: it.src, origen: 'historial' });
    toast('Este campo no recibe imágenes pegadas desde el script: quedó copiada, pulsa Ctrl+V.', 'aviso');
  }

  function usarDelHistorial(it, destino) {
    if (it.tipo === 'imagen') {
      if (destino && destino.editable) return pegarImagenEn(destino, it);
      return copiarImagen(() => imagenDeHistorial(it), { src: it.src, origen: 'historial' });
    }
    if (destino && destino.editable) return pegarEn(destino, it.texto);
    copiar(it.texto, 'historial');
    toast('Copiado. Pégalo con Ctrl+V o clic derecho.', 'ok');
  }

  // ── Portapapeles de Windows ──
  async function permisoPortapapeles() {
    try { return (await navigator.permissions.query({ name: 'clipboard-read' })).state; } catch (_) { return 'prompt'; }
  }
  // Lee lo que hay ahora en Windows y lo suma al historial. Devuelve { tipo, texto | it }.
  async function leerWindows() {
    const items = await navigator.clipboard.read();
    for (const i of items) {
      const tipo = i.types.find((t) => t.startsWith('image/'));
      if (tipo) {
        const png = await aPng(await i.getType(tipo));
        return { tipo: 'imagen', it: await registrarImagen(png, { origen: 'windows' }) };
      }
    }
    for (const i of items) {
      if (i.types.includes('text/plain')) {
        const texto = await (await i.getType('text/plain')).text();
        if (texto.trim()) { registrar(texto, 'windows'); return { tipo: 'texto', texto }; }
      }
    }
    return { tipo: 'vacio' };
  }

  // Fila «Windows ahora» para el menú y el panel. Se llena sola si Chrome ya dio permiso;
  // si no, un clic pide el permiso. No cierra el menú.
  function filaWindows(destino, alUsar) {
    const fila = h('div', { class: 'prev windows' });
    const pintar = (r) => {
      fila.replaceChildren();
      if (!r) return;
      if (r.error) { fila.append(h('span', { class: 'pv-t tenue' }, r.error)); return; }
      if (r.pedir) {
        fila.append(h('button', { class: 'pv-pedir', on: { click: (ev) => { ev.stopPropagation(); leer(true); } } }, 'Ver qué hay en el portapapeles de Windows'));
        return;
      }
      if (r.tipo === 'vacio') { fila.append(h('span', { class: 'pv-et' }, 'Windows'), h('span', { class: 'pv-t tenue' }, 'vacío o con algo que Chrome no lee')); return; }
      const contenido = r.tipo === 'imagen'
        ? [h('img', { class: 'pv-img', src: r.it.mini, alt: '' }), h('span', { class: 'pv-t' }, r.it.texto)]
        : [h('span', { class: 'pv-t' }, corto(r.texto, 90))];
      const b = h('button', {
        class: 'pv-b', title: destino && destino.editable ? 'Pegar aquí' : 'Ya está en el portapapeles: pégalo con Ctrl+V',
        on: { click: (ev) => {
          ev.stopPropagation();
          if (alUsar) alUsar();
          if (destino && destino.editable) {
            if (r.tipo === 'imagen') pegarImagenEn(destino, r.it); else pegarEn(destino, r.texto);
          } else toast('Eso ya está en el portapapeles de Windows: pégalo con Ctrl+V.', 'ok');
        } },
      }, h('span', { class: 'pv-et' }, 'Windows'), contenido, h('span', { class: 'k' }, destino && destino.editable ? 'pegar' : 'ahora'));
      fila.append(b);
    };
    const leer = async (pedido) => {
      pintar({ error: 'Leyendo el portapapeles de Windows…' });
      try { pintar(await leerWindows()); }
      catch (_) { pintar({ error: pedido ? 'Chrome no dio permiso para leer el portapapeles en este sitio.' : 'No se pudo leer el portapapeles de Windows.' }); }
    };
    permisoPortapapeles().then((p) => {
      if (p === 'granted') leer(false);
      else if (p === 'denied') pintar({ error: 'Chrome tiene bloqueado leer el portapapeles en este sitio (candado de la barra de direcciones).' });
      else pintar({ pedir: true });
    });
    return fila;
  }

  // Vista previa compacta de una copia del historial (texto o imagen).
  function filaPrevia(it, destino, alUsar) {
    return h('button', {
      class: 'pv-b',
      on: { click: (ev) => { ev.stopPropagation(); if (alUsar) alUsar(); usarDelHistorial(it, destino); } },
    },
    it.tipo === 'imagen' ? h('img', { class: 'pv-img', src: it.mini, alt: '' }) : null,
    h('span', { class: 'pv-t' }, it.tipo === 'imagen' ? it.texto : corto(it.texto, 90)),
    h('span', { class: 'k' }, hace(it.t)));
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
          await copiarImagen(async () => blob, { origen: 'recorte' });
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
    GM_registerMenuCommand('Nuevo post-it', () => crearNota(''));
    GM_registerMenuCommand((c.postits ? 'Ocultar' : 'Mostrar') + ' los post-its (Alt+N los pliega)', () => { setCfg({ postits: !cfg().postits }); if (!cfg().postits) cerrarTarjeta(); pintarPostits(); });
    GM_registerMenuCommand('Revisar los post-its del día', () => revisarDia(true));
    GM_registerMenuCommand('Categorías de post-its', editarCategorias);
    const papelera = estadoNotas().papelera.filter((n) => n.borrada > Date.now() - PAPELERA_DIAS * 864e5).length;
    if (papelera) GM_registerMenuCommand(`Recuperar post-its borrados (${papelera})`, recuperarNotas);
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
  iniciarPostits();

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
    if (tarjeta) cerrarTarjeta();
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
    if (e.key === 'Escape' && tarjeta) { cerrarTarjeta(); return; }
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyN') {
      e.preventDefault(); e.stopPropagation();
      plegarNotas();
      return;
    }
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
