// Captura de muestras y exportación a CSV, como el "Capturar" de electroSim.
//   - capturar() guarda la última lectura recibida.
//   - Con la grabación activa se guarda cada lectura que llega.
//   - Las columnas del CSV salen de los datos, así que sirve para el Go2 y para el G1.
//
// Eventos: "cambio" { total, grabando } y "limite" (se cortó la grabación).
class RegistroMuestras extends Observable {
  #muestras = [];
  #grabando = false;
  #ultima = null;

  get total() { return this.#muestras.length; }
  get grabando() { return this.#grabando; }

  // Se llama con cada lectura que llega del servidor.
  recibir(lectura) {
    this.#ultima = lectura;
    if (this.#grabando) this.#agregar(lectura);
  }

  // Devuelve la lectura guardada, o null si todavía no llegó ninguna.
  capturar() {
    if (!this.#ultima) return null;
    // No hace falta copiar: las lecturas adaptadas nunca se modifican.
    this.#agregar(this.#ultima);
    return this.#ultima;
  }

  alternarGrabacion() {
    this.#grabando = !this.#grabando;
    this.#notificar();
    return this.#grabando;
  }

  // Vacía el registro y devuelve lo que había, para poder deshacer.
  descartar() {
    const previas = this.#muestras;
    this.#muestras = [];
    this.#grabando = false;
    this.#notificar();
    return previas;
  }

  restaurar(previas) {
    this.#muestras = previas.concat(this.#muestras);
    this.#notificar();
  }

  aCsv(nombreFormato = CONFIG.CSV_FORMATO) {
    const formato = FORMATOS_CSV[nombreFormato] ?? FORMATOS_CSV.estandar;
    const filas = this.#muestras.map(filaCsv);
    const encabezados = [];
    const vistos = new Set();
    for (const fila of filas) {
      for (const clave of fila.keys()) {
        if (!vistos.has(clave)) { vistos.add(clave); encabezados.push(clave); }
      }
    }
    const campo = (valor) => campoCsv(valor, formato);
    const lineas = [encabezados.map(campo).join(formato.separador)];
    for (const fila of filas) lineas.push(encabezados.map((h) => campo(fila.get(h))).join(formato.separador));
    // El BOM hace que Excel abra el archivo como UTF-8.
    return `﻿${lineas.join("\r\n")}\r\n`;
  }

  #agregar(lectura) {
    if (this.#muestras.length >= CONFIG.MAX_MUESTRAS_GRABACION) {
      this.#grabando = false;
      this.emitir("limite", CONFIG.MAX_MUESTRAS_GRABACION);
    } else {
      this.#muestras.push(lectura);
    }
    this.#notificar();
  }

  #notificar() {
    this.emitir("cambio", { total: this.#muestras.length, grabando: this.#grabando });
  }
}

// Una fila del CSV como Map columna/valor, en el orden en que van las columnas.
function filaCsv(m) {
  const fila = new Map([
    ["fecha_hora", fechaLocalIso(new Date(m.recibido))],
    ["ts_s", m.ts],
    ["modelo", m.modelo],
    ["roll_deg", m.imu.roll],
    ["pitch_deg", m.imu.pitch],
    ["yaw_deg", m.imu.yaw],
    ["ax_m_s2", m.imu.ax],
    ["ay_m_s2", m.imu.ay],
    ["az_m_s2", m.imu.az],
    ["bateria_soc_pct", m.bms.soc],
    ["bateria_corriente_mA", m.bms.corriente],
    ["bateria_temp_C", m.bms.temperatura],
  ]);
  m.bms.celdas.forEach((v, i) => fila.set(`celda${i + 1}_V`, v));
  for (const p of m.patas) fila.set(`contacto_${p.id}`, p.apoyada ? 1 : 0);
  for (const motor of m.motores) {
    fila.set(`${motor.nombre}_angulo_deg`, motor.angulo);
    fila.set(`${motor.nombre}_velocidad_rad_s`, motor.velocidad);
    fila.set(`${motor.nombre}_torque_Nm`, motor.torque);
    fila.set(`${motor.nombre}_temp_C`, motor.temperatura);
  }
  return fila;
}

// Ver CSV_FORMATO en config.js.
const FORMATOS_CSV = {
  excel: { separador: ";", decimal: "," },
  estandar: { separador: ",", decimal: "." },
};

function campoCsv(valor, formato) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return String(valor).replace(".", formato.decimal);
  const texto = String(valor);
  const especiales = new RegExp(`["\\r\\n${formato.separador}]`);
  return especiales.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

// Hora local con zona horaria, ej: 2026-10-28T14:03:22.123-03:00
function fechaLocalIso(fecha) {
  const dos = (n) => String(n).padStart(2, "0");
  const offset = -fecha.getTimezoneOffset();
  const signo = offset >= 0 ? "+" : "-";
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}` +
    `T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:${dos(fecha.getSeconds())}` +
    `.${String(fecha.getMilliseconds()).padStart(3, "0")}` +
    `${signo}${dos(Math.floor(Math.abs(offset) / 60))}:${dos(Math.abs(offset) % 60)}`;
}
