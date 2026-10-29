// Umbrales de alerta que se pueden cambiar desde Ajustes, sin tocar el código.
// En el laboratorio, con el robot real, la temperatura y el torque dan otros
// valores que en el simulador, así que los límites se ajustan ahí mismo.
//
// Lo elegido se guarda en el navegador. Evento: "cambio" con los valores nuevos.

const CLAVE_UMBRALES = "umbrales";

class Umbrales extends Observable {
  #valores = { ...UMBRALES_POR_DEFECTO };

  constructor() {
    super();
    try {
      const guardados = JSON.parse(localStorage.getItem(CLAVE_UMBRALES));
      if (guardados) this.#valores = Umbrales.validar({ ...UMBRALES_POR_DEFECTO, ...guardados });
    } catch { /* sin localStorage o valores viejos que ya no valen: quedan los de por defecto */ }
  }

  get(clave) {
    return this.#valores[clave];
  }

  todos() {
    return { ...this.#valores };
  }

  sonPorDefecto() {
    return Object.keys(UMBRALES_POR_DEFECTO).every((k) => this.#valores[k] === UMBRALES_POR_DEFECTO[k]);
  }

  // Tira un error con un mensaje para mostrar si los valores no tienen sentido.
  cambiar(nuevos) {
    this.#valores = Umbrales.validar({ ...this.#valores, ...nuevos });
    try {
      if (this.sonPorDefecto()) localStorage.removeItem(CLAVE_UMBRALES);
      else localStorage.setItem(CLAVE_UMBRALES, JSON.stringify(this.#valores));
    } catch { /* navegación privada: vale hasta que se cierra la pestaña */ }
    this.emitir("cambio", this.todos());
  }

  restablecer() {
    this.cambiar(UMBRALES_POR_DEFECTO);
  }

  static validar(v) {
    const valores = {};
    for (const clave of Object.keys(UMBRALES_POR_DEFECTO)) {
      const n = Number(v[clave]);
      if (v[clave] === "" || !Number.isFinite(n)) throw new Error("Completá todos los valores con números");
      valores[clave] = n;
    }
    const { TEMP_AMARILLO, TEMP_ROJO, UMBRAL_TORQUE, SOC_MEDIO, SOC_BAJO } = valores;
    if (TEMP_AMARILLO <= 0 || TEMP_ROJO > 150) throw new Error("Las temperaturas tienen que estar entre 0 y 150 °C");
    if (TEMP_AMARILLO >= TEMP_ROJO) throw new Error("La temperatura de amarillo tiene que ser menor que la de rojo");
    if (UMBRAL_TORQUE <= 0) throw new Error("El torque alto tiene que ser mayor que 0");
    if (SOC_BAJO < 0 || SOC_MEDIO > 100) throw new Error("La carga de batería tiene que estar entre 0 y 100 %");
    if (SOC_BAJO >= SOC_MEDIO) throw new Error("La batería baja tiene que ser menor que la batería media");
    return valores;
  }
}

const umbrales = new Umbrales();
