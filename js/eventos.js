// Historial de eventos de la sesión: cambios del semáforo de los motores, de la
// batería, de la conexión, y lo que hace el usuario (capturas, grabación, CSV).
// Las alertas de arriba desaparecen cuando se resuelven; esto deja registro con la hora.
//
// Evento: "cambio" con la lista de eventos, el más nuevo primero.

const MAX_EVENTOS = 500;
// Para que un motor baje de nivel, la temperatura tiene que quedar estos grados por
// debajo del umbral. Sin esto, un motor que va y viene entre 39 y 40 °C llenaría la lista.
const HISTERESIS_C = 2;

const COLOR_NIVEL = { ok: "verde", warn: "amarillo", hot: "rojo" };

// Si el WebSocket se corta y vuelve seguido, los cambios de transporte dentro de esta
// ventana se juntan en un solo evento que se va actualizando.
const VENTANA_TRANSPORTE_MS = 10000;

class RegistroEventos extends Observable {
  #eventos = [];
  #nivelMotores = new Map();     // nombre del motor: último nivel registrado
  #nivelBateria = null;
  #conexion = { fase: null, transporte: null };
  #ts = null;                    // ts de la última lectura, para el CSV
  #cambioTransporte = null;      // { evento, cambios } del último cambio de transporte

  get lista() { return this.#eventos; }

  // nivel: info | ok | warn | hot (el color del punto en la lista).
  agregar(tipo, mensaje, nivel = "info") {
    this.#eventos.unshift({ fecha: new Date(), ts: this.#ts, tipo, nivel, mensaje });
    if (this.#eventos.length > MAX_EVENTOS) this.#eventos.length = MAX_EVENTOS;
    this.emitir("cambio", this.#eventos);
  }

  limpiar() {
    this.#eventos = [];
    this.emitir("cambio", this.#eventos);
  }

  robot(info) {
    this.#nivelMotores.clear();
    this.#nivelBateria = null;
    this.agregar("conexion", `Robot: ${info.nombre}${info.modo ? ` (modo ${info.modo})` : ""}, ${info.motores.length} motores`);
  }

  // Se llama con cada lectura.
  revisar(t) {
    this.#ts = t.ts;
    for (const m of t.motores) this.#revisarMotor(m);
    this.#revisarBateria(t.bms.soc);
  }

  // Se llama con cada cambio de estado del cliente; solo registra cuando cambia la fase.
  conexion(e) {
    const antes = this.#conexion;
    this.#conexion = { fase: e.fase, transporte: e.transporte };
    if (e.fase === antes.fase && (e.fase !== "en-vivo" || e.transporte === antes.transporte)) return;
    const via = e.transporte === "websocket" ? "WebSocket" : "polling";

    switch (e.fase) {
      case "en-vivo":
        if (antes.fase === "en-vivo") this.#transporteCambio(via, e.transporte);
        else if (["sin-conexion", "sin-datos", "esperando"].includes(antes.fase)) this.agregar("conexion", `Se recuperó la conexión (${via})`, "ok");
        else this.agregar("conexion", `Conectado a ${e.direccion} por ${via}`, "ok");
        break;
      case "sin-conexion":
        this.agregar("conexion", `Se perdió la conexión con ${e.direccion}`, "hot");
        break;
      case "sin-datos":
        this.agregar("conexion", "Dejaron de llegar datos del servidor", "warn");
        break;
      case "esperando":
        this.agregar("conexion", "El servidor contesta pero no tiene datos del robot", "warn");
        break;
      case "detenido":
        if (antes.fase) this.agregar("conexion", "Desconectado");
        break;
    }
  }

  #transporteCambio(via, transporte) {
    const previo = this.#cambioTransporte;
    if (previo && Date.now() - previo.evento.fecha <= VENTANA_TRANSPORTE_MS && this.#eventos.includes(previo.evento)) {
      previo.cambios++;
      Object.assign(previo.evento, {
        fecha: new Date(),
        nivel: "warn",
        mensaje: `El WebSocket se corta seguido: ${previo.cambios} cambios entre WebSocket y polling (ahora ${via})`,
      });
      // Se mueve arriba de todo, porque es lo último que pasó.
      this.#eventos.splice(this.#eventos.indexOf(previo.evento), 1);
      this.#eventos.unshift(previo.evento);
      this.emitir("cambio", this.#eventos);
      return;
    }
    this.agregar("conexion", `Se pasó a ${via}`, transporte === "websocket" ? "ok" : "warn");
    this.#cambioTransporte = { evento: this.#eventos[0], cambios: 1 };
  }

  aCsv(nombreFormato = CONFIG.CSV_FORMATO) {
    const formato = FORMATOS_CSV[nombreFormato] ?? FORMATOS_CSV.estandar;
    const campo = (valor) => campoCsv(valor, formato);
    const lineas = [["fecha_hora", "ts_s", "tipo", "nivel", "mensaje"].join(formato.separador)];
    // En el archivo van en orden cronológico, el más viejo primero.
    for (const e of [...this.#eventos].reverse()) {
      lineas.push([fechaLocalIso(e.fecha), e.ts, e.tipo, e.nivel, e.mensaje].map(campo).join(formato.separador));
    }
    return `﻿${lineas.join("\r\n")}\r\n`;
  }

  #revisarMotor(m) {
    const anterior = this.#nivelMotores.get(m.nombre) ?? null;
    const nuevo = this.#nivelConHisteresis(anterior, m);
    if (nuevo === anterior) return;
    this.#nivelMotores.set(m.nombre, nuevo);
    // Un motor normal al conectarse, o un dato que falta, no es noticia.
    if (nuevo === "sin-dato" || (nuevo === "ok" && (anterior === null || anterior === "sin-dato"))) return;

    const temp = `${formatear(m.temperatura, 1)} °C`;
    if (anterior === null || anterior === "sin-dato") {
      this.agregar("motor", `${m.nombre} está en ${COLOR_NIVEL[nuevo]} (${temp})`, nuevo);
    } else if (ORDEN_NIVEL[nuevo] > ORDEN_NIVEL[anterior]) {
      this.agregar("motor", `${m.nombre} pasó a ${COLOR_NIVEL[nuevo]} (${temp})`, nuevo);
    } else {
      this.agregar("motor", `${m.nombre} bajó a ${COLOR_NIVEL[nuevo]} (${temp})`, nuevo === "ok" ? "ok" : "warn");
    }
  }

  #nivelConHisteresis(anterior, m) {
    if (!anterior || m.nivel === "sin-dato" || ORDEN_NIVEL[m.nivel] >= ORDEN_NIVEL[anterior]) return m.nivel;
    const umbral = anterior === "hot" ? umbrales.get("TEMP_ROJO") : umbrales.get("TEMP_AMARILLO");
    return m.temperatura <= umbral - HISTERESIS_C ? m.nivel : anterior;
  }

  #revisarBateria(soc) {
    if (soc === null) return;
    const nivel = soc > umbrales.get("SOC_MEDIO") ? "ok" : soc > umbrales.get("SOC_BAJO") ? "warn" : "hot";
    const anterior = this.#nivelBateria;
    if (nivel === anterior) return;
    this.#nivelBateria = nivel;
    if (anterior === null && nivel === "ok") return;
    const texto = { ok: "volvió a normal", warn: `quedó en ${umbrales.get("SOC_MEDIO")} % o menos`, hot: "baja" }[nivel];
    this.agregar("bateria", `Batería ${texto}: ${soc} %`, nivel);
  }
}
