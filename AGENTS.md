# Reglas para modificar TP Capturador

Aplica a personas y a agentes (Claude Code, otros chats).

1. **Clonar con historial completo y hacer `git pull` antes de tocar nada.**
2. **Subir `@version` en la cabecera de `tp-capturador.user.js` en cada cambio publicado** (semver: arreglo = parche, función nueva = menor). Subir también `VERSION` dentro del código y `version` en `package.json`. Si la versión no sube, Tampermonkey no actualiza a nadie.
3. **Un solo archivo de script.** Es lo que se instala desde el enlace raw. Las librerías externas van por `@require` con versión fija y hash `#sha256=`.
4. **Ningún secreto en el repositorio**: es público. La dirección del Apps Script y la clave llegan por el enlace de activación y viven solo en Tampermonkey. Los valores están en la bóveda local: `tp_capturador_token`, `tp_capturador_endpoint` y `tp_capturador_enlace_activacion` (ver `gestion-data/_herramientas/BOVEDA.md`).
5. **La activación solo se acepta desde `github.com/steeveriano/tp-capturador`.** No relajar esa comprobación: un enlace de otro sitio podría desviar las capturas a una hoja ajena.
6. **De la URL de origen solo viaja a la hoja `origin + pathname`.** Excepción, solo para post-its: los parámetros que pasan el filtro `urlSegura` (sin nombres como token, key, auth, session, ni valores con forma de clave) y el salto al párrafo (`#:~:text=`), que se arma únicamente si el texto no contiene nada que parezca un secreto. No relajar ese filtro.
7. **Probar antes de publicar:** `npm install && npm test`. Toda función nueva lleva su caso en `tests/prueba.mjs`, y la prueba nueva tiene que fallar si se rompe a propósito lo que prueba (control negativo).
8. **Si se cambia `apps-script/Codigo.gs`**, hay que pegarlo de nuevo en el editor de Apps Script de la hoja y publicar una **nueva versión de la misma implementación** (Implementar › Gestionar implementaciones › editar). Así la dirección `/exec` no cambia y nadie tiene que reactivar.
9. **Cada cambio se anota en `CHANGELOG.md`** con fecha y hora de Bogotá, versión, qué cambió y de dónde vino (issue, chat).
10. **Todo commit termina con:**
    ```
    Proyecto: 202609 Desarrollo y Estrategia
    Chat: <enlace o nombre del chat>
    Agente: <quién hizo el cambio>
    ```
11. Las solicitudes llegan como issues desde el botón **Pedir un cambio**. Se cierran con el commit que las resuelve (`Cierra #N`).
12. **Las pruebas usan la sombra cerrada, como en Chrome.** El simulador guarda la referencia que devuelve `attachShadow` pero no cambia el modo a `open`. Con la sombra abierta, `composedPath()` muestra los campos internos desde fuera y esconde errores reales: así pasó la 2.3.5, que en Chrome no aislaba el pegado. Para saber en qué campo ocurre algo desde un oyente de `window` o `document`, usar `sombra.activeElement`.
