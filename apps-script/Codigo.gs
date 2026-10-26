/**
 * TP Capturador · receptor en Google Sheets.
 *
 * Va pegado a la hoja (Extensiones › Apps Script). Se publica como aplicación web:
 *   Ejecutar como: yo · Quién tiene acceso: cualquier persona.
 * La clave NO vive en este código: está en Propiedades del script › TOKEN.
 * Ejecuta configurar() una vez: crea la pestaña, le da formato y genera la clave.
 */

const PESTANA = 'Capturas';
const ENCABEZADOS = ['Fecha (Bogotá)', 'Tipo', 'Valor', 'Nota', 'Sitio', 'Título de la página', 'Dirección', 'Perfil', 'Versión'];
const CON_DEDUP = ['telefono', 'correo'];
const ZONA = 'America/Bogota';

function doGet() {
  return json_({ ok: true, servicio: 'tp-capturador' });
}

function doPost(e) {
  let datos;
  try {
    datos = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'json' });
  }
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || datos.token !== token) return json_({ ok: false, error: 'token' });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const hoja = hoja_();
    const tipo = limpiar_(datos.tipo, 20) || 'texto';
    const valor = limpiar_(datos.valor, 45000);
    if (!valor) return json_({ ok: false, error: 'vacio' });

    if (CON_DEDUP.indexOf(tipo) >= 0 && hoja.getLastRow() > 1) {
      const visible = valor.charAt(0) === "'" ? valor.slice(1) : valor; // el apóstrofo no se ve en la celda
      const encontrado = hoja.getRange(2, 3, hoja.getLastRow() - 1, 1)
        .createTextFinder(visible).matchEntireCell(true).findNext();
      if (encontrado) return json_({ ok: true, repetido: true, fila: encontrado.getRow() });
    }

    hoja.appendRow([
      Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm:ss'),
      tipo,
      valor,
      limpiar_(datos.nota, 2000),
      limpiar_(datos.sitio, 200),
      limpiar_(datos.titulo, 300),
      limpiar_(datos.url, 1000),
      limpiar_(datos.perfil, 80),
      limpiar_(datos.version, 20),
    ]);
    return json_({ ok: true, fila: hoja.getLastRow() });
  } finally {
    lock.releaseLock();
  }
}

/** Ejecutar una vez a mano. Crea la pestaña con formato y la clave, y la imprime en el registro. */
function configurar() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  libro.setSpreadsheetTimeZone(ZONA);
  const hoja = hoja_();
  const enc = hoja.getRange(1, 1, 1, ENCABEZADOS.length);
  enc.setValues([ENCABEZADOS])
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F3A5F')
    .setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
  hoja.setFrozenRows(1);
  hoja.setRowHeight(1, 30);
  hoja.getRange('A:I').setFontFamily('Arial').setFontSize(10);
  hoja.getRange('C:C').setNumberFormat('@');
  hoja.getRange('A:A').setNumberFormat('@');
  [150, 90, 260, 220, 160, 260, 280, 120, 70].forEach(function (w, i) { hoja.setColumnWidth(i + 1, w); });
  hoja.getRange(1, 1, Math.max(hoja.getMaxRows(), 2), ENCABEZADOS.length)
    .setBorder(true, true, true, true, true, true, '#D0D7E2', SpreadsheetApp.BorderStyle.SOLID);
  if (!hoja.getBandings().length) {
    hoja.getRange(1, 1, hoja.getMaxRows(), ENCABEZADOS.length)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
      .setHeaderRowColor('#1F3A5F');
  }
  if (!hoja.getFilter()) hoja.getRange(1, 1, hoja.getMaxRows(), ENCABEZADOS.length).createFilter();

  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TOKEN', token);
  }
  Logger.log('TOKEN=' + token);
  return token;
}

/** Cambia la clave. Después hay que volver a activar cada perfil con el enlace nuevo. */
function rotarClave() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  return configurar();
}

function hoja_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(PESTANA);
  if (!hoja) {
    hoja = libro.insertSheet(PESTANA, 0);
    hoja.getRange(1, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]);
  }
  return hoja;
}

/** Recorta y neutraliza fórmulas: un texto copiado de una web nunca se ejecuta en la hoja. */
function limpiar_(v, max) {
  if (v === null || v === undefined) return '';
  let s = String(v).slice(0, max);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
