// Funciones de interfaz que usan todos los paneles: DOM, formato, tema y avisos.

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";
const SIN_DATO = "–";

// Crea un elemento HTML. "text" y "class" son atajos, el resto se pone como atributo.
function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  asignarAtributos(nodo, atributos);
  nodo.append(...hijos);
  return nodo;
}

function svgEl(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElementNS(SVG_NS, etiqueta);
  asignarAtributos(nodo, atributos);
  nodo.append(...hijos);
  return nodo;
}

function asignarAtributos(nodo, atributos) {
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === "text") nodo.textContent = valor;
    else if (clave === "class") nodo.setAttribute("class", valor);
    else nodo.setAttribute(clave, valor === true ? "" : valor);
  }
}

// Solo escribe si el texto cambió. Se llama 10 veces por segundo, así que conviene
// no tocar el DOM de más (y los lectores de pantalla no repiten anuncios).
function setTexto(nodo, texto) {
  if (nodo.textContent !== texto) nodo.textContent = texto;
}

function formatear(valor, decimales = 1) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return SIN_DATO;
  const texto = valor.toFixed(decimales);
  return Number(texto) === 0 ? texto.replace("-", "") : texto;   // evita "-0.00"
}

function cssVar(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

/* ---------- Tema claro / oscuro ---------- */

const Tema = {
  oyentes: [],
  medio: window.matchMedia("(prefers-color-scheme: dark)"),

  iniciar() {
    this.medio.addEventListener("change", () => this.notificar());
  },
  oscuro() {
    const elegido = document.documentElement.dataset.theme;
    return elegido ? elegido === "dark" : this.medio.matches;
  },
  alternar() {
    const nuevo = this.oscuro() ? "light" : "dark";
    document.documentElement.dataset.theme = nuevo;
    try { localStorage.setItem("tema", nuevo); } catch { /* navegación privada */ }
    this.notificar();
  },
  alCambiar(fn) {
    this.oyentes.push(fn);
  },
  notificar() {
    this.oyentes.forEach((fn) => fn());
  },
};

/* ---------- Avisos ---------- */

const Avisos = {
  // tipo: info | ok | aviso | error. accion es opcional: { texto, fn }, por ejemplo "Deshacer".
  mostrar(mensaje, { tipo = "info", accion = null, duracion = 3500 } = {}) {
    const contenedor = $("avisos");
    const aviso = el("div", { class: `aviso aviso--${tipo}` },
      el("span", { class: "aviso__icono", "aria-hidden": "true" }),
      el("span", { class: "aviso__texto", text: mensaje }));
    const cerrar = () => {
      aviso.classList.add("aviso--saliendo");
      setTimeout(() => aviso.remove(), 180);
    };
    if (accion) {
      const boton = el("button", { class: "aviso__accion", type: "button", text: accion.texto });
      boton.addEventListener("click", () => { accion.fn(); cerrar(); });
      aviso.append(boton);
    }
    contenedor.append(aviso);
    while (contenedor.children.length > 3) contenedor.firstElementChild.remove();
    setTimeout(cerrar, duracion);
  },
};

function descargarArchivo(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const enlace = el("a", { href: url, download: nombre });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
