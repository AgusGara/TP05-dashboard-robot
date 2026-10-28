// Panel BMS: carga, corriente, temperatura de la batería y voltaje de cada celda.

const CELDA_V_MIN = 3.0;   // rango de una celda de litio, para el largo de las barras
const CELDA_V_MAX = 4.2;

class PanelBms {
  #celdas = [];              // { nodo, valor, barra } por celda

  configurar() {
    this.#construirCeldas(0);
  }

  pintar(t) {
    const { soc, corriente, temperatura, celdas } = t.bms;
    const nivel = soc === null ? "sin-dato" : soc > CONFIG.SOC_MEDIO ? "ok" : soc > CONFIG.SOC_BAJO ? "warn" : "hot";

    setTexto($("bmsSoc"), formatear(soc, 0));
    const medidor = $("bmsMedidor");
    medidor.dataset.nivel = nivel;
    medidor.setAttribute("aria-valuenow", String(soc ?? 0));
    $("bmsRelleno").style.width = `${Math.max(0, Math.min(100, soc ?? 0))}%`;
    setTexto($("bmsCorriente"), formatear(corriente, 0));
    setTexto($("bmsTemp"), formatear(temperatura, 1));

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
