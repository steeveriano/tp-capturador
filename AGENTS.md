# Reglas para modificar TP Capturador

Aplica a personas y a agentes (Claude Code, otros chats).

1. **Clonar con historial completo y hacer `git pull` antes de tocar nada.**
2. **Versión fija desde la 2.4.0.** En cada versión se sube `@version`, `VERSION` y `version` en `package.json`, y `@updateURL`/`@downloadURL` apuntan a la **etiqueta** de esa versión (`https://raw.githubusercontent.com/sbntpnet/tp-capturador/vX.Y.Z/tp-capturador.user.js`), **nunca a `main`**. Se publica creando la etiqueta; la instalación en cada perfil es manual y solo con la aceptación de la ACH.
3. **Un solo archivo de script.** Es lo que se instala desde el enlace raw. Las librerías externas van por `@require` con versión fija y hash `#sha256=`.
4. **Ningún secreto en el repositorio, en las pruebas, en los issues ni en el chat**: es público. Las pruebas generan secretos inventados en tiempo de ejecución. La dirección del Apps Script y la clave llegan por el enlace de activación y viven solo en Tampermonkey. Los valores están en la bóveda local: `tp_capturador_token`, `tp_capturador_endpoint` y `tp_capturador_enlace_activacion` (ver `gestion-data/_herramientas/BOVEDA.md`).
5. **La activación solo se acepta desde `github.com/sbntpnet/tp-capturador`** (y la ruta anterior `steeveriano/tp-capturador` durante la transición). No relajar esa comprobación: un enlace de otro sitio podría desviar las capturas a una hoja ajena.
6. **Nada de la URL de origen más allá de `origin + pathname`** viaja a la hoja.
7. **Probar antes de publicar:** `npm install && npm test` (incluye `tests/boveda.mjs` y `python3 -m unittest tests/test_ayudante.py`). Toda función nueva lleva su caso en `tests/prueba.mjs`, y la prueba nueva tiene que fallar si se rompe a propósito lo que prueba (control negativo).
8. **Si se cambia `apps-script/Codigo.gs`**, hay que pegarlo de nuevo en el editor de Apps Script de la hoja y publicar una **nueva versión de la misma implementación** (Implementar › Gestionar implementaciones › editar). Así la dirección `/exec` no cambia y nadie tiene que reactivar.
9. **Cada cambio se anota en `CHANGELOG.md`** con fecha y hora de Bogotá, versión, qué cambió y de dónde vino (issue, chat).
10. **Todo commit termina con:**
    ```
    Proyecto: 202609 Desarrollo y Estrategia
    Chat: <enlace o nombre del chat>
    Agente: <quién hizo el cambio>
    ```
11. Las solicitudes llegan como issues desde el botón **Pedir un cambio**. Se cierran con el commit que las resuelve (`Cierra #N`).
12. **Secretos (Decreto 9):** ningún valor de secreto se escribe en el historial, la hoja, el puente, el almacenamiento de Tampermonkey, la cola de fichas, la auditoría ni la consola. «Omitir secretos» no tiene interruptor en el menú.
13. **Ayudante (`ayudante/`):** solo biblioteca estándar de Python, escucha solo en 127.0.0.1, nunca sobrescribe y nunca borra. La ruta de `secreto.py` vive en la configuración local del equipo. Todo proveedor nuevo (como OpenBao) entra como adaptador con la misma interfaz y su doble de pruebas (ADR-003).
