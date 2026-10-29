// Punto de entrada: conecta el cliente con los paneles y maneja la barra de arriba.
//
// Camino de cada lectura:
//   WebSocket o polling, ClienteTelemetria, adaptarTelemetria, evento "telemetria",
//   registro de muestras e historiales, y en el siguiente cuadro pintar() de cada panel.

const TEXTO_FASE = {
  conectando: "Conectando…",
  "en-vivo": "En vivo",
  "sin-datos": "Sin datos",
  esperando: "Esperando al robot",
  "sin-conexion": "Sin conexión",
  detenido: "Desconectado",
};

const cliente = new ClienteTelemetria();
const registro = new RegistroMuestras();
const alertas = new Alertas({ alReintentar: (host) => conectar(host), alReanudar: () => alternarPausa() });
const eventos = new RegistroEventos();
new PanelEventos(eventos);
const detalle = new DetalleMotor();
const angulos = new PanelAngulos();
const motores = new PanelMotores((nombre) => {
  if (!angulos.alternar(nombre)) {
    Avisos.mostrar(`Se pueden graficar hasta ${CONFIG.MAX_MOTORES_GRAFICO} motores a la vez`, { tipo: "aviso" });
  }
}, (nombre) => detalle.abrir(nombre));
const mapa = new PanelMapa((nombre) => detalle.abrir(nombre));
// La tabla tiene que configurarse antes que el gráfico, que marca su selección en ella.
const paneles = [new PanelResumen(), motores, mapa, angulos, new PanelImu(), new PanelBms(), new PanelPatas(), detalle];

let info = null;
let ultima = null;           // última lectura recibida
let ultimoTs = null;
let pausado = false;
let cuadroPendiente = 0;
let totalExportado = 0;

angulos.suscribir("seleccion", (colores) => motores.marcarSeleccion(colores));

/* ---------- Datos ---------- */

cliente.suscribir("info", (nueva) => {
  const mismoRobot = info !== null && info.modelo === nueva.modelo &&
    info.motores.join() === nueva.motores.join() && info.patas.join() === nueva.patas.join();
  info = nueva;
  pintarInfo(nueva);
  if (!mismoRobot) {
    ultimoTs = null;
    paneles.forEach((p) => p.configurar(nueva));
    eventos.robot(nueva);
  }
});

cliente.suscribir("telemetria", (t) => {
  registro.recibir(t);
  // ts cuenta desde que arrancó el backend: si vuelve atrás, el servidor se reinició.
  if (ultimoTs !== null && t.ts < ultimoTs - 0.5) paneles.forEach((p) => p.reiniciar?.());
  ultimoTs = t.ts;
  paneles.forEach((p) => p.agregar?.(t));
  eventos.revisar(t);
  ultima = t;
  programarPintado();
});

cliente.suscribir("estado", (estado) => {
  pintarEstado(estado);
  alertas.actualizarConexion(estado, ultima !== null);
  eventos.conexion(estado);
});

// Se pinta como mucho una vez por cuadro de pantalla, aunque lleguen lecturas más seguido.
// Con la pestaña oculta el navegador no llama a requestAnimationFrame y no se pinta nada.
function programarPintado() {
  if (pausado || cuadroPendiente) return;
  cuadroPendiente = requestAnimationFrame(() => {
    cuadroPendiente = 0;
    if (!ultima) return;
    paneles.forEach((p) => p.pintar(ultima));
    alertas.revisarDatos(ultima);
  });
}

/* ---------- Encabezado ---------- */

function pintarInfo(i) {
  const detalle = [
    i.tipo,
    `${i.motores.length} motores`,
    i.patas.length ? `${i.patas.length} ${i.patas.length === 2 ? "pies" : "patas"}` : null,
  ].filter(Boolean).join(", ");
  setTexto($("robotNombre"), i.nombre);
  setTexto($("robotDetalle"), detalle);
  const modo = $("robotModo");
  modo.hidden = !i.modo;
  modo.dataset.modo = i.modo ?? "";
  setTexto(modo, i.modo === "demo" ? "modo demo" : i.modo ?? "");
  $("notaDerivados").hidden = !(i.modo === "demo" || i.modo === "simulador");
  $("enlaceDocs").href = `${cliente.urlBase}/docs`;
  document.title = `Telemetría - ${i.nombre}`;
}

function pintarEstado(e) {
  $("estado").dataset.fase = e.fase;
  setTexto($("estadoTexto"), TEXTO_FASE[e.fase]);
  let detalle = "";
  if (e.fase === "en-vivo") {
    detalle = `${e.transporte === "websocket" ? "WebSocket" : "Polling"}, ${e.hz.toFixed(1)} Hz`;
  } else if (e.fase === "sin-datos") {
    detalle = `hace ${Math.round(e.edadMs / 1000)} s`;
  } else if (e.fase === "sin-conexion") {
    detalle = e.reintentoMs ? `reintento en ${Math.ceil(e.reintentoMs / 1000)} s` : "reintentando…";
  } else if (e.fase === "conectando" || e.fase === "esperando") {
    detalle = e.direccion ?? "";
  }
  setTexto($("estadoDetalle"), detalle);
  // Sin datos en vivo, los paneles quedan atenuados con el último valor.
  $("principal").classList.toggle("congelado", ultima !== null && e.fase !== "en-vivo");
  actualizarBotonConectar();
}

/* ---------- Conexión ---------- */

function direccionInicial() {
  const parametro = new URLSearchParams(location.search).get("servidor");
  if (parametro) return parametro;
  try {
    const guardada = localStorage.getItem("servidor");
    if (guardada) return guardada;
  } catch { /* sin localStorage */ }
  // Si el dashboard lo sirve la misma máquina del backend, se usa esa IP.
  const host = location.hostname;
  const local = !host || host === "localhost" || host === "127.0.0.1";
  return `${local ? "localhost" : host}:${CONFIG.PUERTO_POR_DEFECTO}`;
}

function conectar(texto) {
  const campo = $("servidor");
  try {
    const host = cliente.conectar(texto);
    campo.value = host;
    campo.removeAttribute("aria-invalid");
    try { localStorage.setItem("servidor", host); } catch { /* sin localStorage */ }
  } catch (error) {
    campo.setAttribute("aria-invalid", "true");
    Avisos.mostrar(error.message, { tipo: "error" });
    campo.focus();
  }
  actualizarBotonConectar();
}

// Si el campo tiene la dirección a la que ya estamos conectados, el botón desconecta.
function campoEsConexionActual() {
  try {
    return cliente.direccion !== null &&
      ClienteTelemetria.normalizarDireccion($("servidor").value).host === cliente.direccion;
  } catch {
    return false;            // dirección a medio escribir
  }
}

function actualizarBotonConectar() {
  setTexto($("btnConectar"), campoEsConexionActual() ? "Desconectar" : "Conectar");
}

$("formConexion").addEventListener("submit", (e) => {
  e.preventDefault();
  if (campoEsConexionActual()) cliente.desconectar();
  else conectar($("servidor").value);
});
$("servidor").addEventListener("input", () => {
  $("servidor").removeAttribute("aria-invalid");
  actualizarBotonConectar();
});

/* ---------- Captura y CSV ---------- */

registro.suscribir("cambio", ({ total, grabando }) => {
  setTexto($("contadorMuestras"), String(total));
  $("btnCsv").disabled = total === 0;
  $("btnDescartar").disabled = total === 0;
  $("btnGrabar").setAttribute("aria-pressed", String(grabando));
  setTexto($("btnGrabarTexto"), grabando ? "Grabando" : "Grabar");
});
registro.suscribir("limite", (maximo) => {
  Avisos.mostrar(`Se cortó la grabación: se llegó al máximo de ${maximo} muestras`, { tipo: "aviso", duracion: 6000 });
});

function capturar() {
  const t = registro.capturar();
  if (!t) {
    Avisos.mostrar("Todavía no llegaron datos para capturar", { tipo: "aviso" });
    return;
  }
  Avisos.mostrar(`Muestra ${registro.total} capturada (t = ${formatear(t.ts, 1)} s)`, { tipo: "ok", duracion: 2000 });
  eventos.agregar("captura", `Muestra ${registro.total} capturada`);
}

function alternarGrabacion() {
  const grabando = registro.alternarGrabacion();
  Avisos.mostrar(
    grabando ? "Grabando: se guarda cada lectura que llega" : `Grabación detenida, ${registro.total} muestras en total`,
    { tipo: grabando ? "info" : "ok", duracion: 2500 });
  eventos.agregar("captura", grabando ? "Empezó la grabación" : `Terminó la grabación (${registro.total} muestras en total)`);
}

// Nombre de archivo con el robot y la hora, ej: telemetria_go2_2026-10-29_14-03-22.csv
function nombreArchivo(prefijo) {
  const ahora = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  const marca = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}` +
    `_${dos(ahora.getHours())}-${dos(ahora.getMinutes())}-${dos(ahora.getSeconds())}`;
  return `${prefijo}_${info?.modelo ?? "robot"}_${marca}.csv`;
}

function exportarCsv() {
  if (!registro.total) return;
  descargarArchivo(nombreArchivo("telemetria"), registro.aCsv(), "text/csv;charset=utf-8");
  totalExportado = registro.total;
  Avisos.mostrar(`CSV exportado con ${registro.total} muestras`, { tipo: "ok" });
  eventos.agregar("captura", `CSV exportado con ${registro.total} muestras`);
}

function exportarEventos() {
  if (!eventos.lista.length) return;
  descargarArchivo(nombreArchivo("eventos"), eventos.aCsv(), "text/csv;charset=utf-8");
  Avisos.mostrar(`Se exportaron ${eventos.lista.length} eventos`, { tipo: "ok" });
}

function descartar() {
  const previas = registro.descartar();
  if (!previas.length) return;
  totalExportado = 0;
  eventos.agregar("captura", `Se descartaron ${previas.length} muestras`);
  Avisos.mostrar(`Se descartaron ${previas.length} muestras`, {
    accion: { texto: "Deshacer", fn: () => registro.restaurar(previas) },
    duracion: 6000,
  });
}

function alternarPausa() {
  pausado = !pausado;
  $("btnPausa").setAttribute("aria-pressed", String(pausado));
  setTexto($("btnPausaTexto"), pausado ? "Reanudar" : "Pausar");
  alertas.setPausa(pausado);
  if (!pausado) programarPintado();
}

$("btnCapturar").addEventListener("click", capturar);
$("btnGrabar").addEventListener("click", alternarGrabacion);
$("btnCsv").addEventListener("click", exportarCsv);
$("btnDescartar").addEventListener("click", descartar);
$("btnExportarEventos").addEventListener("click", exportarEventos);
$("btnLimpiarEventos").addEventListener("click", () => eventos.limpiar());
$("btnPausa").addEventListener("click", alternarPausa);

// Atajos de teclado (no se activan mientras se escribe en el campo del servidor).
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.target.matches("input:not([type=checkbox]), textarea, select")) return;
  const accion = { c: capturar, r: alternarGrabacion, p: alternarPausa }[e.key.toLowerCase()];
  if (!accion) return;
  e.preventDefault();
  accion();
});

// Pregunta antes de cerrar si hay muestras capturadas sin exportar.
window.addEventListener("beforeunload", (e) => {
  if (registro.total > 0 && registro.total !== totalExportado) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ---------- Tema ---------- */

function pintarBotonTema() {
  const oscuro = Tema.oscuro();
  $("btnTema").dataset.oscuro = String(oscuro);
  $("btnTema").setAttribute("aria-label", oscuro ? "Usar tema claro" : "Usar tema oscuro");
}
$("btnTema").addEventListener("click", () => Tema.alternar());
Tema.alCambiar(pintarBotonTema);

/* ---------- Ajustes de umbrales ---------- */

const dialogoAjustes = $("dialogoAjustes");
const formAjustes = $("formAjustes");

function llenarAjustes(valores) {
  for (const [clave, valor] of Object.entries(valores)) formAjustes.elements[clave].value = valor;
  $("errorAjustes").hidden = true;
}

function pintarLeyendaTemperatura({ TEMP_AMARILLO, TEMP_ROJO }) {
  setTexto($("leyendaOk"), `< ${TEMP_AMARILLO} °C`);
  setTexto($("leyendaWarn"), `${TEMP_AMARILLO}–${TEMP_ROJO} °C`);
  setTexto($("leyendaHot"), `> ${TEMP_ROJO} °C`);
}

$("btnAjustes").addEventListener("click", () => {
  llenarAjustes(umbrales.todos());
  dialogoAjustes.showModal();
});
$("btnRestablecer").addEventListener("click", () => llenarAjustes(UMBRALES_POR_DEFECTO));

formAjustes.addEventListener("submit", (e) => {
  if (e.submitter?.value !== "guardar") return;          // Cancelar cierra sin guardar
  const nuevos = Object.fromEntries(Object.keys(UMBRALES_POR_DEFECTO).map((k) => [k, formAjustes.elements[k].value]));
  try {
    umbrales.cambiar(nuevos);
    Avisos.mostrar(umbrales.sonPorDefecto() ? "Umbrales de la consigna restablecidos" : "Umbrales guardados", { tipo: "ok" });
  } catch (error) {
    e.preventDefault();                                   // el diálogo queda abierto
    $("errorAjustes").textContent = error.message;
    $("errorAjustes").hidden = false;
  }
});

umbrales.suscribir("cambio", (valores) => {
  pintarLeyendaTemperatura(valores);
  eventos.agregar("ajustes", `Umbrales: amarillo desde ${valores.TEMP_AMARILLO} °C, rojo sobre ${valores.TEMP_ROJO} °C, ` +
    `torque ${valores.UMBRAL_TORQUE} N·m, batería ${valores.SOC_MEDIO} % / ${valores.SOC_BAJO} %`);
  $("btnAjustes").setAttribute("aria-pressed", String(!umbrales.sonPorDefecto()));
  programarPintado();
});

/* ---------- Arranque ---------- */

Tema.iniciar();
pintarBotonTema();
pintarLeyendaTemperatura(umbrales.todos());
$("btnAjustes").setAttribute("aria-pressed", String(!umbrales.sonPorDefecto()));
$("servidor").value = direccionInicial();
conectar($("servidor").value);
