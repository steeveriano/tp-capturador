# -*- coding: utf-8 -*-
"""
Ayudante local de la Bóveda para TP Capturador
==============================================

Puente mínimo entre el navegador y la Bóveda del equipo. Un plugin de
navegador no puede escribir en el disco; este programa sí, y solo hace cuatro
cosas: guardar un secreto nuevo, entregar uno por su nombre, listar nombres y
dejar la ficha (sin valor) en una cola local para el Custodio.

Garantías:
  - Escucha solo en 127.0.0.1. Nada sale a internet. El único destino de red
    posible es OpenBao, y solo si se configura de forma expresa.
  - Toda petición lleva la clave propia del ayudante (cabecera X-TP-Clave).
  - Rechaza peticiones que vengan de páginas web (cabecera Origin http/https),
    con Host distinto de 127.0.0.1/localhost (DNS rebinding) y las de
    verificación previa CORS (OPTIONS). Una página web no puede hablarle.
  - Nunca sobrescribe un secreto existente.
  - Ningún valor se escribe en la cola de fichas, en la auditoría ni en la
    consola.

Uso:
    python ayudante_boveda.py servir              escucha en 127.0.0.1
    python ayudante_boveda.py servir --vincular   abre 120 s para vincular el navegador
    python ayudante_boveda.py estado              configuración y fichas pendientes
    python ayudante_boveda.py exportar-fichas [--salida ARCHIVO.csv]
    python ayudante_boveda.py migrar --plan | --ejecutar

La configuración vive en el equipo, no en el repositorio:
    %LOCALAPPDATA%\\TPCapturador\\ayudante.json   (o la ruta de TP_AYUDANTE_CONFIG)
Ver ayudante.ejemplo.json.
"""
import argparse
import csv
import datetime
import hmac
import http.server
import json
import os
import re
import secrets
import ssl
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

VERSION = "1.0.0"
PUERTO_DEF = 47321
BOGOTA = datetime.timezone(datetime.timedelta(hours=-5), "Bogota")
ROTACION_DIAS = 90  # Decreto 9, Art. 5
TIPO_OBJETO = "Referencia de secreto"  # Decreto 1
MAX_CUERPO = 64 * 1024
MAX_VALOR = 20000
VENTANA_VINCULAR = 120
NOMBRE_CLAVE_DEF = "tp_capturador_ayudante_clave"


def ahora():
    return datetime.datetime.now(BOGOTA)


def ahora_texto():
    return ahora().strftime("%Y-%m-%d %H:%M:%S")


# ───────────────────────────── configuración ─────────────────────────────
def ruta_config():
    if os.environ.get("TP_AYUDANTE_CONFIG"):
        return os.environ["TP_AYUDANTE_CONFIG"]
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(base, "TPCapturador", "ayudante.json")


def cargar_config(ruta=None):
    ruta = ruta or ruta_config()
    if not os.path.exists(ruta):
        raise SystemExit(
            "Falta la configuración local: %s\n"
            "Cópiala desde ayudante.ejemplo.json y pon la ruta de tu carpeta _herramientas." % ruta)
    with open(ruta, encoding="utf-8") as f:
        c = json.load(f)
    c.setdefault("puerto", PUERTO_DEF)
    c.setdefault("destino", "local")
    c.setdefault("nombre_clave", NOMBRE_CLAVE_DEF)
    c.setdefault("carpeta_datos", os.path.dirname(os.path.abspath(ruta)))
    c.setdefault("openbao", {})
    return c


def importar_secreto(ruta_herramientas):
    """El módulo secreto.py de la bóveda. Su ruta viene de la configuración local."""
    if not ruta_herramientas or not os.path.exists(os.path.join(ruta_herramientas, "secreto.py")):
        raise SystemExit("La configuración no apunta a la carpeta que contiene secreto.py")
    sys.path.insert(0, ruta_herramientas)
    import secreto  # noqa: E402
    return secreto


# ───────────────────────────── nombres ─────────────────────────────
def _parte(texto):
    t = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-z0-9]+", "_", t.lower()).strip("_")
    return re.sub(r"_+", "_", t)


def normalizar(servicio, entorno, tipo):
    """servicio_entorno_tipo, en minúsculas, sin tildes ni espacios."""
    partes = [_parte(servicio), _parte(entorno), _parte(tipo)]
    if not all(partes):
        raise ValueError("faltan servicio, entorno o tipo")
    nombre = "_".join(partes)
    if len(nombre) > 80:
        raise ValueError("el nombre pasa de 80 caracteres")
    return nombre


def origen_limpio(url):
    """Solo esquema, dominio y ruta: ningún parámetro ni fragmento."""
    try:
        u = urllib.parse.urlsplit(str(url or ""))
        if u.scheme not in ("http", "https"):
            return ""
        return "%s://%s%s" % (u.scheme, u.netloc, u.path)[:500]
    except ValueError:
        return ""


# ───────────────────────────── adaptadores de bóveda ─────────────────────────────
class YaExiste(Exception):
    pass


class NoExiste(Exception):
    pass


class BovedaLocal:
    """Bóveda provisional (Decreto 9, Transitoria III): secreto.py con DPAPI."""

    nombre = "local"

    def __init__(self, modulo):
        self.m = modulo

    def nombres(self):
        return list(self.m.nombres())

    def existe(self, nombre):
        return bool(self.m.existe(nombre))

    def obtener(self, nombre):
        if not self.existe(nombre):
            raise NoExiste(nombre)
        return self.m.obtener(nombre)

    def usuario(self, nombre):
        return self.m.usuario(nombre) or ""

    def ficha(self, nombre):
        return self.m.ficha(nombre) or {}

    def guardar_nuevo(self, nombre, valor, meta):
        if self.existe(nombre):
            raise YaExiste(nombre)
        self.m.guardar(
            nombre, valor,
            usuario=meta.get("usuario", ""),
            categoria=meta.get("categoria", ""),
            unidad=meta.get("titular", ""),
            web=meta.get("origen", ""),
            tipo=meta.get("tipo", ""),
            nota=meta.get("objeto", ""),
            documento=meta.get("documento", ""),
        )


class BovedaMemoria:
    """Doble de pruebas (ADR-003): misma interfaz, en memoria."""

    nombre = "memoria"

    def __init__(self):
        self.datos = {}

    def nombres(self):
        return sorted(self.datos)

    def existe(self, nombre):
        return nombre in self.datos

    def obtener(self, nombre):
        if nombre not in self.datos:
            raise NoExiste(nombre)
        return self.datos[nombre]["valor"]

    def usuario(self, nombre):
        return self.datos.get(nombre, {}).get("usuario", "")

    def ficha(self, nombre):
        d = dict(self.datos.get(nombre, {}))
        d.pop("valor", None)
        d.pop("usuario", None)
        return d

    def guardar_nuevo(self, nombre, valor, meta):
        if nombre in self.datos:
            raise YaExiste(nombre)
        self.datos[nombre] = dict(meta, valor=valor)


class BovedaOpenBao:
    """Bóveda definitiva: OpenBao, motor KV versión 2.

    Escritura solo-crear con options.cas = 0 (el servidor rechaza si la clave ya
    existe). Listado por LIST sobre /metadata. Valor y metadatos no secretos
    viajan en el mismo mapa data.
    """

    nombre = "openbao"

    def __init__(self, direccion, token, montaje="secret", prefijo="tp", contexto_tls=None, tiempo=15):
        u = urllib.parse.urlsplit(direccion)
        local = u.hostname in ("127.0.0.1", "localhost", "::1")
        if u.scheme != "https" and not local:
            raise ValueError("OpenBao debe ir por https (solo 127.0.0.1 admite http)")
        if not token:
            raise ValueError("falta el token de OpenBao")
        self.base = direccion.rstrip("/")
        self.token = token
        self.montaje = montaje.strip("/")
        self.prefijo = prefijo.strip("/")
        self.tls = contexto_tls
        self.tiempo = tiempo

    def _ruta(self, tipo, nombre=""):
        partes = [self.montaje, tipo]
        if self.prefijo:
            partes.append(self.prefijo)
        if nombre:
            partes.append(urllib.parse.quote(nombre, safe=""))
        return "/v1/" + "/".join(partes)

    def _pedir(self, metodo, ruta, cuerpo=None):
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        req = urllib.request.Request(self.base + ruta, data=datos, method=metodo)
        req.add_header("X-Vault-Token", self.token)
        if datos is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.tiempo, context=self.tls) as r:
                texto = r.read().decode() or "{}"
                return r.status, json.loads(texto)
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read().decode() or "{}")
            except ValueError:
                return e.code, {}

    def nombres(self):
        st, j = self._pedir("LIST", self._ruta("metadata") + "/")
        if st == 404:
            return []
        if st != 200:
            raise RuntimeError("OpenBao respondió %s al listar" % st)
        return sorted(k for k in j.get("data", {}).get("keys", []) if not k.endswith("/"))

    def existe(self, nombre):
        st, _ = self._pedir("GET", self._ruta("metadata", nombre))
        if st == 200:
            return True
        if st == 404:
            return False
        raise RuntimeError("OpenBao respondió %s" % st)

    def obtener(self, nombre):
        st, j = self._pedir("GET", self._ruta("data", nombre))
        if st == 404:
            raise NoExiste(nombre)
        if st != 200:
            raise RuntimeError("OpenBao respondió %s" % st)
        return j["data"]["data"]["valor"]

    def usuario(self, nombre):
        st, j = self._pedir("GET", self._ruta("data", nombre))
        return j.get("data", {}).get("data", {}).get("usuario", "") if st == 200 else ""

    def ficha(self, nombre):
        st, j = self._pedir("GET", self._ruta("data", nombre))
        if st != 200:
            return {}
        d = dict(j["data"]["data"])
        d.pop("valor", None)
        d.pop("usuario", None)
        return d

    def guardar_nuevo(self, nombre, valor, meta):
        data = {k: str(v) for k, v in meta.items() if v}
        data["valor"] = valor
        st, j = self._pedir("POST", self._ruta("data", nombre), {"options": {"cas": 0}, "data": data})
        if st in (200, 204):
            return
        errores = " ".join(j.get("errors", []))
        if "check-and-set" in errores:
            raise YaExiste(nombre)
        raise RuntimeError("OpenBao respondió %s al guardar" % st)


def abrir_openbao(conf, modulo_secreto):
    ob = conf.get("openbao") or {}
    if not ob.get("direccion"):
        raise ValueError("OpenBao no está configurado (openbao.direccion)")
    token = modulo_secreto.obtener(ob.get("token_nombre") or "openbao_token_tp_capturador")
    contexto = None
    if ob.get("ca"):
        contexto = ssl.create_default_context(cafile=ob["ca"])
    return BovedaOpenBao(ob["direccion"], token, ob.get("montaje", "secret"), ob.get("prefijo", "tp"), contexto)


# ───────────────────────────── registros locales ─────────────────────────────
class Registros:
    """Cola de fichas (sin valor) y auditoría (sin valor), en la carpeta de datos local."""

    def __init__(self, carpeta):
        self.carpeta = carpeta
        os.makedirs(carpeta, exist_ok=True)
        self.cola = os.path.join(carpeta, "cola_fichas.jsonl")
        self.auditoria = os.path.join(carpeta, "auditoria.jsonl")
        self._candado = threading.Lock()

    def _anexar(self, ruta, obj):
        with self._candado, open(ruta, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")

    def auditar(self, accion, nombre="", origen="", resultado="ok", detalle=""):
        self._anexar(self.auditoria, {
            "fecha": ahora_texto(), "accion": accion, "nombre": nombre,
            "origen": origen, "resultado": resultado, "detalle": detalle})

    def encolar_ficha(self, nombre, objeto, titular, origen):
        fecha = ahora()
        self._anexar(self.cola, {
            "referencia": nombre,
            "tipo_objeto": TIPO_OBJETO,
            "objeto": objeto,
            "titular": titular,
            "origen": origen,
            "fecha": fecha.strftime("%Y-%m-%d %H:%M"),
            "rotacion_dias": ROTACION_DIAS,
            "proxima_rotacion": (fecha + datetime.timedelta(days=ROTACION_DIAS)).strftime("%Y-%m-%d"),
            "exportada": "",
        })

    def fichas(self):
        if not os.path.exists(self.cola):
            return []
        with open(self.cola, encoding="utf-8") as f:
            return [json.loads(x) for x in f if x.strip()]

    def exportar(self, salida, todas=False):
        with self._candado:
            fichas = self.fichas()
            elegidas = [f for f in fichas if todas or not f.get("exportada")]
            if not elegidas:
                return 0
            columnas = [("referencia", "Referencia"), ("tipo_objeto", "Tipo de objeto"),
                        ("objeto", "Objeto"), ("titular", "Titular"), ("origen", "Página de origen"),
                        ("fecha", "Fecha (Bogotá)"), ("rotacion_dias", "Rotación (días)"),
                        ("proxima_rotacion", "Próxima rotación")]
            with open(salida, "x", encoding="utf-8-sig", newline="") as f:
                w = csv.writer(f)
                w.writerow([t for _, t in columnas])
                for fi in elegidas:
                    w.writerow([fi.get(k, "") for k, _ in columnas])
            marca = ahora_texto()
            for fi in elegidas:
                fi["exportada"] = fi.get("exportada") or marca
            tmp = self.cola + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                for fi in fichas:
                    f.write(json.dumps(fi, ensure_ascii=False) + "\n")
            os.replace(tmp, self.cola)
            return len(elegidas)


# ───────────────────────────── servicio ─────────────────────────────
class Ayudante:
    def __init__(self, conf, boveda, clave, registros, origen_boveda_local=None, destino_migracion=None):
        self.conf = conf
        self.boveda = boveda
        self.clave = clave
        self.reg = registros
        self.local = origen_boveda_local or boveda
        self.destino_migracion = destino_migracion  # función que abre OpenBao, o None
        self.vincular_hasta = 0.0
        self.fallos = []
        self.bloqueado_hasta = 0.0
        self._candado = threading.Lock()

    def abrir_vinculacion(self, segundos=VENTANA_VINCULAR):
        self.vincular_hasta = time.time() + segundos

    # ── acciones ──
    def guardar(self, cuerpo):
        nombre = normalizar(cuerpo.get("servicio"), cuerpo.get("entorno"), cuerpo.get("tipo"))
        valor = str(cuerpo.get("valor") or "").strip()
        objeto = str(cuerpo.get("objeto") or "").strip()[:500]
        titular = str(cuerpo.get("titular") or "").strip()[:200]
        origen = origen_limpio(cuerpo.get("origen"))
        if not valor:
            raise ValueError("no hay valor que guardar")
        if len(valor) > MAX_VALOR:
            raise ValueError("el valor es demasiado largo")
        if not objeto or not titular:
            raise ValueError("faltan el objeto o el titular")
        fecha = ahora()
        meta = {
            "categoria": "Capturado con TP Capturador",
            "titular": titular, "objeto": objeto, "origen": origen,
            "tipo": _parte(cuerpo.get("tipo")),
            "documento": "Capturado con TP Capturador el %s (Bogotá). Rotación cada %d días; próxima: %s." % (
                fecha.strftime("%Y-%m-%d %H:%M"), ROTACION_DIAS,
                (fecha + datetime.timedelta(days=ROTACION_DIAS)).strftime("%Y-%m-%d")),
        }
        with self._candado:
            try:
                self.boveda.guardar_nuevo(nombre, valor, meta)
            except YaExiste:
                self.reg.auditar("guardar", nombre, origen, "rechazado", "ya existe")
                raise
        self.reg.encolar_ficha(nombre, objeto, titular, origen)
        self.reg.auditar("guardar", nombre, origen)
        del valor
        return {"ok": True, "nombre": nombre, "destino": self.boveda.nombre}

    def nombres(self, q=""):
        q = (q or "").strip().lower()
        lista = self.boveda.nombres()
        return [n for n in lista if not q or q in n.lower()][:200]

    def obtener(self, nombre, origen=""):
        nombre = str(nombre or "")
        if nombre not in self.boveda.nombres():
            self.reg.auditar("obtener", nombre, origen_limpio(origen), "rechazado", "no existe")
            raise NoExiste(nombre)
        valor = self.boveda.obtener(nombre)
        self.reg.auditar("obtener", nombre, origen_limpio(origen))
        return valor

    def plan_migracion(self):
        if not self.destino_migracion:
            raise ValueError("OpenBao no está configurado: no hay a dónde migrar")
        bao = self.destino_migracion()
        locales = self.local.nombres()
        ya = [n for n in locales if bao.existe(n)]
        return bao, {"total": len(locales), "por_migrar": len(locales) - len(ya), "ya_estaban": len(ya)}

    def migrar(self):
        bao, plan = self.plan_migracion()
        migrados, ya, fallidos = 0, 0, []
        for n in self.local.nombres():
            try:
                f = self.local.ficha(n)
                meta = {"categoria": f.get("categoria", ""), "titular": f.get("unidad", ""),
                        "objeto": f.get("nota", ""), "origen": f.get("web", ""), "tipo": f.get("tipo", ""),
                        "usuario": self.local.usuario(n),
                        "documento": "Migrado desde la bóveda provisional el %s (Bogotá)" % ahora_texto()}
                bao.guardar_nuevo(n, self.local.obtener(n), meta)
                migrados += 1
            except YaExiste:
                ya += 1
            except Exception as e:  # sigue con los demás; nunca borra el origen
                fallidos.append(n)
                self.reg.auditar("migrar", n, "", "fallo", type(e).__name__)
        self.reg.auditar("migrar", "", "", "ok", "migrados=%d ya_estaban=%d fallidos=%d" % (migrados, ya, len(fallidos)))
        return {"ok": not fallidos, "migrados": migrados, "ya_estaban": ya, "fallidos": fallidos,
                "nota": "La bóveda provisional no se borra: su eliminación es un acto aparte (Transitoria III)."}


class Manejador(http.server.BaseHTTPRequestHandler):
    server_version = "TPAyudante/" + VERSION
    sys_version = ""
    ayudante = None  # se asigna al crear el servidor

    def log_message(self, *a):  # nunca escribir peticiones en consola
        pass

    def _responder(self, estado, obj):
        cuerpo = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(estado)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _permitido(self):
        a = self.ayudante
        puerto = a.conf["puerto"]
        host = (self.headers.get("Host") or "").lower()
        if host not in ("127.0.0.1:%d" % puerto, "localhost:%d" % puerto):
            self._responder(403, {"ok": False, "error": "host"})
            return False
        origen = (self.headers.get("Origin") or "").lower()
        if origen and not origen.startswith(("chrome-extension://", "moz-extension://", "safari-web-extension://")):
            self._responder(403, {"ok": False, "error": "origen"})
            return False
        return True

    def _autenticado(self):
        a = self.ayudante
        if time.time() < a.bloqueado_hasta:
            self._responder(429, {"ok": False, "error": "bloqueado"})
            return False
        dada = self.headers.get("X-TP-Clave") or ""
        if dada and hmac.compare_digest(dada.encode(), a.clave.encode()):
            return True
        t = time.time()
        a.fallos = [x for x in a.fallos if t - x < 60] + [t]
        if len(a.fallos) >= 5:
            a.bloqueado_hasta = t + 60
            a.fallos = []
        self._responder(401, {"ok": False, "error": "clave"})
        return False

    def _cuerpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_CUERPO:
            raise ValueError("petición demasiado grande")
        datos = self.rfile.read(n) if n else b"{}"
        obj = json.loads(datos.decode() or "{}")
        if not isinstance(obj, dict):
            raise ValueError("se esperaba un objeto")
        return obj

    def do_OPTIONS(self):  # sin CORS: el navegador bloquea a las páginas web
        self._responder(405, {"ok": False, "error": "metodo"})

    def do_GET(self):
        if not self._permitido():
            return
        a = self.ayudante
        u = urllib.parse.urlsplit(self.path)
        if u.path == "/salud":
            return self._responder(200, {"ok": True, "version": VERSION, "destino": a.boveda.nombre})
        if u.path == "/vincular":
            if self.headers.get("X-TP-Vincular") != "1" or time.time() > a.vincular_hasta:
                a.reg.auditar("vincular", resultado="rechazado")
                return self._responder(403, {"ok": False, "error": "vinculacion cerrada"})
            a.vincular_hasta = 0  # una sola vez
            a.reg.auditar("vincular")
            return self._responder(200, {"ok": True, "clave": a.clave})
        if not self._autenticado():
            return
        if u.path == "/nombres":
            q = urllib.parse.parse_qs(u.query).get("q", [""])[0]
            return self._responder(200, {"ok": True, "nombres": a.nombres(q)})
        self._responder(404, {"ok": False, "error": "ruta"})

    def do_POST(self):
        if not self._permitido() or not self._autenticado():
            return
        a = self.ayudante
        ruta = urllib.parse.urlsplit(self.path).path
        try:
            cuerpo = self._cuerpo()
            if ruta == "/guardar":
                return self._responder(200, a.guardar(cuerpo))
            if ruta == "/obtener":
                return self._responder(200, {"ok": True, "valor": a.obtener(cuerpo.get("nombre"), cuerpo.get("origen"))})
            if ruta == "/migrar/plan":
                _, plan = a.plan_migracion()
                return self._responder(200, dict(plan, ok=True))
            if ruta == "/migrar/ejecutar":
                if cuerpo.get("confirmar") is not True:
                    return self._responder(400, {"ok": False, "error": "falta confirmar"})
                return self._responder(200, a.migrar())
            return self._responder(404, {"ok": False, "error": "ruta"})
        except YaExiste as e:
            return self._responder(409, {"ok": False, "error": "ya existe", "nombre": str(e)})
        except NoExiste:
            return self._responder(404, {"ok": False, "error": "no existe"})
        except ValueError as e:
            return self._responder(400, {"ok": False, "error": str(e)})
        except Exception as e:
            a.reg.auditar("error", resultado="fallo", detalle=type(e).__name__)
            return self._responder(500, {"ok": False, "error": type(e).__name__})


def crear_servidor(ayudante):
    manejador = type("ManejadorTP", (Manejador,), {"ayudante": ayudante})
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", ayudante.conf["puerto"]), manejador)
    srv.daemon_threads = True
    return srv


def clave_del_ayudante(modulo_secreto, nombre):
    """La clave propia del ayudante. Se crea una vez y vive en la bóveda."""
    if not modulo_secreto.existe(nombre):
        modulo_secreto.guardar(nombre, secrets.token_urlsafe(32), categoria="APIs y tokens",
                               tipo="Token", nota="Clave del ayudante local de TP Capturador (127.0.0.1)")
    return modulo_secreto.obtener(nombre)


def construir(conf):
    mod = importar_secreto(conf.get("ruta_secreto"))
    local = BovedaLocal(mod)
    bao_disponible = bool((conf.get("openbao") or {}).get("direccion"))
    abrir_bao = (lambda: abrir_openbao(conf, mod)) if bao_disponible else None
    boveda = abrir_bao() if conf["destino"] == "openbao" else local
    reg = Registros(conf["carpeta_datos"])
    return Ayudante(conf, boveda, clave_del_ayudante(mod, conf["nombre_clave"]), reg, local, abrir_bao)


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description="Ayudante local de la Bóveda para TP Capturador")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("servir")
    s.add_argument("--vincular", action="store_true", help="abre %d s para vincular un navegador" % VENTANA_VINCULAR)
    sub.add_parser("estado")
    e = sub.add_parser("exportar-fichas")
    e.add_argument("--salida")
    e.add_argument("--todas", action="store_true", help="incluye las ya exportadas")
    m = sub.add_parser("migrar")
    g = m.add_mutually_exclusive_group(required=True)
    g.add_argument("--plan", action="store_true")
    g.add_argument("--ejecutar", action="store_true")
    a = p.parse_args(argv)

    conf = cargar_config()
    if a.cmd == "exportar-fichas":
        reg = Registros(conf["carpeta_datos"])
        salida = a.salida or os.path.join(conf["carpeta_datos"], "fichas-%s.csv" % ahora().strftime("%Y%m%d-%H%M"))
        n = reg.exportar(salida, a.todas)
        print("Fichas exportadas: %d%s" % (n, (" -> " + salida) if n else " (no había pendientes)"))
        return 0

    ay = construir(conf)
    if a.cmd == "estado":
        pendientes = [f for f in ay.reg.fichas() if not f.get("exportada")]
        print("Ayudante %s · destino: %s · puerto 127.0.0.1:%d" % (VERSION, ay.boveda.nombre, conf["puerto"]))
        print("Secretos en el destino: %d · fichas pendientes de exportar: %d" % (len(ay.boveda.nombres()), len(pendientes)))
        print("OpenBao configurado: %s" % ("sí" if ay.destino_migracion else "no"))
        return 0
    if a.cmd == "migrar":
        if a.plan:
            _, plan = ay.plan_migracion()
            print(json.dumps(plan, ensure_ascii=False))
        else:
            print(json.dumps(ay.migrar(), ensure_ascii=False))
        return 0
    if a.vincular:
        ay.abrir_vinculacion()
        print("Vinculación abierta %d s: en Chrome, menú de Tampermonkey › Vincular con el ayudante de la Bóveda." % VENTANA_VINCULAR)
    srv = crear_servidor(ay)
    print("Ayudante de la Bóveda escuchando en 127.0.0.1:%d (destino: %s). Ctrl+C para salir." % (conf["puerto"], ay.boveda.nombre))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
