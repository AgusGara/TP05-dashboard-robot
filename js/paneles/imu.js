// Panel IMU: roll, pitch y yaw en números, horizonte artificial y gráfico histórico.
// Roll y pitch se mueven pocos grados y yaw va de -180 a 180. Si comparten eje,
// roll y pitch se ven como líneas planas, por eso yaw tiene su propio eje a la derecha.

const SERIES_IMU = [
  { clave: "roll", etiqueta: "Roll", eje: "y", decimales: 2 },
  { clave: "pitch", etiqueta: "Pitch", eje: "y", decimales: 2 },
  { clave: "yaw", etiqueta: "Yaw", eje: "yYaw", decimales: 1 },
];
const PX_POR_GRADO_PITCH = 2;

class PanelImu {
  #grafico;
  #series = SERIES_IMU.map(() => new SerieTemporal());
  #valores = SERIES_IMU.map((s) => $(`imu-${s.clave}`));
  #horizonte = $("horizonte");
  #rumbo = $("rumbo");
  #etiquetasRumbo = [];        // se giran al revés que el anillo para que se lean derechas

  constructor() {
    this.#crearEscalaRumbo();
    this.#grafico = crearGrafico($("chartImu"), {
      datasets: SERIES_IMU.map((s, i) => ({
        label: s.etiqueta,
        data: this.#series[i].puntos,
        yAxisID: s.eje,
        unidad: "°",
        // Cuando yaw pasa de 180 a -180 hay un salto; ese tramo no se dibuja.
        segment: s.clave === "yaw"
          ? { borderColor: (ctx) => (Math.abs(ctx.p1.parsed.y - ctx.p0.parsed.y) > 180 ? "transparent" : undefined) }
          : undefined,
      })),
      escalas: {
        y: { position: "left", suggestedMin: -3, suggestedMax: 3, title: { display: true, text: "roll / pitch (°)" } },
        yYaw: {
          position: "right", min: -180, max: 180,
          ticks: { stepSize: 90 }, grid: { display: false },
          title: { display: true, text: "yaw (°)" },
        },
      },
    });
    this.#colorear();
    Tema.alCambiar(() => this.#colorear());

    // Las lecturas sirven de leyenda: con un click se muestra u oculta la serie.
    document.querySelectorAll("[data-serie-imu]").forEach((boton) => {
      boton.addEventListener("click", () => {
        if (!this.#grafico) return;
        const i = Number(boton.dataset.serieImu);
        const visible = !this.#grafico.isDatasetVisible(i);
        this.#grafico.setDatasetVisibility(i, visible);
        boton.setAttribute("aria-pressed", String(visible));
        this.#grafico.update("none");
      });
    });
  }

  configurar() {
    this.reiniciar();
  }

  agregar(t) {
    SERIES_IMU.forEach((s, i) => this.#series[i].agregar(t.ts, t.imu[s.clave]));
  }

  pintar(t) {
    const { roll, pitch, yaw, ax, ay, az } = t.imu;
    SERIES_IMU.forEach((s, i) => setTexto(this.#valores[i], formatear(t.imu[s.clave], s.decimales)));

    // Pitch positivo es nariz abajo, así que el horizonte sube.
    const desplazamiento = Math.max(-40, Math.min(40, -(pitch ?? 0) * PX_POR_GRADO_PITCH));
    this.#horizonte.setAttribute("transform", `rotate(${-(roll ?? 0)}) translate(0 ${desplazamiento})`);
    this.#rumbo.setAttribute("transform", `rotate(${yaw ?? 0})`);
    for (const { nodo, x, y } of this.#etiquetasRumbo) nodo.setAttribute("transform", `rotate(${-(yaw ?? 0)} ${x} ${y})`);

    setTexto($("imuAcc"), `Aceleración: ax ${formatear(ax, 2)}, ay ${formatear(ay, 2)}, az ${formatear(az, 2)} m/s²`);
    const puntos = this.#series[0].puntos;
    const ventana = puntos.length > 1 ? puntos.at(-1).x - puntos[0].x : 0;
    setTexto($("subImu"), `Historial: ${puntos.length} muestras (${Math.round(ventana)} s)`);
    this.#grafico?.update("none");
  }

  reiniciar() {
    this.#series.forEach((s) => s.limpiar());
    this.#grafico?.update("none");
  }

  #colorear() {
    if (!this.#grafico) return;
    SERIES_IMU.forEach((s, i) => {
      const color = cssVar(`--serie-${s.clave}`);
      Object.assign(this.#grafico.data.datasets[i], { borderColor: color, backgroundColor: color });
    });
    this.#grafico.update("none");
  }

  // Anillo de yaw: marcas cada 30° y números en 0, 90, 180 y -90.
  #crearEscalaRumbo() {
    for (let grados = -150; grados <= 180; grados += 30) {
      const rad = (-grados * Math.PI) / 180;   // yaw positivo es giro a la izquierda
      const [sx, cy] = [Math.sin(rad), -Math.cos(rad)];
      const principal = grados % 90 === 0;
      this.#rumbo.append(svgEl("line", {
        class: principal ? "rumbo__marca rumbo__marca--principal" : "rumbo__marca",
        x1: sx * 46, y1: cy * 46, x2: sx * (principal ? 51 : 49), y2: cy * (principal ? 51 : 49),
      }));
      if (principal) {
        const [x, y] = [sx * 57, cy * 57];
        const nodo = svgEl("text", { class: "rumbo__texto", x, y, text: String(grados) });
        this.#rumbo.append(nodo);
        this.#etiquetasRumbo.push({ nodo, x, y });
      }
    }
  }
}
