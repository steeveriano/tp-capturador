# Cambios

## 2.3.5 · 2026-11-04 03:37 (Bogotá)

- **Pegar dentro de un post-it ya funciona en claude.ai, ChatGPT y apps parecidas.** Esas páginas atrapan todo lo que se pega para llevarlo a su propia caja. Ahora lo que se pega en un campo del script no les llega; y si una página lo bloquea antes de que cargue el script, el texto se escribe igual en el campo (en ese caso la página también puede quedarse con su copia).
- **«+ Nuevo» usa lo seleccionado:** si hay texto seleccionado, entra como tarea con su origen y el salto al párrafo, igual que «Agregar post-it». También en el clic derecho («Nuevo post-it con lo seleccionado») y en el menú de Tampermonkey.
- Pruebas: `tests/pegar.mjs` (10 casos) con dos páginas que atrapan el pegado (desde el documento y desde la ventana); controles negativos sobre el aislamiento del pegado, la escritura a mano y la selección en «+ Nuevo».

Origen: reporte de Steeve en el chat https://claude.ai/chat/5658e950-6b45-4967-93af-7c220e4f7d88 (4-nov-2026 03:32), con captura en claude.ai.

## 2.3.4 · 2026-11-04 00:14 (Bogotá)

- **Anclar (Alt+K)**, botón *Anclar* en la pila y en el clic derecho: post-it con el título de la página, la hora de Bogotá, el sitio y la dirección con salto al párrafo seleccionado (`#:~:text=`). Lo seleccionado entra como tarea.
- **Volver ahí** en cada post-it con origen: abre la página y, cuando el contenido carga (chats de una sola página), marca el párrafo anclado y lo deja a la vista.
- **«+ Nuevo» también guarda el origen** (título, sitio, dirección y hora); se ve al pie de la tarjeta.
- **Bitácora en la hoja:** cada post-it creado, editado, terminado o borrado agrega una fila a la pestaña *Post-its* (13 columnas, compartidas con los chats de Claude). Cambios seguidos se juntan (6 s). Sin conexión, sin activar o con el receptor viejo, la fila espera en la cola existente. La cola no guarda la clave.
- **Receptor de Apps Script:** `postit_()` agrega a *Post-its* sin repetir eventos y sin editar filas. **Hay que pegarlo y publicar una versión nueva de la misma implementación** (ver `apps-script/LEEME.md`). Mientras tanto, las filas esperan en la cola.
- **Secretos:** lo que parece una clave se reemplaza por `[secreto omitido]` antes de guardarse en un post-it; la dirección pierde los parámetros sensibles y no lleva salto si el texto tenía algo así.
- **Arreglos:** la interfaz vive en `<html>` y se repone sola si la página la borra (ChatGPT y otras apps de una sola página). Cada post-it se guarda en su propia clave: dos pestañas que editan post-its distintos a la vez ya no se pisan. Los post-its guardados con la 2.3.3 se migran solos.
- Sin permisos nuevos (`@grant` y `@connect` iguales a la 2.3.3).
- Pruebas: `tests/bitacora.mjs` (36 casos) y `tests/receptor.mjs` (13 casos, Apps Script con hoja simulada). Controles negativos sobre la fusión entre pestañas, la reposición de la interfaz, la agrupación de cambios, la cola sin activar, el falso positivo de «clave:» y la deduplicación del receptor.
- AGENTS.md, regla 6: excepción documentada para la dirección de los post-its.

Origen: pedido de Steeve en el chat https://claude.ai/chat/5658e950-6b45-4967-93af-7c220e4f7d88 (3-nov-2026 23:44).

## 2.3.3 · 2026-10-29 05:13 (Bogotá)

- **Copiar imagen** en el clic derecho sobre una imagen. Antes el menú propio solo ofrecía copiar su dirección y tapaba el «Copiar imagen» de Chrome. Las imágenes de otros sitios se descargan por Tampermonkey (`@connect *`).
- **Vista previa del portapapeles** en el clic derecho: lo que hay ahora en Windows (texto o imagen, con miniatura) y las últimas tres copias. Un clic pega en el campo o vuelve a copiar. Chrome pide permiso de lectura una vez por sitio.
- El **historial guarda imágenes** con miniatura (copiadas, recortadas o leídas de Windows). Las últimas 8 conservan el archivo completo. Se reconocen por sus píxeles, así que la misma imagen no se duplica aunque Windows la vuelva a codificar.
- Pegar una imagen del historial en editores que aceptan imágenes (ChatGPT, Gmail, WhatsApp Web) como un Ctrl+V; en los demás campos queda copiada.
- Pruebas: `tests/imagenes.mjs`, 24 casos sobre el portapapeles real de Chromium, con imagen del mismo sitio y de otro que no deja descargarla; controles negativos sobre la descarga por Tampermonkey, la huella por píxeles, el límite de imágenes y el pegado.
- Sigue en 2.3.x porque la 2.4.0 está reservada para la entrega en revisión de la ACH (PR #1).

Origen: chat https://claude.ai/chat/5658e950-6b45-4967-93af-7c220e4f7d88

## 2.3.2 · 2026-10-29 04:14 (Bogotá)

- **Post-its del día.** Pila flotante en el borde derecho de todas las páginas: post-its pequeños con categoría, título y avance; un clic abre la tarjeta con lista de tareas, notas de contexto, copiar y borrar. Se arrastran para cambiar de altura; **Alt+N** los pliega.
- **Agregar post-it** en el clic derecho (con texto seleccionado) y botón *Post-it* en la barra al seleccionar: nuevo post-it con lo seleccionado, o como tarea de uno existente. La tarea guarda la página de origen, solo dominio y ruta.
- **Siete categorías** (Urgente, Comercial, Operación, Desarrollo, Gestión, Personal, Ideas), filtro por color y editor de categorías.
- **Día nuevo (hora de Bogotá):** pregunta una sola vez, en una sola pestaña: mantener todos, solo lo pendiente, borrar todos o elegir uno por uno; o decidir en una hora.
- Papelera de 7 días con *Recuperar post-its borrados* en el menú de Tampermonkey.
- Lo que se escribe en los campos del script ya no llega a los atajos de teclado de la página.
- Pruebas: `tests/postits.mjs`, 47 casos con dos pestañas reales y memoria compartida; controles negativos sobre el aislamiento de teclas, «solo lo pendiente», el turno entre pestañas, el origen sin parámetros y la pregunta del mismo día.
- Número de versión: es función nueva, pero sale como parche porque la **2.4.0 está reservada** para la entrega de captura de secretos que espera aceptación de la ACH (PR #1). Esa rama se rebasa sobre esta antes de fusionarse.

Origen: chat https://claude.ai/chat/5658e950-6b45-4967-93af-7c220e4f7d88

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
