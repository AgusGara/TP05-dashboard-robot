// Mapa de temperatura: el robot dibujado con cada motor pintado con el semáforo,
// para ver de un vistazo qué parte está más caliente.
//   - Go2: visto desde arriba, un círculo por motor (cadera, muslo y pantorrilla de cada pata).
//   - G1: visto de espalda, así su izquierda queda a la izquierda. Tiene varios motores
//     en la misma articulación (la cadera tiene 3), así que se dibuja un círculo por
//     articulación con el color y la temperatura del motor más caliente.
// Los motores que no se sabe dónde van quedan en una fila abajo del dibujo.

// Go2: posición de cadera, muslo y pantorrilla de cada pata (el frente está arriba).
const PATAS_GO2 = {
  FL: [[-34, -52], [-58, -68], [-80, -86]],
  FR: [[34, -52], [58, -68], [80, -86]],
  RL: [[-34, 52], [-58, 68], [-80, 86]],
  RR: [[34, 52], [58, 68], [80, 86]],
};
const PARTES_GO2 = ["hip", "thigh", "calf"];

// G1 de espalda: posición de cada articulación.
const ARTICULACIONES_G1 = {
  torso: [0, -26], L_shoulder: [-34, -62], R_shoulder: [34, -62],
  L_elbow: [-46, -24], R_elbow: [46, -24], L_wrist: [-54, 12], R_wrist: [54, 12],
  L_hip: [-16, 12], R_hip: [16, 12], L_knee: [-20, 56], R_knee: [20, 56],
  L_ankle: [-22, 98], R_ankle: [22, 98],
};
const HUESOS_G1 = [
  ["L_shoulder", "R_shoulder"], ["L_shoulder", "L_elbow"], ["L_elbow", "L_wrist"],
  ["R_shoulder", "R_elbow"], ["R_elbow", "R_wrist"], ["L_hip", "R_hip"],
  ["L_hip", "L_knee"], ["L_knee", "L_ankle"], ["R_hip", "R_knee"], ["R_knee", "R_ankle"],
];

class PanelMapa {
  #nodos = [];                 // { motores: [nombre], grupo, texto, x, y }
  #alElegir;

  // alElegir(nombre) se llama al tocar un motor del dibujo.
  constructor(alElegir) {
    this.#alElegir = alElegir;
    const vista = $("mapaSvg");
    vista.addEventListener("click", (e) => this.#elegir(e.target.closest(".mapa__nodo")));
    vista.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      this.#elegir(e.target.closest(".mapa__nodo"));
    });
  }

  configurar(info) {
    const esPerro = info.motores.some((n) => /^(FR|FL|RR|RL)_/.test(n));
    const { nodos, fondo, vista } = esPerro ? this.#disenoGo2(info.motores) : this.#disenoG1(info.motores);
    this.#nodos = nodos;
    this.#ubicarSobrantes(info.motores, vista);

    const svg = $("mapaSvg");
    svg.setAttribute("viewBox", vista.join(" "));
    svg.setAttribute("aria-label", esPerro
      ? "Go2 visto desde arriba con la temperatura de cada motor"
      : "Robot visto de espalda con la temperatura de cada articulación");
    svg.replaceChildren(...fondo, ...this.#nodos.map((n) => this.#crearNodo(n)));
    setTexto($("subMapa"), esPerro ? "Visto desde arriba, el frente hacia arriba" : "Visto de espalda: la izquierda del robot queda a la izquierda");
  }

  pintar(t) {
    const porNombre = new Map(t.motores.map((m) => [m.nombre, m]));
    for (const nodo of this.#nodos) {
      const motor = this.#masCaliente(nodo.motores.map((n) => porNombre.get(n)).filter(Boolean));
      const nivel = motor?.nivel ?? "sin-dato";
      nodo.motorCaliente = motor?.nombre ?? nodo.motores[0];
      if (nodo.grupo.dataset.nivel !== nivel) nodo.grupo.dataset.nivel = nivel;
      setTexto(nodo.texto, motor && motor.temperatura !== null ? String(Math.round(motor.temperatura)) : SIN_DATO);
      setTexto(nodo.titulo, `${nodo.etiqueta}: ${motor ? `${formatear(motor.temperatura, 1)} °C` : SIN_DATO}` +
        (nodo.motores.length > 1 ? ` (el más caliente es ${motor?.nombre ?? SIN_DATO})` : ""));
    }

    const conTemp = t.motores.filter((m) => m.temperatura !== null);
    const caliente = this.#masCaliente(conTemp);
    const promedio = conTemp.reduce((s, m) => s + m.temperatura, 0) / (conTemp.length || 1);
    setTexto($("mapaCaliente"), caliente ? `${caliente.nombre}` : SIN_DATO);
    setTexto($("mapaCalienteTemp"), caliente ? `${formatear(caliente.temperatura, 1)} °C` : "");
    $("mapaCalienteDato").dataset.nivel = caliente?.nivel ?? "sin-dato";
    setTexto($("mapaPromedio"), conTemp.length ? formatear(promedio, 1) : SIN_DATO);
    setTexto($("mapaAmarillos"), String(t.motores.filter((m) => m.nivel === "warn").length));
    setTexto($("mapaRojos"), String(t.motores.filter((m) => m.nivel === "hot").length));
  }

  #elegir(grupo) {
    const nodo = this.#nodos.find((n) => n.grupo === grupo);
    if (nodo) this.#alElegir(nodo.motorCaliente ?? nodo.motores[0]);
  }

  // El de mayor nivel del semáforo y, a igual nivel, el de mayor temperatura.
  #masCaliente(motores) {
    let mejor = null;
    for (const m of motores) {
      if (!mejor || ORDEN_NIVEL[m.nivel] > ORDEN_NIVEL[mejor.nivel] ||
          (m.nivel === mejor.nivel && (m.temperatura ?? -Infinity) > (mejor.temperatura ?? -Infinity))) mejor = m;
    }
    return mejor;
  }

  #disenoGo2(motores) {
    const nodos = [];
    const fondo = [
      svgEl("text", { class: "robot__leyenda", x: 0, y: -100, text: "frente" }),
      svgEl("rect", { class: "robot__cuerpo", x: -26, y: -70, width: 52, height: 140, rx: 14 }),
      svgEl("path", { class: "robot__frente", d: "M-8 -58 L0 -66 L8 -58" }),
    ];
    for (const [pata, puntos] of Object.entries(PATAS_GO2)) {
      fondo.push(svgEl("polyline", { class: "mapa__hueso", points: puntos.map((p) => p.join(",")).join(" ") }));
      // La etiqueta de la pata va adentro del cuerpo, al lado de la cadera.
      fondo.push(svgEl("text", { class: "mapa__pata", x: Math.sign(puntos[0][0]) * 13, y: Math.sign(puntos[0][1]) * 44, text: pata }));
      PARTES_GO2.forEach((parte, i) => {
        const nombre = `${pata}_${parte}`;
        if (motores.includes(nombre)) {
          nodos.push({ motores: [nombre], etiqueta: `${nombre} (${descripcionMotor(nombre)})`, x: puntos[i][0], y: puntos[i][1] });
        }
      });
    }
    return { nodos, fondo, vista: [-100, -110, 200, 220] };
  }

  #disenoG1(motores) {
    const grupos = new Map();
    for (const nombre of motores) {
      const parte = /^(L|R)_(shoulder|elbow|wrist|hip|knee|ankle)/.exec(nombre);
      const id = parte ? `${parte[1]}_${parte[2]}` : /^(torso|waist)/.test(nombre) ? "torso" : null;
      if (!id || !ARTICULACIONES_G1[id]) continue;
      if (!grupos.has(id)) grupos.set(id, []);
      grupos.get(id).push(nombre);
    }
    const fondo = [
      svgEl("circle", { class: "robot__cuerpo", cx: 0, cy: -96, r: 13 }),
      svgEl("line", { class: "mapa__hueso", x1: 0, y1: -83, x2: 0, y2: -62 }),
      svgEl("polyline", { class: "mapa__hueso", points: "0,-62 0,12" }),
      ...HUESOS_G1.map(([a, b]) => {
        const [x1, y1] = ARTICULACIONES_G1[a];
        const [x2, y2] = ARTICULACIONES_G1[b];
        return svgEl("line", { class: "mapa__hueso", x1, y1, x2, y2 });
      }),
      svgEl("text", { class: "robot__leyenda", x: -70, y: -96, text: "izq." }),
      svgEl("text", { class: "robot__leyenda", x: 70, y: -96, text: "der." }),
    ];
    const nodos = [...grupos].map(([id, nombres]) => {
      const [x, y] = ARTICULACIONES_G1[id];
      const lugar = id === "torso" ? "Torso" : `${descripcionMotor(id)}, lado ${id.startsWith("L") ? "izquierdo" : "derecho"}`;
      const cantidad = nombres.length === 1 ? "1 motor" : `${nombres.length} motores`;
      return { motores: nombres, etiqueta: `${lugar[0].toUpperCase()}${lugar.slice(1)} (${cantidad})`, x, y };
    });
    return { nodos, fondo, vista: [-100, -120, 200, 240] };
  }

  // Motores que el dibujo no tiene ubicados: van en una fila abajo y se agranda la vista.
  #ubicarSobrantes(motores, vista) {
    const ubicados = new Set(this.#nodos.flatMap((n) => n.motores));
    const sobrantes = motores.filter((n) => !ubicados.has(n));
    if (!sobrantes.length) return;
    const porFila = 6;
    const yBase = vista[1] + vista[3] + 16;
    sobrantes.forEach((nombre, i) => {
      this.#nodos.push({
        motores: [nombre], etiqueta: nombre,
        x: -75 + (i % porFila) * 30, y: yBase + Math.floor(i / porFila) * 30,
      });
    });
    vista[3] += 32 + Math.ceil(sobrantes.length / porFila) * 30;
  }

  #crearNodo(nodo) {
    nodo.titulo = svgEl("title", { text: nodo.etiqueta });
    nodo.texto = svgEl("text", { x: nodo.x, y: nodo.y, text: SIN_DATO });
    nodo.grupo = svgEl("g", { class: "mapa__nodo", "data-nivel": "sin-dato", tabindex: "0", role: "button" },
      nodo.titulo,
      svgEl("circle", { cx: nodo.x, cy: nodo.y, r: 12 }),
      nodo.texto);
    return nodo.grupo;
  }
}
