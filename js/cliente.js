// Facade: la app solo usa conectar(direccion) y desconectar() y escucha eventos.
// Todo lo de transporte queda acá adentro:
//   - WebSocket /ws como canal principal (el servidor manda ~10 lecturas por segundo).
//   - Si el WebSocket se cae, polling a /telemetria cada 500 ms mientras se reconecta.
//   - Reconexión automática, esperando cada vez más entre intentos.
//   - Consulta a /info para saber qué robot hay del otro lado.
//
// Eventos:
//   "info"        descripción del robot (ver adaptarInfo)
//   "telemetria"  una lectura ya adaptada (ver adaptarTelemetria)
//   "estado"      { fase, transporte, hz, edadMs, reintentoMs, repetidos, direccion, url }
//                 fase: conectando | en-vivo | sin-datos | esperando | sin-conexion | detenido
class ClienteTelemetria extends Observable {
  #base = null;              // { host, http, ws }
  #sesion = 0;               // cada conexión nueva invalida los callbacks de la anterior
  #info = null;

  #ws = null;
  #wsAbierto = false;
  #wsAbiertoEn = 0;
  #esperaWs = CONFIG.RECONEXION_MIN_MS;
  #timerWs = null;
  #proximoWs = 0;

  #pollingActivo = false;
  #timerPolling = null;
  #abortPolling = null;
  #errorPolling = null;

  #ultimoDato = 0;           // cuándo llegó la última lectura nueva
  #ultimoMensaje = 0;        // cuándo llegó cualquier respuesta, aunque repita la anterior
  #ultimoTs = null;
  #transporte = null;
  #marcas = [];              // horarios de llegada, para calcular los Hz reales
  #huboFallo = false;
  #vigilante = null;

  // Acepta lo que imprime INICIAR_TP05 ("http://10.0.0.5:8001") y variantes como
  // "10.0.0.5", "10.0.0.5:8001" o "ws://10.0.0.5:8001/ws".
  static normalizarDireccion(texto) {
    let valor = String(texto ?? "").trim();
    if (!valor) throw new Error("Ingresá la dirección del servidor");
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(valor)) valor = `http://${valor}`;
    let url;
    try {
      url = new URL(valor);
    } catch {
      throw new Error(`"${texto}" no es una dirección válida`);
    }
    if (!/^(https?|wss?):$/.test(url.protocol)) throw new Error("Usá una dirección http:// o ws://");
    const seguro = url.protocol === "https:" || url.protocol === "wss:";
    if (!url.port) url.port = String(CONFIG.PUERTO_POR_DEFECTO);
    return {
      host: url.host,
      http: `${seguro ? "https" : "http"}://${url.host}`,
      ws: `${seguro ? "wss" : "ws"}://${url.host}/ws`,
    };
  }

  get direccion() { return this.#base?.host ?? null; }
  get urlBase() { return this.#base?.http ?? null; }

  // Conecta, o reconecta si ya había una conexión. Lanza Error si la dirección es inválida.
  conectar(texto) {
    const base = ClienteTelemetria.normalizarDireccion(texto);
    this.desconectar({ silencioso: true });
    const sesion = ++this.#sesion;
    this.#base = base;
    this.#info = null;
    this.#ultimoDato = 0;
    this.#ultimoMensaje = 0;
    this.#ultimoTs = null;
    this.#huboFallo = false;
    this.#errorPolling = null;
    this.#esperaWs = CONFIG.RECONEXION_MIN_MS;

    this.#pedirInfo(sesion);
    this.#abrirWs(sesion);
    this.#vigilante = setInterval(() => this.#publicarEstado(), 500);
    this.#publicarEstado();
    return base.host;
  }

  desconectar({ silencioso = false } = {}) {
    this.#sesion++;
    clearTimeout(this.#timerWs);
    clearInterval(this.#vigilante);
    this.#detenerPolling();
    if (this.#ws) {
      const ws = this.#ws;
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try { ws.close(); } catch { /* ya estaba cerrado */ }
    }
    this.#ws = null;
    this.#wsAbierto = false;
    this.#marcas = [];
    if (!silencioso) {
      this.#base = null;
      this.emitir("estado", { fase: "detenido", transporte: null, hz: 0, direccion: null });
    }
  }

  /* ---------- /info ---------- */

  async #pedirInfo(sesion) {
    try {
      const json = await this.#getJson("/info");
      if (sesion !== this.#sesion) return;
      this.#info = adaptarInfo(json);
      this.emitir("info", this.#info);
    } catch {
      // No es grave: la descripción se arma con la primera lectura.
    }
  }

  /* ---------- WebSocket ---------- */

  #abrirWs(sesion) {
    let ws;
    try {
      ws = new WebSocket(this.#base.ws);
    } catch {
      this.#alCerrarWs(sesion);
      return;
    }
    this.#ws = ws;
    ws.onopen = () => {
      if (sesion !== this.#sesion) return;
      this.#wsAbierto = true;
      this.#wsAbiertoEn = Date.now();
      this.#esperaWs = CONFIG.RECONEXION_MIN_MS;
      this.#detenerPolling();
      this.#publicarEstado();
    };
    ws.onmessage = (evento) => {
      if (sesion !== this.#sesion) return;
      let json;
      try { json = JSON.parse(evento.data); } catch { return; }
      this.#recibir(json, "websocket");
    };
    ws.onerror = () => { /* después siempre llega onclose */ };
    ws.onclose = () => this.#alCerrarWs(sesion);
  }

  #alCerrarWs(sesion) {
    if (sesion !== this.#sesion) return;
    this.#ws = null;
    this.#wsAbierto = false;
    this.#huboFallo = true;
    this.#iniciarPolling(sesion);

    const espera = this.#esperaWs;
    this.#esperaWs = Math.min(espera * 2, CONFIG.RECONEXION_MAX_MS);
    this.#proximoWs = Date.now() + espera;
    clearTimeout(this.#timerWs);
    this.#timerWs = setTimeout(() => {
      if (sesion === this.#sesion) this.#abrirWs(sesion);
    }, espera);
    this.#publicarEstado();
  }

  /* ---------- Polling de respaldo ---------- */

  #iniciarPolling(sesion) {
    if (this.#pollingActivo) return;
    this.#pollingActivo = true;
    let espera = CONFIG.RECONEXION_MIN_MS;

    const ciclo = async () => {
      if (!this.#pollingActivo || sesion !== this.#sesion) return;
      const inicio = performance.now();
      let proximo;
      try {
        const json = await this.#getJson("/telemetria", true);
        if (!this.#pollingActivo || sesion !== this.#sesion) return;
        this.#errorPolling = null;
        espera = CONFIG.RECONEXION_MIN_MS;
        this.#recibir(json, "polling");
        // Se descuenta lo que tardó el pedido para que entre pedidos no pasen más de 500 ms.
        proximo = Math.max(0, CONFIG.POLLING_MS - (performance.now() - inicio));
      } catch (error) {
        if (!this.#pollingActivo || sesion !== this.#sesion) return;
        this.#errorPolling = error;
        this.#huboFallo = true;
        // Con el servidor caído no tiene sentido pedir cada 500 ms.
        proximo = espera;
        espera = Math.min(espera * 2, CONFIG.RECONEXION_MAX_MS);
        this.#publicarEstado();
      }
      this.#timerPolling = setTimeout(ciclo, proximo);
    };
    ciclo();
  }

  #detenerPolling() {
    this.#pollingActivo = false;
    clearTimeout(this.#timerPolling);
    this.#abortPolling?.abort();
    this.#abortPolling = null;
  }

  async #getJson(ruta, esPolling = false) {
    const control = new AbortController();
    if (esPolling) this.#abortPolling = control;
    const timer = setTimeout(() => control.abort(), CONFIG.TIMEOUT_HTTP_MS);
    try {
      const respuesta = await fetch(this.#base.http + ruta, { signal: control.signal, cache: "no-store" });
      const cuerpo = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        const error = new Error(cuerpo?.detail ?? `HTTP ${respuesta.status}`);
        error.status = respuesta.status;
        throw error;
      }
      return cuerpo;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- Datos y estado ---------- */

  #recibir(json, transporte) {
    let lectura;
    try {
      lectura = adaptarTelemetria(json);
    } catch (error) {
      console.warn(error.message, json);
      return;
    }
    const ahora = lectura.recibido;
    this.#ultimoMensaje = ahora;
    this.#transporte = transporte;

    // Si se cierra el simulador, el backend sigue mandando la última lectura con el
    // mismo ts. Esas repetidas se descartan y el estado pasa a "sin datos".
    if (this.#info && lectura.modelo === this.#info.modelo && lectura.ts === this.#ultimoTs) return;
    this.#ultimoTs = lectura.ts;

    const estabaVivo = this.#ultimoDato && ahora - this.#ultimoDato <= CONFIG.DATOS_VIEJOS_MS;
    this.#ultimoDato = ahora;
    this.#marcas.push(ahora);
    while (this.#marcas.length && this.#marcas[0] < ahora - 2000) this.#marcas.shift();

    if (!this.#info || this.#info.modelo !== lectura.modelo) {
      // Primera lectura, o el servidor se reinició con otro robot.
      this.#info = infoDesdeTelemetria(lectura);
      this.emitir("info", this.#info);
      this.#pedirInfo(this.#sesion);
    }
    this.emitir("telemetria", lectura);
    if (!estabaVivo) this.#publicarEstado();
  }

  #publicarEstado() {
    if (!this.#base) return;
    const ahora = Date.now();
    const edadMs = this.#ultimoDato ? ahora - this.#ultimoDato : Infinity;
    const respondiendo = ahora - this.#ultimoMensaje <= CONFIG.DATOS_VIEJOS_MS;
    const marcas = this.#marcas.filter((m) => m >= ahora - 2000);
    const hz = marcas.length >= 2 ? (marcas.length - 1) / ((marcas.at(-1) - marcas[0]) / 1000) : 0;

    let fase;
    if (edadMs <= CONFIG.DATOS_VIEJOS_MS) {
      fase = "en-vivo";
    } else if (this.#errorPolling?.status === 503) {
      fase = "esperando";            // el backend contesta pero todavía no tiene datos del robot
    } else if (this.#ultimoDato && (respondiendo || this.#wsAbierto)) {
      fase = "sin-datos";
    } else if (this.#wsAbierto) {
      // WebSocket abierto pero nunca llegó nada.
      fase = ahora - this.#wsAbiertoEn > CONFIG.DATOS_VIEJOS_MS ? "esperando" : "conectando";
    } else {
      fase = this.#huboFallo ? "sin-conexion" : "conectando";
    }

    this.emitir("estado", {
      fase,
      transporte: fase === "en-vivo" ? this.#transporte : null,
      hz,
      edadMs,
      reintentoMs: this.#wsAbierto ? 0 : Math.max(0, this.#proximoWs - ahora),
      repetidos: fase === "sin-datos" && respondiendo,
      direccion: this.#base.host,
      url: this.#base.http,
    });
  }
}
