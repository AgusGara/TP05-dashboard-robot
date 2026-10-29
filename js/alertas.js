// Barra de alerta que aparece debajo de los indicadores. Muestra una sola por vez,
// con esta prioridad: problemas de conexión, vista en pausa, datos fuera de rango.
class Alertas {
  #conexion = { fase: "detenido" };
  #hayDatos = false;
  #pausado = false;
  #deDatos = null;
  #accion = null;
  #alReintentar;
  #alReanudar;

  constructor({ alReintentar, alReanudar }) {
    this.#alReintentar = alReintentar;
    this.#alReanudar = alReanudar;
    $("alertaAccion").addEventListener("click", () => this.#accion?.());
  }

  actualizarConexion(estado, hayDatos) {
    this.#conexion = estado;
    this.#hayDatos = hayDatos;
    this.#pintar();
  }

  setPausa(pausado) {
    this.#pausado = pausado;
    this.#pintar();
  }

  // Se llama con cada lectura pintada: motores en rojo o batería baja.
  revisarDatos(t) {
    const criticos = t.motores.filter((m) => m.nivel === "hot");
    let nueva = null;
    if (criticos.length) {
      nueva = {
        tipo: "error",
        titulo: `${criticos.length === 1 ? "Motor" : `${criticos.length} motores`} sobre ${umbrales.get("TEMP_ROJO")} °C:`,
        detalle: criticos.map((m) => m.nombre).join(", "),
      };
    } else if (t.bms.soc !== null && t.bms.soc > 0 && t.bms.soc <= umbrales.get("SOC_BAJO")) {
      nueva = { tipo: "aviso", titulo: "Batería baja:", detalle: `${t.bms.soc} % de carga.` };
    }
    if (JSON.stringify(nueva) !== JSON.stringify(this.#deDatos)) {
      this.#deDatos = nueva;
      this.#pintar();
    }
  }

  #elegir() {
    const e = this.#conexion;
    const host = e.direccion;
    const reintentar = { texto: "Reintentar ahora", fn: () => this.#alReintentar(host) };
    const hace = Number.isFinite(e.edadMs) ? `${Math.round(e.edadMs / 1000)} s` : SIN_DATO;

    switch (e.fase) {
      case "sin-conexion":
        return this.#hayDatos
          ? {
              tipo: "error",
              titulo: `Se perdió la conexión con ${host}.`,
              detalle: `Los paneles muestran el último dato recibido (hace ${hace}). Se reconecta solo.`,
              accion: reintentar,
            }
          : {
              tipo: "error",
              titulo: `No se pudo conectar con ${host}.`,
              detalle: "Revisá que INICIAR_TP05 siga abierto y que la dirección sea la que muestra la consola.",
              enlace: { texto: "Probar /telemetria", href: `${e.url}/telemetria` },
              accion: reintentar,
            };
      case "esperando":
        return {
          tipo: "aviso",
          titulo: "El servidor contesta, pero todavía no tiene datos del robot.",
          detalle: "Fijate que la ventana del simulador siga abierta.",
          accion: reintentar,
        };
      case "sin-datos":
        return e.repetidos
          ? {
              tipo: "aviso",
              titulo: "El servidor repite siempre la misma lectura.",
              detalle: `Puede que se haya cerrado el simulador. Último dato nuevo hace ${hace}.`,
              accion: reintentar,
            }
          : {
              tipo: "aviso",
              titulo: "Conectado, pero no llegan datos.",
              detalle: `Último dato hace ${hace}.`,
              accion: { texto: "Reconectar", fn: () => this.#alReintentar(host) },
            };
    }
    if (this.#pausado) {
      return {
        tipo: "info",
        titulo: "Vista en pausa.",
        detalle: "Los datos se siguen recibiendo y, si está activa, la grabación sigue.",
        accion: { texto: "Reanudar", fn: this.#alReanudar },
      };
    }
    return e.fase === "en-vivo" ? this.#deDatos : null;
  }

  #pintar() {
    const alerta = this.#elegir();
    const caja = $("alerta");
    caja.hidden = !alerta;
    if (!alerta) return;
    caja.dataset.tipo = alerta.tipo;
    setTexto($("alertaTitulo"), alerta.titulo);
    setTexto($("alertaDetalle"), alerta.detalle);

    const enlace = $("alertaEnlace");
    enlace.hidden = !alerta.enlace;
    if (alerta.enlace) {
      enlace.href = alerta.enlace.href;
      setTexto(enlace, alerta.enlace.texto);
    }
    const boton = $("alertaAccion");
    boton.hidden = !alerta.accion;
    this.#accion = alerta.accion?.fn ?? null;
    if (alerta.accion) setTexto(boton, alerta.accion.texto);
  }
}
