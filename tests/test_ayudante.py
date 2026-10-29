# -*- coding: utf-8 -*-
"""Pruebas del ayudante local de la Bóveda. Solo secretos inventados en tiempo de ejecución.

    python3 -m unittest tests/test_ayudante.py
"""
import http.client
import http.server
import json
import os
import secrets
import sys
import tempfile
import threading
import time
import types
import unittest
import urllib.parse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ayudante"))
import ayudante_boveda as ab  # noqa: E402


def secreto_inventado():
    # Se arma en tiempo de ejecución: el repositorio nunca contiene un valor con forma de clave.
    return "PRUEBA-" + secrets.token_urlsafe(24)


class SecretoFalso(types.SimpleNamespace):
    """Imita la interfaz pública de secreto.py sin DPAPI."""

    def __init__(self):
        super().__init__(datos={})

    def _n(self, n):
        return n.strip().lower().replace(" ", "_")

    def nombres(self):
        return sorted(self.datos)

    def existe(self, n):
        return self._n(n) in self.datos

    def obtener(self, n, obligatorio=True):
        return self.datos[self._n(n)]["valor"]

    def usuario(self, n, obligatorio=False):
        return self.datos.get(self._n(n), {}).get("usuario", "")

    def ficha(self, n):
        d = self.datos.get(self._n(n))
        if d is None:
            return None
        f = {k: d.get(k, "") for k in ("categoria", "unidad", "web", "tipo", "nota", "documento")}
        f["nombre"] = self._n(n)
        return f

    def guardar(self, nombre, valor, usuario="", categoria="", unidad="", web="", tipo="", nota="", documento=""):
        self.datos[self._n(nombre)] = dict(valor=valor, usuario=usuario, categoria=categoria, unidad=unidad,
                                          web=web, tipo=tipo, nota=nota, documento=documento)


class OpenBaoFalso(http.server.BaseHTTPRequestHandler):
    """Servidor KV v2 mínimo: LIST/GET metadata, GET/POST data con options.cas = 0."""
    almacen = {}
    token = "token-de-prueba"

    def log_message(self, *a):
        pass

    def _resp(self, st, obj):
        b = json.dumps(obj).encode()
        self.send_response(st)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _clave(self):
        p = urllib.parse.unquote(self.path)
        for pref in ("/v1/secret/data/tp/", "/v1/secret/metadata/tp/"):
            if p.startswith(pref):
                return p[len(pref):]
        return None

    def _auth(self):
        if self.headers.get("X-Vault-Token") != self.token:
            self._resp(403, {"errors": ["permission denied"]})
            return False
        return True

    def do_LIST(self):
        if not self._auth():
            return
        if not self.almacen:
            return self._resp(404, {"errors": []})
        self._resp(200, {"data": {"keys": sorted(self.almacen)}})

    def do_GET(self):
        if not self._auth():
            return
        k = self._clave()
        if k not in self.almacen:
            return self._resp(404, {"errors": []})
        if "/metadata/" in self.path:
            return self._resp(200, {"data": {"current_version": 1}})
        self._resp(200, {"data": {"data": self.almacen[k], "metadata": {"version": 1}}})

    def do_POST(self):
        if not self._auth():
            return
        k = self._clave()
        cuerpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if cuerpo.get("options", {}).get("cas") == 0 and k in self.almacen:
            return self._resp(400, {"errors": ["check-and-set parameter did not match the current version"]})
        self.almacen[k] = cuerpo["data"]
        self._resp(200, {"data": {"version": 1}})


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.mod = SecretoFalso()
        self.puerto = 0  # el sistema elige uno libre
        self.conf = {"puerto": self.puerto, "destino": "local", "carpeta_datos": self.tmp, "openbao": {}}
        self.clave = ab.clave_del_ayudante(self.mod, ab.NOMBRE_CLAVE_DEF)
        self.reg = ab.Registros(self.tmp)
        self.local = ab.BovedaLocal(self.mod)
        self.ay = ab.Ayudante(self.conf, self.local, self.clave, self.reg, self.local, None)
        self.srv = ab.crear_servidor(self.ay)
        self.puerto = self.conf["puerto"] = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()

    def pedir(self, metodo, ruta, cuerpo=None, clave=True, cabeceras=None, host=None):
        c = http.client.HTTPConnection("127.0.0.1", self.puerto, timeout=5)
        h = {"Host": host or "127.0.0.1:%d" % self.puerto}
        if clave is True:
            h["X-TP-Clave"] = self.clave
        elif clave:
            h["X-TP-Clave"] = clave
        h.update(cabeceras or {})
        datos = None
        if cuerpo is not None:
            datos = json.dumps(cuerpo).encode()
            h["Content-Type"] = "application/json"
        c.request(metodo, ruta, body=datos, headers=h)
        r = c.getresponse()
        texto = r.read().decode()
        cab = dict(r.getheaders())
        c.close()
        return r.status, (json.loads(texto) if texto else {}), cab

    def captura(self, valor, **extra):
        cuerpo = {"servicio": "Open AI", "entorno": "Producción", "tipo": "API key", "valor": valor,
                  "objeto": "Respuestas del bot de Albania", "titular": "Steeve Riaño",
                  "origen": "https://platform.example.com/api-keys?token=NO-DEBE-GUARDARSE#x"}
        cuerpo.update(extra)
        return self.pedir("POST", "/guardar", cuerpo)

    def todo_lo_escrito(self):
        texto = ""
        for raiz, _, archivos in os.walk(self.tmp):
            for a in archivos:
                with open(os.path.join(raiz, a), encoding="utf-8-sig") as f:
                    texto += f.read()
        return texto


class Seguridad(Base):
    def test_salud_sin_clave(self):
        st, j, _ = self.pedir("GET", "/salud", clave=False)
        self.assertEqual((st, j["ok"]), (200, True))

    def test_sin_clave_o_clave_falsa_rechaza(self):
        self.assertEqual(self.pedir("GET", "/nombres", clave=False)[0], 401)
        self.assertEqual(self.pedir("GET", "/nombres", clave="otra")[0], 401)

    def test_bloqueo_tras_cinco_fallos(self):
        for _ in range(5):
            self.pedir("GET", "/nombres", clave="otra")
        self.assertEqual(self.pedir("GET", "/nombres")[0], 429, "con la clave buena también espera")

    def test_pagina_web_rechazada_aunque_tenga_clave(self):
        st, _, _ = self.pedir("POST", "/obtener", {"nombre": ab.NOMBRE_CLAVE_DEF},
                              cabeceras={"Origin": "https://sitio-malicioso.example"})
        self.assertEqual(st, 403)

    def test_extension_del_navegador_permitida(self):
        st, _, _ = self.pedir("GET", "/nombres", cabeceras={"Origin": "chrome-extension://abcdef"})
        self.assertEqual(st, 200)

    def test_host_ajeno_rechazado(self):
        self.assertEqual(self.pedir("GET", "/nombres", host="evil.example:%d" % self.puerto)[0], 403)

    def test_options_sin_cors(self):
        st, _, cab = self.pedir("OPTIONS", "/guardar", clave=False,
                                cabeceras={"Origin": "chrome-extension://x", "Access-Control-Request-Method": "POST"})
        self.assertEqual(st, 405)
        self.assertNotIn("Access-Control-Allow-Origin", cab)

    def test_vincular_cerrado_por_defecto(self):
        self.assertEqual(self.pedir("GET", "/vincular", clave=False, cabeceras={"X-TP-Vincular": "1"})[0], 403)

    def test_vincular_una_sola_vez_y_con_cabecera(self):
        self.ay.abrir_vinculacion(30)
        self.assertEqual(self.pedir("GET", "/vincular", clave=False)[0], 403, "sin la cabecera no entrega nada")
        st, j, _ = self.pedir("GET", "/vincular", clave=False, cabeceras={"X-TP-Vincular": "1"})
        self.assertEqual((st, j["clave"]), (200, self.clave))
        self.assertEqual(self.pedir("GET", "/vincular", clave=False, cabeceras={"X-TP-Vincular": "1"})[0], 403)

    def test_vinculacion_vence(self):
        self.ay.abrir_vinculacion(0.2)
        time.sleep(0.4)
        self.assertEqual(self.pedir("GET", "/vincular", clave=False, cabeceras={"X-TP-Vincular": "1"})[0], 403)


class Captura(Base):
    def test_guarda_con_nombre_normalizado(self):
        v = secreto_inventado()
        st, j, _ = self.captura(v)
        self.assertEqual(st, 200)
        self.assertEqual(j["nombre"], "open_ai_produccion_api_key")
        self.assertEqual(self.mod.obtener("open_ai_produccion_api_key"), v)
        self.assertNotIn(v, json.dumps(j), "la respuesta no devuelve el valor")
        f = self.mod.ficha("open_ai_produccion_api_key")
        self.assertEqual((f["unidad"], f["nota"]), ("Steeve Riaño", "Respuestas del bot de Albania"))
        self.assertEqual(f["web"], "https://platform.example.com/api-keys", "sin parámetros ni fragmento")

    def test_no_sobrescribe(self):
        v1, v2 = secreto_inventado(), secreto_inventado()
        self.captura(v1)
        st, j, _ = self.captura(v2)
        self.assertEqual((st, j["error"]), (409, "ya existe"))
        self.assertEqual(self.mod.obtener("open_ai_produccion_api_key"), v1)

    def test_faltan_datos(self):
        self.assertEqual(self.captura(secreto_inventado(), titular="")[0], 400)
        self.assertEqual(self.captura(secreto_inventado(), servicio="  ")[0], 400)
        self.assertEqual(self.captura("")[0], 400)

    def test_ficha_en_cola_sin_valor(self):
        v = secreto_inventado()
        self.captura(v)
        fichas = self.reg.fichas()
        self.assertEqual(len(fichas), 1)
        f = fichas[0]
        self.assertEqual((f["referencia"], f["tipo_objeto"], f["rotacion_dias"]),
                         ("open_ai_produccion_api_key", "Referencia de secreto", 90))
        self.assertEqual(f["origen"], "https://platform.example.com/api-keys")
        self.assertNotIn(v, self.todo_lo_escrito(), "ningún archivo local contiene el valor")

    def test_obtener_y_listar(self):
        v = secreto_inventado()
        self.captura(v)
        st, j, _ = self.pedir("GET", "/nombres?q=open")
        self.assertEqual(j["nombres"], ["open_ai_produccion_api_key"])
        st, j, _ = self.pedir("POST", "/obtener", {"nombre": "open_ai_produccion_api_key", "origen": "https://x.example/login?a=1"})
        self.assertEqual((st, j["valor"]), (200, v))
        self.assertEqual(self.pedir("POST", "/obtener", {"nombre": "no_existe"})[0], 404)
        self.assertNotIn(v, self.todo_lo_escrito(), "la auditoría tampoco guarda el valor")

    def test_exportar_fichas(self):
        self.captura(secreto_inventado())
        self.captura(secreto_inventado(), servicio="Tailscale", tipo="token")
        salida = os.path.join(self.tmp, "fichas.csv")
        self.assertEqual(self.reg.exportar(salida), 2)
        texto = open(salida, encoding="utf-8-sig").read()
        self.assertIn("Referencia,Tipo de objeto,Objeto,Titular,Página de origen", texto)
        self.assertIn("tailscale_produccion_token,Referencia de secreto", texto)
        self.assertEqual(self.reg.exportar(os.path.join(self.tmp, "otra.csv")), 0, "no repite las ya exportadas")
        with self.assertRaises(FileExistsError):
            self.reg.exportar(salida, todas=True)


class Migracion(Base):
    def setUp(self):
        super().setUp()
        OpenBaoFalso.almacen = {}
        self.bao_srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), OpenBaoFalso)
        threading.Thread(target=self.bao_srv.serve_forever, daemon=True).start()
        dir_bao = "http://127.0.0.1:%d" % self.bao_srv.server_address[1]
        self.ay.destino_migracion = lambda: ab.BovedaOpenBao(dir_bao, OpenBaoFalso.token)

    def tearDown(self):
        self.bao_srv.shutdown()
        self.bao_srv.server_close()
        super().tearDown()

    def test_plan_y_migracion_solo_crea(self):
        v = secreto_inventado()
        self.captura(v)
        OpenBaoFalso.almacen[ab.NOMBRE_CLAVE_DEF] = {"valor": "ya-estaba"}
        st, plan, _ = self.pedir("POST", "/migrar/plan", {})
        self.assertEqual((plan["total"], plan["por_migrar"], plan["ya_estaban"]), (2, 1, 1))
        self.assertEqual(self.pedir("POST", "/migrar/ejecutar", {})[0], 400, "exige confirmar")
        st, r, _ = self.pedir("POST", "/migrar/ejecutar", {"confirmar": True})
        self.assertEqual((r["migrados"], r["ya_estaban"], r["fallidos"]), (1, 1, []))
        self.assertEqual(OpenBaoFalso.almacen["open_ai_produccion_api_key"]["valor"], v)
        self.assertEqual(OpenBaoFalso.almacen[ab.NOMBRE_CLAVE_DEF]["valor"], "ya-estaba", "no sobrescribe en OpenBao")
        self.assertTrue(self.mod.existe("open_ai_produccion_api_key"), "la bóveda provisional no se borra")
        self.assertNotIn(v, self.todo_lo_escrito())

    def test_sin_openbao_configurado(self):
        self.ay.destino_migracion = None
        st, j, _ = self.pedir("POST", "/migrar/plan", {})
        self.assertEqual(st, 400)
        self.assertIn("OpenBao no está configurado", j["error"])

    def test_destino_openbao_para_capturas(self):
        self.ay.boveda = self.ay.destino_migracion()
        v = secreto_inventado()
        st, j, _ = self.captura(v)
        self.assertEqual((st, j["destino"]), (200, "openbao"))
        self.assertEqual(OpenBaoFalso.almacen["open_ai_produccion_api_key"]["valor"], v)
        self.assertEqual(self.captura(secreto_inventado())[0], 409, "OpenBao tampoco sobrescribe")
        st, j, _ = self.pedir("POST", "/obtener", {"nombre": "open_ai_produccion_api_key"})
        self.assertEqual(j["valor"], v)

    def test_openbao_exige_https_fuera_de_127(self):
        with self.assertRaises(ValueError):
            ab.BovedaOpenBao("http://bao.example.com:8200", "t")
        ab.BovedaOpenBao("https://bao.example.com:8200", "t")


class Nombres(unittest.TestCase):
    def test_normalizar(self):
        self.assertEqual(ab.normalizar("Cloudflare R2", "Prod", "Token API"), "cloudflare_r2_prod_token_api")
        self.assertEqual(ab.normalizar("  Señal!! ", "dev", "contraseña"), "senal_dev_contrasena")
        with self.assertRaises(ValueError):
            ab.normalizar("x", "", "token")


if __name__ == "__main__":
    unittest.main()
