# Cambios

## 2.4.0 · 2026-10-29 03:04 (Bogotá) · EN PRUEBAS, sin instalar

Orden de la ACH del 29-oct-2026 · TP Capturador · captura de secretos. No se instala hasta que la reforma del Decreto 9 esté firmada y TP Capturador registrado como objeto.

- **A la Bóveda** (clic derecho y barra de selección): pide servicio, entorno, tipo, objeto y titular; nombre `servicio_entorno_tipo`; guarda por el ayudante local con `secreto.guardar()`. No sobrescribe. El valor no se muestra ni se guarda en el navegador.
- **Pegar desde la Bóveda**: busca por nombre y pega en el campo activo sin pasar por el portapapeles ni por el historial; sin campo, copia y limpia el portapapeles a los 30 s.
- **Ayudante local** (`ayudante/`): solo 127.0.0.1, clave propia, rechaza páginas web, cola de fichas sin valor con exportación CSV para el Custodio, auditoría sin valores.
- **Bloqueos**: «Omitir secretos» encendido por defecto y forzado al actualizar. Nada que parezca secreto va al historial ni a la hoja; en el puente Hermes ⇄ ChatGPT se tapa como `[secreto omitido]`.
- **OpenBao preparado**: adaptador KV v2 (solo crear, cas = 0), cambio de destino por configuración y botón de migración desde la bóveda provisional, sin borrarla.
- **Versión fija**: `@updateURL` apunta a la etiqueta `v2.4.0` de `sbntpnet/tp-capturador`; ya no se actualiza desde la rama principal.
- Revierte la 2.3.1 (historial sin filtro) por orden de la ACH.
- Pruebas: 30 casos nuevos en `tests/boveda.mjs`, 2 nuevos en el puente (31 en total), 21 del ayudante; 40 de la batería general siguen en verde; controles negativos verificados.

Origen: orden de la ACH en el chat https://claude.ai/chat/5658e950-6b45-4967-93af-7c220e4f7d88

## 2.3.1 · 2026-10-26 16:09 (Bogotá)

- El historial guarda todo lo copiado, sin filtrar lo que parezca contraseña, y ya no muestra el aviso. Decisión de Steeve. El historial sigue local al perfil y se borra a las 24 h.

Origen: chat https://claude.ai/chat/5658e950-6b45-4967-93af-7c220e4f7d88

## 2.3.0 · 2026-10-26 15:19 (Bogotá)

- El botón del puente pasa a llamarse "Pasar a…" y abre un selector con todas las conversaciones de Hermes y ChatGPT abiertas en el perfil; la emparejada va primero. Se puede elegir entre varias conversaciones de ChatGPT.
- Alt+P sigue enviando directo a la conversación emparejada.
- Pruebas del puente: 28 casos, incluido "la otra conversación no recibe nada", con control negativo.

Origen: chat https://claude.ai/chat/5658e950-6b45-4967-93af-7c220e4f7d88

## 2.2.0 · 2026-10-26 15:15 (Bogotá)

- Lupa: clic derecho › Lupa o Alt+L. Amplía alrededor del cursor; la rueda amplía o reduce entre 1× y 8×; Esc o clic derecho para salir.
- Botón del puente en Hermes: pasa de la izquierda a la derecha, y su letra vuelve a ser sin serifa.
- Pruebas: 8 casos nuevos de lupa y 2 de posición del botón, con control negativo.

Origen: chat https://claude.ai/chat/5658e950-6b45-4967-93af-7c220e4f7d88

## 2.1.0 · 2026-10-26 13:40 (Bogotá)

- Puente Hermes ⇄ ChatGPT: botón "Pasar a…" y atajo Alt+P. Lleva la última respuesta, o lo seleccionado, a la caja de la otra pestaña sin enviarla.
- Hermes se lee por su API (`/api/sessions/{id}/latest-descendant` y `/messages`) y se escribe con un evento de pegado sobre la terminal. Verificado en el Hermes ASUS real: el texto de varias líneas queda en la caja sin enviarse.
- Emparejamiento de conversaciones: si la otra pestaña no está abierta, abre la conversación emparejada y pega al cargar.
- Nueva prueba `tests/puente.mjs` (17 casos, dos pestañas reales) con control negativo.
- Permisos nuevos: `GM_addValueChangeListener`, `GM_removeValueChangeListener` y `@connect tierraparaiso.net`. Tampermonkey los pide al actualizar.

Origen: chat https://claude.ai/chat/5658e950-6b45-4967-93af-7c220e4f7d88

## 2.0.0 · 2026-10-26 09:15 (Bogotá)

Reescritura completa del antiguo "Sales TierraParaíso — Capturador de Contactos" v1.2.1.

- Los contactos van a una hoja de Google por Apps Script, no al portal sales.tierraparaiso.net.
- Resaltado sin modificar la página (CSS Custom Highlight API): no rompe Gmail, WhatsApp Web ni GHL.
- Detección corregida: celulares (3xx), fijos colombianos (60x) y números internacionales con "+". Lee también los enlaces `tel:`, `mailto:` y `wa.me`. Ya no confunde NIT ni números de pedido con teléfonos.
- Menú propio de clic derecho, barra al seleccionar texto, historial del portapapeles (Alt+V), recortar zona (imagen y texto).
- Activación por enlace privado; la clave nunca vive en el código.
- A la hoja solo viaja el dominio y la ruta de la página de origen, sin parámetros.
- Cola sin conexión: lo que no se pudo enviar se reintenta solo.
- Actualización automática desde este repositorio y botón "Pedir un cambio a Claude Code".

Receptor: el Apps Script quedó como proyecto independiente; lee la hoja de destino desde la propiedad `HOJA_ID`. Desplegado y verificado contra Google real el 2026-10-26 09:33: clave falsa rechazada, fila escrita, teléfono repetido detectado, fórmula neutralizada.

Origen: chat https://claude.ai/chat/5658e950-6b45-4967-93af-7c220e4f7d88
