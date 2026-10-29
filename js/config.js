// Parámetros del dashboard. Si hay que ajustar algo en el laboratorio, es acá.
const CONFIG = Object.freeze({
  PUERTO_POR_DEFECTO: 8001,

  // Conexión
  POLLING_MS: 500,              // la consigna pide como máximo 500 ms
  TIMEOUT_HTTP_MS: 2000,
  RECONEXION_MIN_MS: 1000,      // el reintento del WebSocket se duplica hasta el máximo
  RECONEXION_MAX_MS: 10000,
  DATOS_VIEJOS_MS: 2000,        // si pasa más tiempo sin datos nuevos, se avisa

  // Historiales
  HISTORIAL_MUESTRAS: 300,      // puntos por serie (la consigna pide al menos 60)
  HISTORIAL_PATAS: 120,
  MAX_MOTORES_GRAFICO: 6,
  MAX_MUESTRAS_GRABACION: 36000, // 1 hora a 10 Hz

  // Formato del CSV:
  //   "excel"    separa con ; y usa coma decimal. Es lo que espera Excel con la
  //              configuración regional de Argentina, así se abre bien con doble clic.
  //   "estandar" separa con , y usa punto decimal (Google Sheets, Python, Excel en inglés).
  CSV_FORMATO: "excel",

  VELOCIDAD_EN_MOVIMIENTO: 0.1, // rad/s promedio para considerar que el robot camina
});

// Valores por defecto de los umbrales. Se pueden cambiar desde Ajustes en la
// pantalla (ver umbrales.js). El semáforo de temperatura es el de la consigna,
// igual al de electroSim.
const UMBRALES_POR_DEFECTO = Object.freeze({
  TEMP_AMARILLO: 40,            // °C
  TEMP_ROJO: 60,                // °C
  UMBRAL_TORQUE: 15,            // N·m
  SOC_MEDIO: 40,                // %
  SOC_BAJO: 20,                 // %
});
