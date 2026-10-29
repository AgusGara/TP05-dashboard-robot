// Panel BMS: carga, corriente, temperatura de la batería y voltaje de cada celda.
// El gráfico tiene dos vistas: carga y corriente juntas (cada una con su eje,
// porque una va de 0 a 100 y la otra en miles de mA), o el voltaje de cada celda.

const CELDA_V_MIN = 3.0;   // rango de una celda de litio, para el largo de las barras
const CELDA_V_MAX = 4.2;

// Ejes que se muestran en cada vista del gráfico.
const EJES_BMS = { carga: ["yPct", "yMa"], celdas: ["yV"] };

class PanelBms {
  #celdas = [];              // { nodo, valor, barra } por celda
  #grafico;
  #vista = "carga";
  #soc = new SerieTemporal();
  #corriente = new SerieTemporal();
  #historialCeldas = [];     // SerieTemporal por celda
  #botones = document.querySelectorAll("[data-vista-bms]");

  constructor() {
    this.#grafico = crearGrafico($("chartBms"), {
      leyenda: true,
      escalas: {
        yPct: { position: "left", min: 0, max: 100, title: { display: true, text: "carga (%)" } },
        yMa: { position: "right", grid: { display: false }, title: { display: true, text: "corriente (mA)" } },
        yV: { position: "left", display: false, title: { display: true, text: "celda (V)" } },
      },
    });
    // La leyenda muestra solo las series de la vista actual.
    if (this.#grafico) this.#grafico.options.plugins.legend.labels.filter = (item, data) => data.datasets[item.datasetIndex].vista === this.#vista;
    this.#armarDatasets();
    Tema.alCambiar(() => this.#colorear());
    this.#botones.forEach((boton) => boton.addEventListener("click", () => this.#mostrar(boton.dataset.vistaBms)));
  }

  configurar() {
    this.#construirCeldas(0);
    this.#historialCeldas = [];
    this.reiniciar();
    this.#armarDatasets();
  }

  agregar(t) {
    const { soc, corriente, celdas } = t.bms;
    this.#soc.agregar(t.ts, soc);
    this.#corriente.agregar(t.ts, corriente);
    if (celdas.length !== this.#historialCeldas.length) {
      this.#historialCeldas = celdas.map(() => new SerieTemporal());
      this.#armarDatasets();
    }
    celdas.forEach((v, i) => this.#historialCeldas[i].agregar(t.ts, v));
  }

  pintar(t) {
    const { soc, corriente, temperatura, celdas } = t.bms;
    const nivel = soc === null ? "sin-dato" : soc > umbrales.get("SOC_MEDIO") ? "ok" : soc > umbrales.get("SOC_BAJO") ? "warn" : "hot";

    setTexto($("bmsSoc"), formatear(soc, 0));
    const medidor = $("bmsMedidor");
    medidor.dataset.nivel = nivel;
    medidor.setAttribute("aria-valuenow", String(soc ?? 0));
    $("bmsRelleno").style.width = `${Math.max(0, Math.min(100, soc ?? 0))}%`;
    setTexto($("bmsCorriente"), formatear(corriente, 0));
    setTexto($("bmsTemp"), formatear(temperatura, 1));
    this.#grafico?.update("none");

    if (celdas.length !== this.#celdas.length) this.#construirCeldas(celdas.length);
    if (!celdas.length) {
      setTexto($("bmsResumenCeldas"), SIN_DATO);
      return;
    }
    const minimo = Math.min(...celdas);
    const maximo = Math.max(...celdas);
    celdas.forEach((v, i) => {
      const c = this.#celdas[i];
      setTexto(c.valor, v.toFixed(3));
      c.barra.style.width = `${Math.max(0, Math.min(100, ((v - CELDA_V_MIN) / (CELDA_V_MAX - CELDA_V_MIN)) * 100))}%`;
      c.nodo.dataset.extremo = maximo - minimo < 0.0005 ? "" : v === minimo ? "min" : v === maximo ? "max" : "";
    });
    // La diferencia entre la celda más cargada y la menos cargada muestra si el pack está balanceado.
    setTexto($("bmsResumenCeldas"), `${celdas.length} (Δ ${Math.round((maximo - minimo) * 1000)} mV)`);
  }

  reiniciar() {
    this.#soc.limpiar();
    this.#corriente.limpiar();
    this.#historialCeldas.forEach((s) => s.limpiar());
    this.#grafico?.update("none");
  }

  // Los datasets se rearman cuando cambia la cantidad de celdas (Go2 y G1 no tienen las mismas).
  #armarDatasets() {
    if (!this.#grafico) return;
    this.#grafico.data.datasets = [
      { label: "Carga", data: this.#soc.puntos, yAxisID: "yPct", unidad: " %", decimales: 0, vista: "carga", color: "--ok" },
      { label: "Corriente", data: this.#corriente.puntos, yAxisID: "yMa", unidad: " mA", decimales: 0, vista: "carga", color: "--serie-2" },
      ...this.#historialCeldas.map((serie, i) => ({
        label: `C${i + 1}`, data: serie.puntos, yAxisID: "yV", unidad: " V", decimales: 3, vista: "celdas",
        color: `--serie-${(i % CONFIG.MAX_MOTORES_GRAFICO) + 1}`,
      })),
    ];
    // Sin celdas no hay nada que mostrar en esa vista.
    const sinCeldas = !this.#historialCeldas.length;
    this.#botones.forEach((b) => { if (b.dataset.vistaBms === "celdas") b.disabled = sinCeldas; });
    this.#mostrar(sinCeldas ? "carga" : this.#vista);
  }

  #mostrar(vista) {
    this.#vista = vista;
    this.#botones.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vistaBms === vista)));
    if (!this.#grafico) return;
    for (const [v, ejes] of Object.entries(EJES_BMS)) {
      for (const eje of ejes) this.#grafico.options.scales[eje].display = v === vista;
    }
    // setDatasetVisibility también deshace lo que se haya ocultado con un click en la leyenda.
    this.#grafico.data.datasets.forEach((d, i) => this.#grafico.setDatasetVisibility(i, d.vista === vista));
    this.#colorear();
  }

  #colorear() {
    if (!this.#grafico) return;
    for (const d of this.#grafico.data.datasets) {
      const color = cssVar(d.color);
      Object.assign(d, { borderColor: color, backgroundColor: color });
    }
    this.#grafico.update("none");
  }

  #construirCeldas(cantidad) {
    const contenedor = $("bmsCeldas");
    this.#celdas = [];
    if (!cantidad) {
      contenedor.replaceChildren(el("p", { class: "vacio vacio--inline", text: "El robot no reporta voltajes de celda." }));
      return;
    }
    const nodos = Array.from({ length: cantidad }, (_, i) => {
      const valor = el("span", { class: "celda__v", text: SIN_DATO });
      const barra = el("i");
      const nodo = el("li", { class: "celda" },
        el("span", { class: "celda__n", text: `C${i + 1}` }), valor, el("span", { class: "celda__u", text: "V" }),
        el("span", { class: "celda__barra", "aria-hidden": "true" }, barra));
      this.#celdas.push({ nodo, valor, barra });
      return nodo;
    });
    contenedor.replaceChildren(el("ul", { class: "celdas", "aria-label": "Voltaje por celda" }, ...nodos));
  }
}
