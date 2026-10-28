// Observer: el que tiene los datos emite eventos y los paneles se suscriben.
// Así se puede sumar un panel sin tocar la parte de conexión.
class Observable {
  #oyentes = new Map();

  // Devuelve una función para desuscribirse.
  suscribir(evento, fn) {
    if (!this.#oyentes.has(evento)) this.#oyentes.set(evento, new Set());
    this.#oyentes.get(evento).add(fn);
    return () => this.#oyentes.get(evento)?.delete(fn);
  }

  emitir(evento, dato) {
    for (const fn of this.#oyentes.get(evento) ?? []) {
      try {
        fn(dato);
      } catch (error) {
        // Si un panel falla, los demás siguen andando.
        console.error(`Error en un oyente de "${evento}":`, error);
      }
    }
  }
}
