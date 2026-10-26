# TP Capturador

Herramienta personal para Chrome, sobre Tampermonkey. Funciona en todos los sitios.

- **Contactos:** subraya teléfonos y correos de cualquier página. Un clic los guarda en la hoja de Google, abre WhatsApp, llama o busca.
- **Clic derecho propio:** copiar, cortar, pegar lo último, pegar del historial, recortar, guardar en la hoja. Un segundo clic derecho (o Ctrl+clic derecho) abre el menú normal de Chrome. Los sitios con menú propio, como Google Docs o Maps, conservan el suyo.
- **Barra al seleccionar texto:** Copiar · Cortar · Guardar · WhatsApp · Buscar · Recortar.
- **Historial del portapapeles:** guarda lo que copias durante 24 horas, solo en ese perfil de Chrome. Se abre con **Alt+V**. No guarda lo que parezca una contraseña o una clave.
- **Recortar una zona:** arrastras un recuadro y obtienes la imagen y el texto de esa parte de la página.

## Instalar en un perfil de Chrome (una vez por perfil)

Cada perfil de Chrome (cada cuenta de Google con su propia ventana) se instala aparte.

1. **Tampermonkey:** instalarlo desde la [Chrome Web Store](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo). Después: clic derecho en su ícono › *Administrar extensión* › encender **Permitir secuencias de comandos de usuario** (*Allow User Scripts*). Sin ese interruptor no corre nada.
2. **El script:** abrir [este enlace](https://raw.githubusercontent.com/steeveriano/tp-capturador/main/tp-capturador.user.js) y pulsar **Instalar**.
3. **La activación:** abrir el *enlace de activación*, aceptar y escribir el nombre del perfil. El enlace está en la bóveda local del portátil con el nombre `tp_capturador_enlace_activacion` (se abre con `python boveda.py`; detalle en `gestion-data/_herramientas/BOVEDA.md`). Lleva la clave adentro: no se pega en chats ni en correos.

Las actualizaciones llegan solas: Tampermonkey revisa este repositorio y se instala la versión nueva.

Si hay un script viejo "Sales TierraParaíso — Capturador de Contactos", **hay que borrarlo** desde el panel de Tampermonkey.

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
