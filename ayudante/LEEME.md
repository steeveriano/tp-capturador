# Ayudante local de la Bóveda

Programa mínimo en Python (solo biblioteca estándar) que permite a TP Capturador guardar y usar secretos sin que el navegador escriba en el disco.

- **Escucha solo en `127.0.0.1`** y no sale a internet. El único destino de red posible es OpenBao, y solo si se configura.
- **Guarda con la herramienta existente:** `secreto.guardar()` y `secreto.obtener()` de `secreto.py` (DPAPI). No crea archivos de secretos.
- **Clave propia** (`tp_capturador_ayudante_clave`, en la bóveda). El navegador la recibe una sola vez al vincularse.
- **Rechaza a las páginas web:** cabecera `Origin` http/https, `Host` distinto de 127.0.0.1/localhost, peticiones CORS previas. Cinco claves malas en un minuto lo bloquean un minuto.
- **Nunca sobrescribe** un secreto existente.
- **Ficha sin valor** a una cola local (`cola_fichas.jsonl`): referencia, objeto, titular, página de origen, fecha y rotación a 90 días. La registra el Custodio en la pestaña *Objetos* de la Bitácora de Fundación como *Referencia de secreto*.
- **Auditoría sin valores** (`auditoria.jsonl`): quién guardó u obtuvo qué nombre, cuándo y desde qué página.

## Instalación (solo tras la aceptación de la ACH y el registro del objeto)

1. Crear `%LOCALAPPDATA%\TPCapturador\ayudante.json` a partir de `ayudante.ejemplo.json`, con `ruta_secreto` apuntando a la carpeta `_herramientas` del equipo. La ruta vive en el equipo, no en el repositorio.
2. Primera vez: `python ayudante_boveda.py servir --vincular` y, dentro de 2 minutos, en Chrome: menú de Tampermonkey › **Vincular con el ayudante de la Bóveda**. Repetir por cada perfil.
3. Uso diario: `python ayudante_boveda.py servir` (o con `pythonw` para que no deje ventana).

## Comandos

| Comando | Qué hace |
|---|---|
| `servir [--vincular]` | Escucha en 127.0.0.1. `--vincular` abre 120 s para entregar la clave a un navegador, una sola vez |
| `estado` | Destino, número de secretos y fichas pendientes |
| `exportar-fichas [--salida X.csv] [--todas]` | CSV con las fichas pendientes para el Custodio; las marca como exportadas. No sobrescribe un CSV existente |
| `migrar --plan` / `migrar --ejecutar` | Copia la bóveda provisional a OpenBao solo creando (cas = 0). No sobrescribe en OpenBao y **no borra** la bóveda provisional: eso es un acto aparte (Transitoria III) |

## Paso a OpenBao (preparado, no activo)

En `ayudante.json`: `openbao.direccion` (https; http solo en 127.0.0.1), `montaje` (por defecto `secret`), `prefijo` (por defecto `tp`), `token_nombre` (nombre del token en la bóveda, nunca el token) y `ca` si el certificado es propio. Con eso:

- El menú **Migrar la Bóveda a OpenBao** muestra el plan y pide confirmación.
- Cambiando `"destino": "openbao"`, las capturas nuevas van directo a OpenBao con la misma interfaz.

Se probó contra un servidor KV v2 simulado, no contra un OpenBao real.

## Pruebas

`python3 -m unittest tests/test_ayudante.py`: 21 casos con secretos inventados y un OpenBao simulado.
