// Panel de fuerzas por pata: el robot visto desde arriba con cada pata apoyada o
// en el aire, y un diagrama de marcha con el historial de apoyos.
// Las patas salen de /info (el Go2 tiene FR, FL, RR y RL; el G1 sus dos pies).

// Posición de cada pata en el SVG (viewBox de -80 a 80).
const POSICION_PATAS = {
  FL: { x: -46, y: -50, corto: "FL" },
  FR: { x: 46, y: -50, corto: "FR" },
  RL: { x: -46, y: 52, corto: "RL" },
  RR: { x: 46, y: 52, corto: "RR" },
  L_foot: { x: -20, y: 4, corto: "L", pie: true },
  R_foot: { x: 20, y: 4, corto: "R", pie: true },
};

class PanelPatas {
  #ids = [];
  #nodos = new Map();          // id de la pata: su <g> en el SVG
  #marcha = [];                // una entrada por lectura: [apoyada?, apoyada?, ...]
  #canvas = $("marcha");
  #colores = null;             // se leen del CSS una vez por tema, no en cada cuadro

  constructor() {
    this.#leerColores();
    new ResizeObserver(() => this.#dibujarMarcha()).observe(this.#canvas);
    Tema.alCambiar(() => {
      this.#leerColores();
      this.#dibujarMarcha();
    });
  }

  #leerColores() {
    this.#colores = { texto: cssVar("--muted"), pista: cssVar("--surface-3"), apoyo: cssVar("--ok"), fuente: cssVar("--mono") };
  }

  configurar(info) {
    this.#ids = info.patas;
    this.#marcha = [];
    this.#nodos.clear();
    const hay = this.#ids.length > 0;
    $("patasContenido").hidden = !hay;
    $("patasVacio").hidden = hay;
    setTexto($("subPatas"), hay ? SIN_DATO : "Sin datos de contacto");
    if (!hay) return;
    this.#construirVista();
    this.#canvas.style.height = `${this.#ids.length * 20 + 4}px`;
    this.#dibujarMarcha();
  }

  agregar(t) {
    if (!this.#ids.length) return;
    const porId = new Map(t.patas.map((p) => [p.id, p.apoyada]));
    this.#marcha.push(this.#ids.map((id) => porId.get(id) ?? false));
    if (this.#marcha.length > CONFIG.HISTORIAL_PATAS) this.#marcha.shift();
  }

  pintar(t) {
    if (!this.#ids.length) return;
    let apoyadas = 0;
    for (const pata of t.patas) {
      const nodo = this.#nodos.get(pata.id);
      if (!nodo) continue;
      if (pata.apoyada) apoyadas++;
      nodo.classList.toggle("pata--apoyada", pata.apoyada);
      setTexto(nodo.querySelector("title"), `${pata.nombre} (${pata.id}): ${pata.apoyada ? "apoyada" : "en el aire"}`);
    }
    setTexto($("subPatas"), `${apoyadas} de ${this.#ids.length} apoyadas`);
    this.#dibujarMarcha();
  }

  reiniciar() {
    this.#marcha = [];
    this.#dibujarMarcha();
  }

  #construirVista() {
    const vista = $("patasSvg");
    const esPerro = this.#ids.some((id) => /^(FR|FL|RR|RL)$/.test(id));
    const cuerpo = esPerro
      ? [
          svgEl("rect", { class: "robot__cuerpo", x: -26, y: -62, width: 52, height: 124, rx: 14 }),
          svgEl("path", { class: "robot__frente", d: "M-8 -52 L0 -60 L8 -52" }),
        ]
      : [svgEl("path", { class: "robot__frente", d: "M-8 -44 L0 -52 L8 -44" })];   // humanoide: solo los pies
    const patas = this.#ids.map((id, i) => {
      const pos = POSICION_PATAS[id] ?? { x: -60 + i * 30, y: 70, corto: id };
      const forma = pos.pie
        ? svgEl("ellipse", { class: "pata__forma", cx: pos.x, cy: pos.y, rx: 14, ry: 32 })
        : svgEl("circle", { class: "pata__forma", cx: pos.x, cy: pos.y, r: 14 });
      const pierna = esPerro
        ? svgEl("line", { class: "robot__pierna", x1: Math.sign(pos.x) * 22, y1: pos.y * 0.88, x2: pos.x, y2: pos.y })
        : null;
      const grupo = svgEl("g", { class: "pata" },
        svgEl("title", { text: id }),
        ...(pierna ? [pierna] : []),
        forma,
        svgEl("text", { class: "pata__texto", x: pos.x, y: pos.y, text: pos.corto }));
      this.#nodos.set(id, grupo);
      return grupo;
    });
    vista.replaceChildren(
      svgEl("text", { class: "robot__leyenda", x: 0, y: esPerro ? -74 : -58, text: "frente" }),
      ...cuerpo, ...patas);
  }

  // Diagrama de marcha: una fila por pata, el tiempo avanza hacia la derecha.
  #dibujarMarcha() {
    const canvas = this.#canvas;
    const ancho = canvas.clientWidth;
    const alto = canvas.clientHeight;
    if (!ancho || !alto || !this.#ids.length) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(ancho * dpr) || canvas.height !== Math.round(alto * dpr)) {
      canvas.width = Math.round(ancho * dpr);
      canvas.height = Math.round(alto * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);

    const margen = 44;
    const filaAlto = 14;
    const paso = (ancho - margen) / CONFIG.HISTORIAL_PATAS;
    const offset = CONFIG.HISTORIAL_PATAS - this.#marcha.length;
    const colores = this.#colores;
    ctx.font = `600 11px ${colores.fuente}`;
    ctx.textBaseline = "middle";

    this.#ids.forEach((id, fila) => {
      const y = 2 + fila * 20;
      ctx.fillStyle = colores.texto;
      ctx.fillText((POSICION_PATAS[id]?.corto ?? id).slice(0, 6), 0, y + filaAlto / 2);
      ctx.fillStyle = colores.pista;
      ctx.fillRect(margen, y, ancho - margen, filaAlto);
      ctx.fillStyle = colores.apoyo;
      this.#marcha.forEach((muestra, j) => {
        if (muestra[fila]) ctx.fillRect(margen + (offset + j) * paso, y, paso + 0.5, filaAlto);
      });
    });
  }
}
