# TP05 - Dashboard web de telemetría (Unitree Go2 / G1)

Desarrollo de Aplicaciones II.

Versión web del monitor de motores electroSim. El backend (FastAPI) lo da la
cátedra; este repo es el frontend: HTML, CSS y JavaScript sin frameworks, que
consume la API y muestra en vivo los motores, la IMU, la batería y el contacto
de las patas.

No hace falta instalar nada ni compilar.

## Cómo correrlo

1. Levantar el backend de la cátedra (carpeta `TP05_Desarrollo_de_Aplicaciones_II`
   del repo `UadeRobotLab`):
   - Con el simulador: `INICIAR_TP05.bat` en Windows o `INICIAR_TP05.sh` en Linux/macOS.
   - Solo en modo demo, sin simulador:

     ```bash
     python entorno/arrancar_api.py --demo --robot go2
     ```

2. Abrir `index.html` con doble clic. También se puede servir con
   `python -m http.server 5500` y entrar a `http://localhost:5500`.
3. Poner la dirección que muestra la consola del backend y apretar *Conectar*.
   Se puede pegar tal cual (`http://10.0.0.5:8001`) o solo la IP; si no se pone
   puerto, usa el 8001.

La dirección queda guardada para la próxima vez. También se puede pasar por URL:
`index.html?servidor=10.0.0.5:8001`.

Para el robot real no cambia nada del frontend, solo la IP.

## Qué pide la consigna y dónde está

| Consigna | Implementación |
|---|---|
| Panel de motores con semáforo de temperatura (verde < 40 °C, amarillo 40-60 °C, rojo > 60 °C), ángulo, velocidad y torque | Tabla agrupada por pata en el Go2 (12 motores) y por extremidad en el G1 (29). El semáforo cambia de color y de forma. `js/paneles/motores.js` |
| Panel IMU con roll, pitch, yaw y gráfico histórico de al menos 60 muestras | Valores numéricos, horizonte artificial y gráfico de las últimas 300 muestras. Yaw tiene un eje aparte porque va de -180 a 180 y si no roll y pitch se ven planos. `js/paneles/imu.js` |
| Panel BMS: carga, corriente, temperatura y voltaje de cada celda | `js/paneles/bms.js`. Marca la celda más baja y la más alta y muestra la diferencia en mV. |
| Panel de fuerzas por pata (FR, FL, RR, RL) | Vista del robot desde arriba y diagrama de marcha. Las patas se leen de `/info`, así que en el G1 muestra los dos pies. `js/paneles/patas.js` |
| Actualización automática por polling (máx. 500 ms) o WebSocket | Usa el WebSocket `/ws`. Si se corta, pasa a polling de `/telemetria` cada 500 ms hasta que el WebSocket vuelve. `js/cliente.js` |
| Botón *Capturar muestra* | Guarda la lectura actual. Además está *Grabar*, que guarda todas las lecturas mientras está activo. `js/captura.js` |
| Botón *Exportar CSV* | Descarga todas las muestras capturadas. |
| Funcionar en modo demo | Probado con `--demo` para Go2 y G1. |
| Extensión: WebSocket en lugar de polling | Hecho (ver arriba). |

Otras cosas que agregamos:

- Gráfico del ángulo de los motores: se hace clic en una fila de la tabla para
  agregar ese motor (hasta 6).
- Indicadores arriba de todo: si el robot se está moviendo, el motor más
  caliente, el torque máximo, la batería y cuántas patas están apoyadas.
- Estado de la conexión con la frecuencia real en Hz. Si se corta, los paneles
  quedan atenuados con el último dato y aparece un aviso. También detecta cuando
  el backend sigue contestando pero siempre con la misma lectura (pasa si se
  cierra el simulador).
- Alertas de motor por encima de 60 °C y de batería baja.
- Pausar la vista para leer los valores (los datos y la grabación siguen).
- Tema claro y oscuro, y diseño para celular.
- Chart.js está en `vendor/`, así que funciona sin internet en el laboratorio.

Atajos de teclado: `C` captura, `R` graba, `P` pausa.

## Organización del código

La consigna pide usar Adapter, Observer y Facade para separar la fuente de
datos de la interfaz:

- **Facade** (`js/cliente.js`): la app solo llama a `conectar()` y
  `desconectar()`. El WebSocket, el polling de respaldo, la reconexión, los
  timeouts y los errores del servidor quedan resueltos adentro de la clase.
- **Adapter** (`js/adaptador.js`): convierte el JSON de la API al formato que
  usan los paneles y valida los datos. Si cambia la API, se modifica solo este
  archivo.
- **Observer** (`js/observable.js`): el cliente emite eventos (`telemetria`,
  `info`, `estado`) y los paneles y el registro de muestras se suscriben.

```
index.html
css/dashboard.css
js/
  config.js        umbrales, intervalos y tamaños de historial
  observable.js    Observer
  adaptador.js     Adapter
  cliente.js       Facade (conexión con el backend)
  captura.js       muestras y exportación CSV
  ui.js            funciones de DOM, formato, tema y avisos
  graficos.js      configuración de Chart.js
  alertas.js       barra de alertas
  app.js           arma todo y maneja la barra superior
  paneles/         resumen, motores, angulos, imu, bms, patas
vendor/chart.umd.min.js   Chart.js 4.5.1
```

Cada panel tiene `configurar(info)` cuando cambia el robot, `agregar(lectura)`
para guardar historial y `pintar(lectura)` para actualizar la pantalla. Las
lecturas llegan unas 10 veces por segundo; el historial se guarda siempre, pero
la pantalla se actualiza con `requestAnimationFrame`, y la tabla de motores
solo cambia los textos en lugar de volver a armar el HTML.

Los umbrales (semáforo, torque alto, batería baja, intervalo de polling, etc.)
se cambian en `js/config.js`.

## Formato del CSV

Una fila por muestra, separado por comas y en UTF-8. Las columnas dependen del
robot:

- `fecha_hora`, `ts_s`, `modelo`
- `roll_deg`, `pitch_deg`, `yaw_deg`, `ax_m_s2`, `ay_m_s2`, `az_m_s2`
- `bateria_soc_pct`, `bateria_corriente_mA`, `bateria_temp_C`, `celda1_V`, `celda2_V`, ...
- `contacto_FR`, `contacto_FL`, ... (1 apoyada, 0 en el aire)
- por cada motor: `<motor>_angulo_deg`, `<motor>_velocidad_rad_s`, `<motor>_torque_Nm`, `<motor>_temp_C`

## Sobre los datos del simulador

Según el `API.md` de la cátedra, en el simulador y en modo demo el torque, la
temperatura, roll/pitch, las fuerzas de pata y la batería son valores derivados,
no mediciones. El dashboard lo aclara abajo de todo cuando el servidor está en
esos modos. Con el robot real los números van a ser otros, así que los umbrales
de alerta habría que revisarlos en el laboratorio.
