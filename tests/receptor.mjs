// Prueba del receptor de Apps Script (apps-script/Codigo.gs) con una hoja de Google simulada.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CODIGO = readFileSync(path.join(raiz, 'apps-script', 'Codigo.gs'), 'utf8');
const fallas = [];
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + '  ' + m); if (!c) fallas.push(m); };

// Hoja simulada: filas en memoria; todo lo de formato se acepta y no hace nada. Como en Sheets,
// el apóstrofo que neutraliza fórmulas no cuenta al buscar.
const nada = new Proxy(function () {}, { get: () => nada, apply: () => nada });
function hojaSimulada(nombre) {
  const filas = [];
  const hoja = {
    nombre, filas,
    appendRow: (f) => { filas.push(f.map(String)); },
    getLastRow: () => filas.length,
    getBandings: () => [1], getFilter: () => 1, getMaxRows: () => 1000,
    setFrozenRows: () => {}, setRowHeight: () => {}, setColumnWidth: () => {},
    getRange: (a, c, nr) => {
      if (typeof a === 'string') return nada;
      return {
        setValues: (v) => { v.forEach((f, i) => { filas[a - 1 + i] = f.map(String); }); return nada; },
        createTextFinder: (t) => ({ matchEntireCell: () => ({ findNext: () => {
          for (let i = a - 1; i < a - 1 + (nr || 0); i++) if (filas[i] && String(filas[i][c - 1]).replace(/^'/, '') === t) return { getRow: () => i + 1 };
          return null;
        } }) }),
      };
    },
  };
  return hoja;
}
const hojas = { Capturas: hojaSimulada('Capturas') };
hojas.Capturas.filas.push(['Fecha (Bogotá)', 'Tipo', 'Valor', 'Nota', 'Sitio', 'Título de la página', 'Dirección', 'Perfil', 'Versión']);
const libro = { getSheetByName: (n) => hojas[n] || null, insertSheet: (n) => (hojas[n] = hojaSimulada(n)), setSpreadsheetTimeZone: () => {} };
const props = { TOKEN: 'clave-de-prueba-123' };
const ctx = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => libro, openById: () => libro, BorderStyle: {}, BandingTheme: {} },
  Utilities: { formatDate: () => '2026-11-04 00:10:00', getUuid: () => 'uuid' },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }), MimeType: { JSON: 'json' } },
  Logger: { log: () => {} },
};
vm.createContext(ctx);
vm.runInContext(CODIGO, ctx);
const enviar = (d) => ctx.doPost({ postData: { contents: JSON.stringify(d) } });

const base = { token: 'clave-de-prueba-123', tipo: 'postit', id: 'abc123', hora: '2026-11-03 23:58:12', tema: 'Plan de respaldos - Claude',
  categoria: 'Gestión', texto: '[ ] Decidimos restaurar primero Chatwoot', estado: 'abierto', sitio: 'claude.ai',
  url: 'https://claude.ai/chat/1f2e#:~:text=Decidimos', perfil: 'Steeve personal', evento: 'ev-1', version: '2.3.4' };

let r = enviar(base);
const P = () => hojas['Post-its'];
ok(r.ok && P(), 'el primer post-it crea la pestaña «Post-its»');
ok(P().filas[0].join('|') === 'Id post-it|Hora (Bogotá)|Origen|Tema|Categoría|Texto · decisión o pendiente|Siguiente paso|Estado|Sitio|URL|Proyecto o chat|Perfil|Evento', 'la pestaña tiene los 13 encabezados en orden');
ok(P().filas[1].join('|') === 'abc123|2026-11-03 23:58:12|script|Plan de respaldos - Claude|Gestión|[ ] Decidimos restaurar primero Chatwoot||abierto|claude.ai|https://claude.ai/chat/1f2e#:~:text=Decidimos||Steeve personal|ev-1', 'la fila queda en el orden de las columnas, con la hora del post-it');
ok(r.fila === 2, 'responde el número de fila');

r = enviar(base);
ok(r.ok && r.repetido && P().filas.length === 2, 'el mismo evento reenviado por la cola no repite la fila');

enviar(Object.assign({}, base, { evento: 'ev-2', estado: 'hecho', tema: '=HIPERVINCULO("x")' }));
ok(P().filas.length === 3 && P().filas[2][7] === 'hecho', 'un cambio llega como fila nueva; la anterior no se toca');
ok(P().filas[2][3] === '\'=HIPERVINCULO("x")', 'un tema que empieza por «=» entra como texto, no como fórmula');
ok(P().filas[1][7] === 'abierto', 'la fila anterior sigue igual');

enviar(Object.assign({}, base, { evento: 'ev-a', estado: 'archivado' }));
ok(P().filas.at(-1)[7] === 'archivado', 'acepta el estado «archivado» (los post-its no se borran)');
enviar(Object.assign({}, base, { evento: 'ev-3', estado: 'cualquiera', hora: 'ayer' }));
ok(P().filas[4][7] === 'abierto' && P().filas[4][1] === '2026-11-04 00:10:00', 'estado desconocido queda abierto; una hora inválida se reemplaza por la del servidor');

r = enviar(Object.assign({}, base, { token: 'otra', evento: 'ev-4' }));
ok(!r.ok && r.error === 'token' && P().filas.length === 5, 'sin la clave correcta no escribe nada');

r = enviar({ token: 'clave-de-prueba-123', tipo: 'telefono', valor: '+573001112233', sitio: 'x' });
ok(r.ok && hojas.Capturas.filas.length === 2 && hojas.Capturas.filas[1][2] === "'+573001112233", 'las capturas de siempre siguen yendo a «Capturas»');
r = enviar({ token: 'clave-de-prueba-123', tipo: 'telefono', valor: '+573001112233' });
ok(r.repetido && hojas.Capturas.filas.length === 2, 'y sigue sin repetir teléfonos');

// Si la pestaña ya existe (creada a mano o por un chat), se usa tal cual.
delete hojas['Post-its'];
hojas['Post-its'] = hojaSimulada('Post-its');
hojas['Post-its'].filas.push(['Id post-it', 'Hora (Bogotá)', 'Origen', 'Tema', 'Categoría', 'Texto · decisión o pendiente', 'Siguiente paso', 'Estado', 'Sitio', 'URL', 'Proyecto o chat', 'Perfil', 'Evento']);
hojas['Post-its'].filas.push(['cl-1', '2026-11-03 23:50:00', 'claude', 'Tema de chat', '', 'Decidido', 'Probar', 'abierto', '', '', 'Chat X', '', 'cl-1']);
enviar(Object.assign({}, base, { evento: 'ev-9' }));
ok(hojas['Post-its'].filas.length === 3 && hojas['Post-its'].filas[1][2] === 'claude', 'con la pestaña ya creada, agrega debajo sin tocar las filas de los chats');

console.log(fallas.length ? `\n${fallas.length} FALLAS` : '\nTodo en orden.');
process.exit(fallas.length ? 1 : 0);
