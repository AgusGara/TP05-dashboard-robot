// Gráfico del ángulo de los motores que se marcan en la tabla.
// Se guarda historial de todos los motores (son pocos datos): así, al marcar uno
// nuevo, su curva aparece completa en vez de empezar vacía.
//
// Evento: "seleccion" con un Map nombre/color, para pintar las filas de la tabla.
class PanelAngulos extends Observable {
  #grafico;
  #historial = new Map();      // nombre del motor: SerieTemporal
  #seleccion = new Map();      // nombre del motor: número de color (1 a MAX_MOTORES_GRAFICO)

  constructor() {
    super();
    this.#grafico = crearGrafico($("chartAngulos"), {
      leyenda: true,
      escalas: { y: { title: { display: true, text: "ángulo (°)" } } },
    });
    $("btnLimpiarSeleccion").addEventListener("click", () => {
      this.#seleccion.clear();
      this.#sincronizar();
    });
    Tema.alCambiar(() => this.#sincronizar());
  }

  configurar(info) {
    this.#historial = new Map(info.motores.map((nombre) => [nombre, new SerieTemporal()]));
    this.#seleccion.clear();
    // Arranca con las articulaciones que más se mueven al caminar.
    const preferidos = info.motores.filter((n) => /thigh|calf|hip_pitch|knee/.test(n)).slice(0, 4);
    for (const nombre of preferidos.length ? preferidos : info.motores.slice(0, 3)) {
      this.#seleccion.set(nombre, this.#colorLibre());
    }
    this.#sincronizar();
  }

  // Devuelve false si ya se llegó al máximo de motores.
  alternar(nombre) {
    if (this.#seleccion.has(nombre)) {
      this.#seleccion.delete(nombre);
    } else if (this.#seleccion.size >= CONFIG.MAX_MOTORES_GRAFICO) {
      this.#sincronizar();           // para destildar el checkbox
      return false;
    } else {
      this.#seleccion.set(nombre, this.#colorLibre());
    }
    this.#sincronizar();
    return true;
  }

  agregar(t) {
    for (const m of t.motores) this.#historial.get(m.nombre)?.agregar(t.ts, m.angulo);
  }

  pintar() {
    this.#grafico?.update("none");
  }

  reiniciar() {
    for (const serie of this.#historial.values()) serie.limpiar();
    this.pintar();
  }

  #colorLibre() {
    const usados = new Set(this.#seleccion.values());
    for (let i = 1; i <= CONFIG.MAX_MOTORES_GRAFICO; i++) if (!usados.has(i)) return i;
    return 1;
  }

  #sincronizar() {
    const colores = new Map([...this.#seleccion].map(([nombre, i]) => [nombre, cssVar(`--serie-${i}`)]));
    if (this.#grafico) {
      this.#grafico.data.datasets = [...colores].map(([nombre, color]) => ({
        label: nombre,
        data: this.#historial.get(nombre)?.puntos ?? [],
        borderColor: color,
        backgroundColor: color,
        unidad: "°",
      }));
      this.#grafico.update("none");
    }
    const vacio = this.#seleccion.size === 0;
    $("vacioAngulos").hidden = !vacio;
    $("btnLimpiarSeleccion").disabled = vacio;
    setTexto($("subAngulos"), vacio
      ? "Ningún motor seleccionado"
      : `${this.#seleccion.size} de ${CONFIG.MAX_MOTORES_GRAFICO} motores, últimas ${CONFIG.HISTORIAL_MUESTRAS} muestras`);
    this.emitir("seleccion", colores);
  }
}
