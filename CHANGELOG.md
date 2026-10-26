# Cambios

## 2.2.0 · 2026-10-26 15:20 (Bogotá)

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
