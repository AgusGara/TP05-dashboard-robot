// Adapter: pasa el JSON de la API (el contrato de API.md) al formato que usan
// los paneles. Si cambia el contrato, solo hay que tocar este archivo.

const NOMBRES_PATAS = {
  FR: "Delantera derecha",
  FL: "Delantera izquierda",
  RR: "Trasera derecha",
  RL: "Trasera izquierda",
  R_foot: "Pie derecho",
  L_foot: "Pie izquierdo",
};

const PARTES_MOTOR = {
  hip: "cadera", thigh: "muslo", calf: "pantorrilla", knee: "rodilla",
  ankle: "tobillo", torso: "torso", waist: "cintura", shoulder: "hombro",
  elbow: "codo", wrist: "muñeca",
};

const TIPOS_ROBOT = { cuadrupedo: "cuadrúpedo", humanoide: "humanoide" };

// Devuelve null si el valor no es un número, así la UI muestra un guion en vez de NaN.
function numero(valor) {
  const n = Number(valor);
  return valor !== null && valor !== "" && Number.isFinite(n) ? n : null;
}

// Para comparar niveles del semáforo: mayor es peor.
const ORDEN_NIVEL = { "sin-dato": 0, ok: 1, warn: 2, hot: 3 };

// Semáforo de electroSim: verde < 40 °C, amarillo de 40 a 60 °C, rojo > 60 °C.
function nivelTemperatura(temperatura) {
  if (temperatura === null) return "sin-dato";
  if (temperatura < umbrales.get("TEMP_AMARILLO")) return "ok";
  return temperatura <= umbrales.get("TEMP_ROJO") ? "warn" : "hot";
}

// Grupo de cada motor en la tabla: por pata en el Go2, por extremidad en el G1.
function grupoMotor(nombre) {
  const pata = /^(FR|FL|RR|RL)_/.exec(nombre);
  if (pata) return { id: pata[1], nombre: `${NOMBRES_PATAS[pata[1]]} (${pata[1]})` };
  if (/^(torso|waist)/.test(nombre)) return { id: "torso", nombre: "Torso" };
  const lado = /^(L|R)_/.exec(nombre);
  if (lado) {
    const izquierda = lado[1] === "L";
    return /hip|knee|ankle/.test(nombre)
      ? { id: `${lado[1]}_pierna`, nombre: `Pierna ${izquierda ? "izquierda" : "derecha"}` }
      : { id: `${lado[1]}_brazo`, nombre: `Brazo ${izquierda ? "izquierdo" : "derecho"}` };
  }
  return { id: "otros", nombre: "Otros" };
}

// Ej: "FR_thigh" da "muslo" y "L_shoulder_pitch" da "hombro pitch".
function descripcionMotor(nombre) {
  const partes = nombre.split("_");
  if (/^(FR|FL|RR|RL|L|R)$/.test(partes[0])) partes.shift();
  return partes.map((p) => PARTES_MOTOR[p] ?? p).join(" ");
}

// Respuesta de GET /info
function adaptarInfo(json) {
  if (!json || typeof json.modelo !== "string") throw new Error("Respuesta de /info inesperada");
  return {
    modelo: json.modelo.toLowerCase(),
    nombre: String(json.nombre ?? json.modelo.toUpperCase()),
    tipo: TIPOS_ROBOT[json.tipo] ?? json.tipo ?? null,
    motores: Array.isArray(json.motores_nombres) ? json.motores_nombres.map(String) : [],
    patas: Array.isArray(json.patas) ? json.patas.map(String) : [],
    frecuenciaHz: numero(json.frecuencia_hz),
    modo: json.modo ?? null,
  };
}

// Si /info no contesta, la descripción del robot se arma con la telemetría.
function infoDesdeTelemetria(t) {
  return {
    modelo: t.modelo,
    nombre: `Unitree ${t.modelo.toUpperCase()}`,
    tipo: null,
    motores: t.motores.map((m) => m.nombre),
    patas: t.patas.map((p) => p.id),
    frecuenciaHz: null,
    modo: null,
  };
}

// Respuesta de GET /telemetria o mensaje del WebSocket (tienen el mismo formato).
// Los paneles no modifican el objeto que devuelve esta función.
function adaptarTelemetria(json) {
  if (!json || typeof json.modelo !== "string" || !Array.isArray(json.motores)) {
    throw new Error("Telemetría con formato inesperado");
  }
  const imu = json.imu ?? {};
  const bms = json.bms ?? {};
  const fuerzas = json.fuerzas ?? {};

  return {
    modelo: json.modelo.toLowerCase(),
    ts: numero(json.ts) ?? 0,
    recibido: Date.now(),
    motores: json.motores.map((m, i) => {
      const temperatura = numero(m.temperatura);
      return {
        id: numero(m.id) ?? i,
        nombre: String(m.nombre ?? `motor_${i}`),
        angulo: numero(m.angulo),
        velocidad: numero(m.velocidad),
        torque: numero(m.torque),
        temperatura,
        nivel: nivelTemperatura(temperatura),
      };
    }),
    imu: {
      roll: numero(imu.roll), pitch: numero(imu.pitch), yaw: numero(imu.yaw),
      ax: numero(imu.ax), ay: numero(imu.ay), az: numero(imu.az),
    },
    bms: {
      soc: numero(bms.soc),
      corriente: numero(bms.corriente),
      temperatura: numero(bms.temperatura),
      celdas: Array.isArray(bms.celdas) ? bms.celdas.map(numero).filter((v) => v !== null) : [],
    },
    patas: Object.entries(fuerzas).map(([id, valor]) => ({
      id,
      nombre: NOMBRES_PATAS[id] ?? id,
      apoyada: Number(valor) > 0,
    })),
  };
}
