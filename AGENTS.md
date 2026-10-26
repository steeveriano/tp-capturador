# Reglas para modificar TP Capturador

Aplica a personas y a agentes (Claude Code, otros chats).

1. **Clonar con historial completo y hacer `git pull` antes de tocar nada.**
2. **Subir `@version` en la cabecera de `tp-capturador.user.js` en cada cambio publicado** (semver: arreglo = parche, función nueva = menor). Subir también `VERSION` dentro del código y `version` en `package.json`. Si la versión no sube, Tampermonkey no actualiza a nadie.
3. **Un solo archivo de script.** Es lo que se instala desde el enlace raw. Las librerías externas van por `@require` con versión fija y hash `#sha256=`.
4. **Ningún secreto en el repositorio**: es público. La dirección del Apps Script y la clave llegan por el enlace de activación y viven solo en Tampermonkey. Los valores están en la bóveda (`gestion-data/_herramientas/BOVEDA.md`).
5. **La activación solo se acepta desde `github.com/steeveriano/tp-capturador`.** No relajar esa comprobación: un enlace de otro sitio podría desviar las capturas a una hoja ajena.
6. **Nada de la URL de origen más allá de `origin + pathname`** viaja a la hoja.
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
