// Panel de motores: tabla con semáforo de temperatura, ángulo, velocidad y torque.
// Las filas se arman una vez por robot y después solo se actualizan los textos;
// rearmar todo el HTML 10 veces por segundo con 29 motores (G1) no tiene sentido.

const TEXTO_NIVEL = { ok: "normal", warn: "elevada", hot: "crítica", "sin-dato": "sin dato" };

class PanelMotores {
  #tbody = $("tbodyMotores");
  #filas = new Map();          // nombre del motor: celdas de su fila
  #alAlternar;

  // alAlternar(nombre) se llama cuando el usuario marca o desmarca un motor.
  constructor(alAlternar) {
    this.#alAlternar = alAlternar;
    this.#tbody.addEventListener("change", (e) => {
      if (e.target.matches("input.sel")) this.#alAlternar(e.target.value);
    });
    // Se puede hacer click en cualquier parte de la fila, no solo en el checkbox.
    this.#tbody.addEventListener("click", (e) => {
      const fila = e.target.closest("tr.fila");
      if (!fila || e.target.closest("input") || String(getSelection())) return;
      fila.querySelector("input.sel").click();
    });
  }

  configurar(info) {
    this.#filas.clear();
    const fragmento = document.createDocumentFragment();
    let grupoActual = null;

    for (const nombre of info.motores) {
      const grupo = grupoMotor(nombre);
      if (grupo.id !== grupoActual) {
        grupoActual = grupo.id;
        fragmento.append(el("tr", { class: "tabla__grupo" },
          el("th", { colspan: "6", scope: "colgroup", text: grupo.nombre })));
      }
      fragmento.append(this.#crearFila(nombre));
    }
    this.#tbody.replaceChildren(fragmento);
    setTexto($("tituloMotores"), `Motores (${info.motores.length})`);
    setTexto($("subMotores"), "Tocá una fila para graficar el ángulo de ese motor");
  }

  #crearFila(nombre) {
    const check = el("input", { type: "checkbox", class: "sel", value: nombre, "aria-label": `Graficar ángulo de ${nombre}` });
    const tempValor = el("span", { class: "temp__valor", text: SIN_DATO });
    const tempNivel = el("span", { class: "sr-only" });
    const temp = el("span", { class: "temp" },
      el("i", { class: "nivel", "aria-hidden": "true" }), tempValor, el("span", { class: "unidad", text: "°C" }), tempNivel);
    const angulo = el("td", { class: "num", text: SIN_DATO });
    const velocidad = el("td", { class: "num", text: SIN_DATO });
    const torque = el("td", { class: "num torque", text: SIN_DATO });
    const fila = el("tr", { class: "fila", "data-nivel": "sin-dato" },
      el("td", { class: "col-sel" }, check),
      el("th", { scope: "row", class: "motor" },
        el("span", { class: "motor__codigo", text: nombre }),
        el("span", { class: "motor__desc", text: descripcionMotor(nombre) })),
      el("td", { class: "num" }, temp),
      angulo, velocidad, torque);

    this.#filas.set(nombre, { fila, check, temp, tempValor, tempNivel, angulo, velocidad, torque, nivel: null, torqueAlto: false });
    return fila;
  }

  pintar(t) {
    for (const m of t.motores) {
      const f = this.#filas.get(m.nombre);
      if (!f) continue;
      if (f.nivel !== m.nivel) {
        f.nivel = m.nivel;
        f.fila.dataset.nivel = m.nivel;
        f.temp.title = `Temperatura ${TEXTO_NIVEL[m.nivel]}`;
        f.tempNivel.textContent = `, ${TEXTO_NIVEL[m.nivel]}`;
      }
      setTexto(f.tempValor, formatear(m.temperatura, 1));
      setTexto(f.angulo, formatear(m.angulo, 1));
      setTexto(f.velocidad, formatear(m.velocidad, 2));
      setTexto(f.torque, formatear(m.torque, 2));
      const alto = m.torque !== null && Math.abs(m.torque) >= CONFIG.UMBRAL_TORQUE;
      if (f.torqueAlto !== alto) {
        f.torqueAlto = alto;
        f.torque.classList.toggle("torque--alto", alto);
        f.torque.title = alto ? `Supera ${CONFIG.UMBRAL_TORQUE} N·m` : "";
      }
    }
  }

  // colores: Map con los motores que están en el gráfico y el color de cada uno.
  marcarSeleccion(colores) {
    for (const [nombre, f] of this.#filas) {
      const color = colores.get(nombre);
      f.check.checked = Boolean(color);
      f.check.style.setProperty("--c", color ?? "transparent");
      f.fila.classList.toggle("fila--sel", Boolean(color));
    }
  }
}
