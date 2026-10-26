# Receptor en Google Sheets

- **Hoja:** *TP Capturador · Capturas*, en el Drive de steeve.riano@gmail.com, pestaña `Capturas`.
- **Proyecto Apps Script:** *TP Capturador · receptor* (proyecto independiente, no pegado a la hoja).
- **Propiedades del script:** `HOJA_ID` (la hoja de destino) y `TOKEN` (la clave). Ninguna se escribe en este repositorio.
- **Implementación:** aplicación web *TP Capturador 2.0.0*. Ejecuta como steeve.riano@gmail.com; acceso: cualquier usuario. Sin la clave correcta responde `{"ok":false,"error":"token"}` y no escribe nada.
- **La dirección `/exec`** está en la bóveda (`tp_capturador_endpoint`).

## Protecciones

- La clave se compara en cada envío.
- Un texto que empiece por `=`, `+`, `-` o `@` entra precedido de un apóstrofo: nunca se ejecuta como fórmula.
- Teléfonos y correos repetidos no se duplican: la respuesta devuelve la fila donde ya estaban.
- `LockService` serializa las escrituras simultáneas de varias pestañas o perfiles.

## Cambiar el código sin cambiar la dirección

Pegar `Codigo.gs` en el editor › Implementar › **Gestionar implementaciones** › lápiz › Versión: *Nueva versión* › Implementar. Si se crea una implementación *nueva*, cambia la dirección y hay que reactivar todos los perfiles.

## Rotar la clave

Ejecutar `rotarClave()` en el editor, guardar la nueva en la bóveda y volver a abrir el enlace de activación nuevo en cada perfil.
