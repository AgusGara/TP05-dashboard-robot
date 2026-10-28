// Configuración común de los gráficos de línea (Chart.js).

const HAY_CHART = typeof Chart !== "undefined";

function aplicarTemaGraficos() {
  if (!HAY_CHART) return;
  Chart.defaults.color = cssVar("--muted");
  Chart.defaults.borderColor = cssVar("--grid");
  Chart.defaults.font.family = cssVar("--font");
  Chart.defaults.font.size = 11;
  for (const grafico of Object.values(Chart.instances)) grafico.update("none");
}

// El eje X es el ts de la telemetría, en segundos. Los datos son arrays de {x, y}
// que se modifican en el lugar (ver SerieTemporal), así Chart.js no copia nada.
function crearGrafico(canvas, { datasets = [], escalas = {}, leyenda = false }) {
  if (!HAY_CHART) {
    canvas.replaceWith(el("p", { class: "vacio", text: "No se pudo cargar Chart.js (vendor/chart.umd.min.js)." }));
    return null;
  }
  return new Chart(canvas, {
    type: "line",
    data: { datasets },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      normalized: true,
      interaction: { mode: "index", intersect: false },
      elements: {
        point: { radius: 0, hoverRadius: 3, hitRadius: 4 },
        line: { borderWidth: 1.75, tension: 0 },
      },
      plugins: {
        legend: {
          display: leyenda,
          position: "bottom",
          labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "rectRounded", padding: 14 },
        },
        tooltip: {
          callbacks: {
            title: (items) => (items.length ? `t = ${items[0].parsed.x.toFixed(1)} s` : ""),
            label: (ctx) => ` ${ctx.dataset.label}: ${formatear(ctx.parsed.y, 2)}${ctx.dataset.unidad ?? ""}`,
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          grid: { display: false },
          ticks: {
            maxTicksLimit: 6,
            // Al principio el rango es chico y sin decimales se repetirían las etiquetas.
            callback(v) {
              const rango = this.max - this.min;
              return `${v.toFixed(rango < 1 ? 2 : rango < 5 ? 1 : 0)} s`;
            },
          },
        },
        ...escalas,
      },
    },
  });
}

// Historial con tamaño máximo. "puntos" se modifica en el lugar porque Chart.js
// usa ese mismo array como datos del gráfico.
class SerieTemporal {
  constructor(maximo = CONFIG.HISTORIAL_MUESTRAS) {
    this.puntos = [];
    this.maximo = maximo;
  }

  agregar(x, y) {
    this.puntos.push({ x, y });
    if (this.puntos.length > this.maximo) this.puntos.splice(0, this.puntos.length - this.maximo);
  }

  limpiar() {
    this.puntos.length = 0;
  }
}

aplicarTemaGraficos();
Tema.alCambiar(aplicarTemaGraficos);
