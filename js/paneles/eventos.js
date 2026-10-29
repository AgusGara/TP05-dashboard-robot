// Panel de eventos: la lista del RegistroEventos, la más nueva arriba.
// Los eventos llegan de a pocos, así que se rearma la lista cada vez.

const TIPO_EVENTO = { motor: "Motor", bateria: "Batería", conexion: "Conexión", captura: "Captura", ajustes: "Ajustes" };
const FILTROS_EVENTOS = { todos: null, motor: ["motor"], bateria: ["bateria"], conexion: ["conexion"], sesion: ["captura", "ajustes"] };

class PanelEventos {
  #filtro = "todos";
  #eventos = [];
  #lista = $("listaEventos");

  constructor(registro) {
    registro.suscribir("cambio", (eventos) => {
      this.#eventos = eventos;
      this.#pintar();
    });
    $("filtrosEventos").addEventListener("click", (e) => {
      const boton = e.target.closest("[data-filtro]");
      if (!boton) return;
      this.#filtro = boton.dataset.filtro;
      for (const b of $("filtrosEventos").querySelectorAll("[data-filtro]")) {
        b.setAttribute("aria-pressed", String(b === boton));
      }
      this.#pintar();
    });
    this.#pintar();
  }

  #pintar() {
    const tipos = FILTROS_EVENTOS[this.#filtro];
    const visibles = tipos ? this.#eventos.filter((e) => tipos.includes(e.tipo)) : this.#eventos;
    const total = this.#eventos.length;
    setTexto($("subEventos"), total ? `${total} ${total === 1 ? "evento" : "eventos"} en esta sesión` : "Todavía no pasó nada");
    $("btnExportarEventos").disabled = !total;
    $("btnLimpiarEventos").disabled = !total;

    if (!visibles.length) {
      this.#lista.replaceChildren(el("li", { class: "vacio evento--vacio", text: total ? "No hay eventos de este tipo." : "Acá van a aparecer los cambios de temperatura, batería y conexión." }));
      return;
    }
    this.#lista.replaceChildren(...visibles.map((e) => el("li", { class: "evento", "data-nivel": e.nivel },
      el("time", { class: "evento__hora", datetime: e.fecha.toISOString(), text: e.fecha.toLocaleTimeString("es-AR", { hour12: false }) }),
      el("i", { class: "evento__punto", "aria-hidden": "true" }),
      el("span", { class: "evento__texto", text: e.mensaje }),
      el("span", { class: "evento__tipo", text: TIPO_EVENTO[e.tipo] ?? e.tipo }))));
  }
}
