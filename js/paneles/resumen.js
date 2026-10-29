// Franja de indicadores de arriba: lo que conviene ver antes de mirar cada panel
// (si el robot se mueve, si hay algo caliente, cuánta batería queda).
class PanelResumen {
  configurar() {
    for (const id of ["kpiActividadTexto", "kpiTempValor", "kpiTorque", "kpiBateria", "kpiContacto"]) setTexto($(id), SIN_DATO);
    for (const id of ["kpiTempSub", "kpiTorqueSub", "kpiContactoSub"]) setTexto($(id), "");
    delete $("kpiActividad").dataset.estado;
    $("kpiTemp").dataset.nivel = "sin-dato";
    $("kpiBateria").dataset.nivel = "sin-dato";
  }

  pintar(t) {
    const motores = t.motores;
    const conVelocidad = motores.filter((m) => m.velocidad !== null);
    const promedio = conVelocidad.reduce((s, m) => s + Math.abs(m.velocidad), 0) / (conVelocidad.length || 1);
    const moviendose = promedio > CONFIG.VELOCIDAD_EN_MOVIMIENTO;
    $("kpiActividad").dataset.estado = moviendose ? "movimiento" : "quieto";
    setTexto($("kpiActividadTexto"), moviendose ? "En movimiento" : "Detenido");

    const caliente = maximoPor(motores, (m) => m.temperatura);
    if (caliente) {
      $("kpiTemp").dataset.nivel = caliente.nivel;
      setTexto($("kpiTempValor"), `${formatear(caliente.temperatura, 1)} °C`);
      const elevados = motores.filter((m) => m.nivel === "warn" || m.nivel === "hot").length;
      setTexto($("kpiTempSub"), elevados ? `${caliente.nombre}, ${elevados} sobre ${umbrales.get("TEMP_AMARILLO")} °C` : caliente.nombre);
    }

    const exigido = maximoPor(motores, (m) => (m.torque === null ? null : Math.abs(m.torque)));
    if (exigido) {
      setTexto($("kpiTorque"), `${formatear(Math.abs(exigido.torque), 1)} N·m`);
      setTexto($("kpiTorqueSub"), exigido.nombre);
    }

    const soc = t.bms.soc;
    $("kpiBateria").dataset.nivel = soc === null ? "sin-dato" : soc > umbrales.get("SOC_MEDIO") ? "ok" : soc > umbrales.get("SOC_BAJO") ? "warn" : "hot";
    setTexto($("kpiBateria"), soc === null ? SIN_DATO : `${soc} %`);

    if (t.patas.length) {
      setTexto($("kpiContacto"), `${t.patas.filter((p) => p.apoyada).length}/${t.patas.length}`);
      setTexto($("kpiContactoSub"), t.patas.length === 2 ? "pies apoyados" : "patas apoyadas");
    } else {
      setTexto($("kpiContacto"), SIN_DATO);
      setTexto($("kpiContactoSub"), "sin datos");
    }
  }
}

// El elemento de la lista con el mayor valor según criterio (ignora los null).
function maximoPor(lista, criterio) {
  let mejor = null;
  let mejorValor = -Infinity;
  for (const item of lista) {
    const valor = criterio(item);
    if (valor !== null && valor > mejorValor) { mejor = item; mejorValor = valor; }
  }
  return mejor;
}
