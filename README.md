# TP Capturador

Herramienta personal para Chrome, sobre Tampermonkey. Funciona en todos los sitios.

- **Contactos:** subraya teléfonos y correos de cualquier página. Un clic los guarda en la hoja de Google, abre WhatsApp, llama o busca.
- **Clic derecho propio:** copiar, cortar, pegar lo último, pegar del historial, recortar, guardar en la hoja. Un segundo clic derecho (o Ctrl+clic derecho) abre el menú normal de Chrome. Los sitios con menú propio, como Google Docs o Maps, conservan el suyo.
- **Barra al seleccionar texto:** Copiar · Cortar · Guardar · WhatsApp · Buscar · Recortar.
- **Historial del portapapeles:** guarda todo lo que copias durante 24 horas, solo en ese perfil de Chrome. Se abre con **Alt+V**.
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

## Pedir un cambio

En el clic derecho o en el menú de Tampermonkey está **Pedir un cambio a Claude Code**. Abre una solicitud (issue) en este repositorio con el sitio y la versión ya escritos. Claude Code la toma, cambia el código, prueba y publica. Tu navegador recibe la actualización sola.

## Dónde van los datos

| Dato | Dónde queda |
|---|---|
| Contactos, textos y recortes que guardas | Hoja de Google *TP Capturador · Capturas* |
| Historial del portapapeles | Solo en ese perfil de Chrome, 24 h. Nunca sale del navegador |
| Dirección de la hoja y clave | Almacenamiento de Tampermonkey del perfil. **Nunca en este repositorio** |

De la página de origen solo se envía el dominio y la ruta, sin parámetros, para que ningún token de una URL termine en la hoja.

## Límites conocidos

- La imagen del recorte se arma redibujando la página: videos, mapas y algunas imágenes de otros sitios salen en blanco. El texto sí sale.
- No corre en `chrome://`, en la Chrome Web Store ni en el visor de PDF de Chrome: Chrome no lo permite.
- El historial solo ve lo que se copia en páginas web. Para lo copiado en otras aplicaciones de Windows está **Win+V**.
- Pegar desde el *portapapeles de Windows* pide permiso a Chrome la primera vez en cada sitio. Pegar desde el historial no lo pide.

## Estructura

```
tp-capturador.user.js   el script completo (un solo archivo, es lo que se instala)
apps-script/Codigo.gs   receptor que escribe en la hoja de Google
tests/prueba.mjs        prueba de extremo a extremo en Chromium
AGENTS.md               reglas para quien lo modifique
CHANGELOG.md            historial de cambios
```
