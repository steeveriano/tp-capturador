# TP Capturador

Herramienta personal para Chrome, sobre Tampermonkey. Funciona en todos los sitios.

- **Contactos:** subraya teléfonos y correos de cualquier página. Un clic los guarda en la hoja de Google, abre WhatsApp, llama o busca.
- **Clic derecho propio:** copiar, cortar, pegar lo último, pegar del historial, recortar, guardar en la hoja. Un segundo clic derecho (o Ctrl+clic derecho) abre el menú normal de Chrome. Los sitios con menú propio, como Google Docs o Maps, conservan el suyo.
- **Barra al seleccionar texto:** Copiar · Cortar · Guardar · WhatsApp · Buscar · Post-it · Recortar.
- **Post-its del día:** notas flotantes con lista de tareas y categoría, pegadas al borde derecho de todas las páginas. Selecciona un texto › clic derecho › *Agregar post-it…*. Cada día nuevo pregunta qué hacer con los del día anterior. **Alt+N** los pliega.
- **Historial del portapapeles:** guarda todo lo que copias durante 24 horas, solo en ese perfil de Chrome, **también imágenes** con miniatura. Se abre con **Alt+V**.
- **Vista previa en el clic derecho:** la sección *Portapapeles* (o *Pegar*, dentro de un campo) muestra lo que hay ahora en el portapapeles de **Windows** y tus últimas tres copias, con miniatura si son imágenes. Un clic pega en el campo o vuelve a copiar.
- **Copiar imagen:** clic derecho sobre cualquier imagen › *Copiar imagen*. Funciona también con imágenes de otros sitios.
- **Puente Hermes ⇄ ChatGPT:** en Hermes (`hermes*.tierraparaiso.net`) y en ChatGPT aparece el botón naranja **Pasar a…**. Muestra las conversaciones de Hermes y ChatGPT abiertas en el perfil y tú eliges a cuál va. **Alt+P** envía directo a la emparejada. Toma la última respuesta, o lo que tengas seleccionado, y lo pega en la caja de la conversación elegida. **No envía**: tú revisas y pulsas Enter.
- **Lupa:** clic derecho › *Lupa* (o **Alt+L**). La página se amplía alrededor del cursor; la rueda del mouse amplía o reduce (de 1× a 8×) y al mover el mouse recorres la página. Los clics siguen funcionando. **Esc** o clic derecho para salir. Para ver nítido algo que vas a leer largo rato, Ctrl + rueda (zoom propio de Chrome) se ve más definido.
- **Recortar una zona:** arrastras un recuadro y obtienes la imagen y el texto de esa parte de la página.

## Instalar en un perfil de Chrome (una vez por perfil)

Cada perfil de Chrome (cada cuenta de Google con su propia ventana) se instala aparte.

1. **Tampermonkey:** instalarlo desde la [Chrome Web Store](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo). Después: clic derecho en su ícono › *Administrar extensión* › encender **Permitir secuencias de comandos de usuario** (*Allow User Scripts*). Sin ese interruptor no corre nada.
2. **El script:** abrir [este enlace](https://raw.githubusercontent.com/steeveriano/tp-capturador/main/tp-capturador.user.js) y pulsar **Instalar**.
3. **La activación:** abrir el *enlace de activación*, aceptar y escribir el nombre del perfil. El enlace está en la bóveda local del portátil con el nombre `tp_capturador_enlace_activacion` (se abre con `python boveda.py`; detalle en `gestion-data/_herramientas/BOVEDA.md`). Lleva la clave adentro: no se pega en chats ni en correos. **Atajo en el portátil para los pasos 2 y 3:** con la ventana del perfil al frente, doble clic en **Activar TP Capturador** del Escritorio. Abre el enlace de instalación, espera a que pulses Instalar y abre la activación sin mostrar la clave.

   **Cómo saber si quedó activado:** ícono de Tampermonkey › la última línea debe decir `Versión 2.0.0 · perfil: <nombre>`. Si dice `sin activar`, el resaltado y los menús funcionan, pero nada llega a la hoja.

Las actualizaciones llegan solas: Tampermonkey revisa este repositorio y se instala la versión nueva.

Si hay un script viejo "Sales TierraParaíso — Capturador de Contactos", **hay que borrarlo** desde el panel de Tampermonkey.

## Puente Hermes ⇄ ChatGPT

- Funciona entre pestañas **del mismo perfil de Chrome**, en una o en dos ventanas.
- **Hermes:** lee la respuesta por la API del propio Hermes, de la conversación del enlace (`?resume=…`). Si la pestaña no tiene ese parámetro, toma la conversación con actividad más reciente. Pega en la terminal del Chat como un Ctrl+V; con varias líneas no se envía sola.
- **ChatGPT:** lee el último mensaje de ChatGPT de la pestaña. Si ChatGPT todavía está escribiendo, no pasa nada y te avisa.
- **Elegir destino:** el botón lista todas las conversaciones abiertas de Hermes y de ChatGPT (incluso dos ChatGPT distintos), con la emparejada primero.
- **Emparejamiento:** cada vez que un paso entre Hermes y ChatGPT sale bien, quedan guardadas esas dos conversaciones. Alt+P usa esa pareja. Si después pulsas el botón y la otra pestaña no está abierta, abre la conversación emparejada y pega el texto cuando carga. En el menú de Tampermonkey están *Abrir la conversación emparejada* y *Olvidar el emparejamiento*.
- Por defecto antepone `[Respuesta de Hermes]` o `[Respuesta de ChatGPT]` para que la otra IA sepa de dónde viene. Se quita desde el menú de Tampermonkey.
- Si Chrome tenía dormida la otra pestaña, avisa que no respondió: un clic en esa pestaña y se repite.

## Post-its

- **Dónde están:** una pestaña oscura **Post-its** en el borde derecho; al lado, los post-its pequeños con su categoría, título y avance (`2/5`). Se arrastra la pestaña hacia arriba o abajo para moverlos. **Alt+N** o un clic en la pestaña los pliega y los despliega.
- **Crear:** selecciona un texto › clic derecho › *Agregar post-it…* › *Nuevo post-it con esto*; o el botón *Post-it* de la barra al seleccionar; o *+ Nuevo* en la pila; o clic derecho › *Nuevo post-it*. Lo seleccionado entra como primera tarea, con un enlace ↗ a la página de donde salió (dominio y ruta, sin parámetros).
- **Sumar a uno existente:** el mismo submenú lista tus post-its: *Agregar como tarea a…*.
- **Abrir:** clic en un post-it pequeño. Se edita el título, se marcan tareas, se agregan con Enter, se cambia la categoría con la etiqueta de color y hay un campo de *Notas de contexto*. *Copiar* lo pasa como texto; *Borrar* lo manda a la papelera.
- **Categorías:** Urgente, Comercial, Operación, Desarrollo, Gestión, Personal e Ideas. Los puntos de color de la pila filtran por categoría. Se crean, renombran, recolorean o quitan en *Categorías de post-its* (menú de Tampermonkey o *Editar categorías…* en la tarjeta).
- **Día nuevo:** la primera vez que abres Chrome en un día nuevo (hora de Bogotá) aparece *Buen día* con tres salidas: **Mantener todos**, **Solo lo pendiente** (quita lo hecho y los post-its terminados) o **Borrar todos**; o marcas uno por uno cuáles se quedan. *Decidir en una hora* pospone la pregunta. Pregunta una sola pestaña, no todas. Los que vienen de días anteriores muestran su edad (`2 d`).
- **Papelera:** lo borrado se recupera durante 7 días desde el menú de Tampermonkey › *Recuperar post-its borrados*.
- Lo que escribes en un post-it no dispara los atajos de teclado de la página (Gmail, GitHub, etc.).

## Imágenes y portapapeles de Windows

- **Copiar imagen** copia el archivo de verdad (PNG), listo para Ctrl+V en WhatsApp, correo, ChatGPT o documentos. Si la imagen es de otro sitio, el script la descarga por Tampermonkey. La primera vez en cada sitio Tampermonkey puede preguntar si permite la conexión: elige *Permitir siempre* (o *Permitir todos los dominios*).
- **Windows ahora:** el clic derecho y el historial muestran lo que hay en el portapapeles de Windows, aunque lo hayas copiado en otra aplicación. Chrome pide permiso **una vez por sitio** («ver texto e imágenes copiados»); hasta que lo des, aparece el botón *Ver qué hay en el portapapeles de Windows*. Lo que se lee de Windows entra al historial.
- **Pegar una imagen del historial** en un campo: los editores que aceptan imágenes (ChatGPT, Gmail, WhatsApp Web) la reciben como un Ctrl+V. Si el campo no las acepta, queda copiada y avisa que pulses Ctrl+V.
- Las últimas **8 imágenes** guardan el archivo completo; las anteriores quedan en miniatura y, si tienen dirección web, se vuelven a descargar al copiarlas.

## Pedir un cambio

En el clic derecho o en el menú de Tampermonkey está **Pedir un cambio a Claude Code**. Abre una solicitud (issue) en este repositorio con el sitio y la versión ya escritos. Claude Code la toma, cambia el código, prueba y publica. Tu navegador recibe la actualización sola.

## Dónde van los datos

| Dato | Dónde queda |
|---|---|
| Contactos, textos y recortes que guardas | Hoja de Google *TP Capturador · Capturas* |
| Historial del portapapeles (texto e imágenes) | Solo en ese perfil de Chrome, 24 h. Nunca sale del navegador. Borrar el historial borra también las imágenes |
| Post-its | Solo en ese perfil de Chrome, en todas sus pestañas. Nunca salen del navegador. La papelera guarda 7 días |
| Dirección de la hoja y clave | Almacenamiento de Tampermonkey del perfil. **Nunca en este repositorio** |

De la página de origen solo se envía el dominio y la ruta, sin parámetros, para que ningún token de una URL termine en la hoja.

## Límites conocidos

- La imagen del recorte se arma redibujando la página: videos, mapas y algunas imágenes de otros sitios salen en blanco. El texto sí sale.
- Los post-its son **por perfil de Chrome**: los de «Steeve personal» no se ven en otro perfil.
- No corre en `chrome://`, en la Chrome Web Store ni en el visor de PDF de Chrome: Chrome no lo permite.
- Lo copiado en otras aplicaciones de Windows entra al historial cuando el script lee el portapapeles (al abrir el clic derecho o el historial), no en el momento de copiarlo. Solo se ve lo último que hay en Windows; para su historial completo está **Win+V**.
- Leer el portapapeles de Windows pide permiso a Chrome la primera vez en cada sitio. Si lo bloqueaste, se reactiva en el candado de la barra de direcciones.

## Estructura

```
tp-capturador.user.js   el script completo (un solo archivo, es lo que se instala)
apps-script/Codigo.gs   receptor que escribe en la hoja de Google
tests/prueba.mjs        prueba de extremo a extremo en Chromium
AGENTS.md               reglas para quien lo modifique
CHANGELOG.md            historial de cambios
```
