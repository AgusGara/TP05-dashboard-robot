// Detalle de un motor: ventana con sus valores actuales y la temperatura, el torque
// y la velocidad en el tiempo. Se abre tocando el nombre en la tabla o el motor en
// el mapa. Se guarda historial de todos los motores, así al abrir uno ya tiene sus
// gráficos completos.

const SERIES_DETALLE = ["temperatura", "torque", "velocidad"];

class DetalleMotor {
  #dialogo = $("dialogoMotor");
  #motores = [];
  #historial = new Map();      // nombre del motor: { temperatura, torque, velocidad } con SerieTemporal
  #actual = null;
  #ultima = null;              // última lectura, para no abrir la ventana vacía
  #graficos = {};
  #lineaAmarillo = [];         // las líneas de los umbrales en el gráfico de temperatura
  #lineaRojo = [];

  constructor() {
    const escala = (texto) => ({ y: { title: { display: true, text: texto } } });
    this.#graficos = {
      temperatura: crearGrafico($("chartDetalleTemp"), { escalas: escala("°C"), leyenda: true }),
      torque: crearGrafico($("chartDetalleTorque"), { escalas: escala("N·m") }),
      velocidad: crearGrafico($("chartDetalleVel"), { escalas: escala("rad/s") }),
    };
    $("btnMotorAnterior").addEventListener("click", () => this.#mover(-1));
    $("btnMotorSiguiente").addEventListener("click", () => this.#mover(1));
    $("btnCerrarDetalle").addEventListener("click", () => this.#dialogo.close());
    // Un click en el fondo oscuro también cierra.
    this.#dialogo.addEventListener("click", (e) => { if (e.target === this.#dialogo) this.#dialogo.close(); });
    Tema.alCambiar(() => this.#armarDatasets());
  }

  configurar(info) {
    this.#motores = info.motores;
    this.#historial = new Map(info.motores.map((nombre) => [nombre, {
      temperatura: new SerieTemporal(), torque: new SerieTemporal(), velocidad: new SerieTemporal(),
    }]));
    if (this.#dialogo.open && !this.#historial.has(this.#actual)) this.#dialogo.close();
    else if (this.#actual) this.#armarDatasets();
  }

  agregar(t) {
    this.#ultima = t;
    for (const m of t.motores) {
      const h = this.#historial.get(m.nombre);
      if (h) for (const clave of SERIES_DETALLE) h[clave].agregar(t.ts, m[clave]);
    }
  }

  abrir(nombre) {
    if (!this.#historial.has(nombre)) return;
    this.#actual = nombre;
    this.#armarDatasets();
    if (!this.#dialogo.open) this.#dialogo.showModal();
    if (this.#ultima) this.pintar(this.#ultima);
  }

  pintar(t) {
    if (!this.#dialogo.open) return;
    const m = t.motores.find((x) => x.nombre === this.#actual);
    if (!m) return;
    const h = this.#historial.get(m.nombre);

    $("detalleTempDato").dataset.nivel = m.nivel;
    setTexto($("detalleTemp"), formatear(m.temperatura, 1));
    setTexto($("detalleAngulo"), formatear(m.angulo, 1));
    setTexto($("detalleVel"), formatear(m.velocidad, 2));
    setTexto($("detalleTorque"), formatear(m.torque, 2));

    // Las líneas de los umbrales van de punta a punta del historial.
    const puntos = h.temperatura.puntos;
    const desde = puntos[0]?.x ?? t.ts;
    const hasta = puntos.at(-1)?.x ?? t.ts;
    this.#lineaAmarillo.splice(0, Infinity, { x: desde, y: umbrales.get("TEMP_AMARILLO") }, { x: hasta, y: umbrales.get("TEMP_AMARILLO") });
    this.#lineaRojo.splice(0, Infinity, { x: desde, y: umbrales.get("TEMP_ROJO") }, { x: hasta, y: umbrales.get("TEMP_ROJO") });

    const maximo = (serie, abs = false) => serie.puntos.reduce((max, p) => {
      if (p.y === null) return max;
      const v = abs ? Math.abs(p.y) : p.y;
      return max === null || v > max ? v : max;
    }, null);
    const segundos = puntos.length > 1 ? Math.round(hasta - desde) : 0;
    setTexto($("detalleResumen"),
      `En las últimas ${puntos.length} muestras (${segundos} s): temperatura máxima ${formatear(maximo(h.temperatura), 1)} °C, ` +
      `torque pico ${formatear(maximo(h.torque, true), 2)} N·m, velocidad máxima ${formatear(maximo(h.velocidad, true), 2)} rad/s.`);

    for (const grafico of Object.values(this.#graficos)) grafico?.update("none");
  }

  reiniciar() {
    this.#ultima = null;
    for (const h of this.#historial.values()) for (const clave of SERIES_DETALLE) h[clave].limpiar();
  }

  #mover(paso) {
    const i = this.#motores.indexOf(this.#actual);
    const siguiente = this.#motores[(i + paso + this.#motores.length) % this.#motores.length];
    this.abrir(siguiente);
  }

  #armarDatasets() {
    const nombre = this.#actual;
    const h = this.#historial.get(nombre);
    if (!h) return;
    const grupo = grupoMotor(nombre);
    setTexto($("tituloDetalle"), nombre);
    setTexto($("subDetalle"), `${descripcionMotor(nombre)}, ${grupo.nombre[0].toLowerCase()}${grupo.nombre.slice(1)} · motor ${this.#motores.indexOf(nombre) + 1} de ${this.#motores.length}`);

    const serie = (label, data, color, unidad) => ({ label, data, borderColor: color, backgroundColor: color, unidad });
    const umbral = (label, data, color) => ({ ...serie(label, data, color, " °C"), borderDash: [5, 4], borderWidth: 1.25 });
    const { temperatura, torque, velocidad } = this.#graficos;
    if (temperatura) {
      temperatura.data.datasets = [
        serie("Temperatura", h.temperatura.puntos, cssVar("--accent"), " °C"),
        umbral("Amarillo", this.#lineaAmarillo, cssVar("--warn")),
        umbral("Rojo", this.#lineaRojo, cssVar("--hot")),
      ];
    }
    if (torque) torque.data.datasets = [serie("Torque", h.torque.puntos, cssVar("--serie-1"), " N·m")];
    if (velocidad) velocidad.data.datasets = [serie("Velocidad", h.velocidad.puntos, cssVar("--serie-3"), " rad/s")];
    for (const grafico of Object.values(this.#graficos)) grafico?.update("none");
  }
}
