# AI Disclosure

Detalle del uso de IA durante el desarrollo de este proyecto.

---

## Scraper OEFA (feature principal)

### Prompt(s) usados

Le pedí a la IA que me explicara cómo funciona el protocolo AJAX de PrimeFaces 6 para paginar un DataTable, porque la documentación oficial de PrimeFaces no cubre bien los parámetros internos que manda el JS al servidor. Le pasé el HTML de la página y le pedí que identificara los parámetros del formulario JSF.

### Qué conservé tal cual

- La estructura general de clases (`OefaClient`, `Scraper`) la propuse yo, pero la IA me sugirió separar el client HTTP del scraper, lo cual tenía sentido y lo dejé.
- El template de las interfaces en `types.ts` lo generó la IA y lo conservé porque reflejaba exactamente los campos de la tabla.

### Qué corregí o descarté

- **Paginación rota**: La IA armó el body del POST de paginación sin incluir el parámetro `_encodeFeature=true`. Lo detecté porque el servidor seguía devolviendo la página 1 sin importar el valor de `_first`. Tuve que leer el código fuente de `components.js` de PrimeFaces 6 para encontrar que la función `paginate()` del DataTable envía `_encodeFeature=true` además de `_pagination`, `_first`, `_rows` y `_skipChildren`. Una vez agregado, la paginación funcionó pero el formato de respuesta cambió: ya no venía el HTML completo del DataTable sino solo los `<tr>` directos dentro del CDATA. Tuve que ajustar el parser para wrappear ese HTML en un `<table><tbody>` antes de parsearlo con cheerio.
- **Descarga de PDFs fuera de sincronía**: Inicialmente diseñé el scraper para primero recorrer todas las páginas, guardar los datos, y después descargar todos los PDFs. Esto no funcionó porque el servidor JSF mantiene estado del lado del servidor: el `data-ri` (row index) de cada fila solo es válido mientras esa página está cargada en la sesión. Cuando paginaba a la página 2, los row indices de la página 1 dejaban de servir para descargar PDFs (el servidor devolvía HTML en vez de PDF). Esto lo descubrí empíricamente comparando las descargas antes y después de paginar. La solución fue reestructurar el flujo para descargar los PDFs de cada página inmediatamente después de obtenerla, antes de avanzar a la siguiente.
- **Encoding del body**: La IA usaba `URLSearchParams` para construir el body de los requests AJAX. El problema es que `URLSearchParams` codifica los dos puntos (`:`) como `%3A` mientras que PrimeFaces espera que se use `encodeURIComponent` individualmente en las claves pero no en los separadores. Armé el body manualmente concatenando strings para tener control exacto del encoding.

### Qué hice sin IA

- Toda la ingeniería inversa del protocolo de PrimeFaces la hice yo: descargar y leer el `components.js` y `core.js` minificados del servidor, identificar la función `paginate()` del DataTable, entender cómo `PrimeFaces.ajax.Request.handle` serializa el formulario y agrega los parámetros extra, y descubrir que `_encodeFeature` cambia el formato de respuesta.
- El flujo de descarga de PDFs sincronizado con la paginación fue diseño mío tras detectar el problema empíricamente con requests de prueba.
- Los scripts de prueba intermedios (`test-request.js`, `test-e2e.js`) los escribí yo para validar cada paso del protocolo JSF antes de armar el scraper final.
- Las constantes de timing (delays entre páginas, entre PDFs, reintentos) las calibré yo probando contra el servidor real.

---

## Scraper Poder Judicial (feature nueva)

### Prompt(s) usados

Le pedí a la IA que me ayudara a investigar la estructura del sitio del Poder Judicial.

### Qué conservé tal cual

- Las utilidades de `sleep.ts` y `logger.ts` las tomé como base del repo de referencia y las adapté mínimamente.
- La lógica de parseo de respuestas parciales JSF (`partial.ts`) la mantuve porque es estándar: extraer bloques CDATA de un XML `<partial-response>`.

### Qué corregí o descarté

- **Cookie jar con axios**: El repo de referencia pasaba `jar` directamente en el `axios.create()`, pero con la versión actual de `axios-cookiejar-support` eso tira un error de TypeScript (`'jar' does not exist in type 'CreateAxiosDefaults'`). Lo corregí asignando `jar` a `defaults` después de crear la instancia y antes de pasarla a `wrapper()`.
- **Detección del botón "Buscar"**: El repo de referencia tenía una lógica para encontrar el botón que filtraba por `forward=buscar`. Cuando probé con VPN contra el sitio real, confirmé que existían dos botones (búsqueda general y especializada) con IDs dinámicos (`j_idt69`, `j_idt31`). La lógica funcionó correctamente, pero verifiqué que los parámetros extra del botón (`j_idt71`, `j_idt72`, etc.) coincidieran con lo que devolvía el servidor actual.
- **Validación contra el sitio real**: Una vez que tuve acceso con VPN, ejecuté un script de prueba que recorría todo el flujo (sesión → búsqueda → paginación → descarga PDF) y comparé los resultados con lo esperado. Todo cuadró: 10 documentos por página, paginación con 0 overlap, PDFs válidos.

### Qué hice sin IA

- La búsqueda y análisis del repo de referencia en GitHub la hice yo, evaluando cuál tenía la implementación más completa y verificable.
- La integración del scraper PJ dentro de la arquitectura existente del proyecto (que ya tenía el scraper OEFA) fue diseño mío: decidir la estructura de carpetas (`src/pj/`), cómo compartir utilidades, y cómo conectar ambos scrapers al menú interactivo.
- La verificación end-to-end con VPN la hice yo: escribí scripts de prueba para validar cada paso del protocolo contra el servidor real, descubrí que el `formBuscador:j_idt74` era la clave de paginación correcta, y confirmé que los 671,886 resultados paginaban correctamente.

---

## Menú interactivo (feature nueva)

### Prompt(s) usados

Le pedí a la IA que me ayudara a implementar un menú de selección en terminal con flechas arriba/abajo y Enter, usando solo las APIs nativas de Node.js (readline, stdin raw mode).

### Qué conservé tal cual

- La estructura base del menú con `stdin.setRawMode(true)` y detección de escape sequences para flechas la conservé, aunque la simplifiqué.

### Qué corregí o descarté

- **Limpieza de pantalla**: La IA usaba `console.clear()` para redibujar el menú, lo que borraba todo el historial del terminal. Lo reemplacé por escape sequences ANSI (`\x1b[NA\x1b[0J`) que solo borran las líneas del menú y vuelven a dibujar, manteniendo el output anterior visible.
- **Manejo de Ctrl+C**: La IA no manejaba Ctrl+C en raw mode, lo que dejaba el terminal roto si el usuario cancelaba. Agregué la detección de `\x03` para restaurar el modo del terminal y salir limpiamente.

### Qué hice sin IA

- El flujo de UX completo (menú → intento de conexión → mensaje de error → pregunta de reintento o fallback) lo diseñé yo basándome en los requerimientos del usuario.
- La función `preguntarSiNo` para el fallback cuando el PJ devuelve 403 la escribí yo.
- La lógica de `verificarConexion()` que hace un GET rápido y evalúa el status code la escribí yo.

---

## Manejo de errores 429

### Prompt(s) usados

Le pedí a la IA sugerencias para implementar reintentos con backoff exponencial.

### Qué conservé tal cual

- La fórmula base de `baseMs * factor^intento` la conservé porque es el patrón estándar.

### Qué corregí o descarté

- Nada significativo. El backoff exponencial es un patrón bien conocido, la implementación era directa.

### Qué hice sin IA

- El jitter aleatorio de ±20% para evitar thundering herd lo agregué yo.
- La calibración de los valores (2s base, factor 2, máximo 60s, 5 reintentos) la hice yo probando contra los servidores reales.
- El registro persistente de fallos en JSON para poder reintentar después fue idea mía.

---

## Documentación (README, AI Disclosure)

### Prompt(s) usados

Le pedí a la IA que generara borradores del README y de este documento.

### Qué conservé tal cual

- La mayor parte de la estructura y redacción del README la generó la IA y la conservé tras revisarla.

### Qué corregí o descarté

- Ajusté las instrucciones de ejecución para que reflejaran los flags reales (`--max-paginas`, `--no-pdfs`).
- Corregí la sección de estructura del proyecto para que coincidiera con los archivos finales.

### Qué hice sin IA

- La revisión final de que todo fuera consistente con el código real.

---

## Resumen general

| Área | Humano | IA |
|---|---|---|
| Ingeniería inversa JSF/PrimeFaces | Leer y analizar JS minificado, descubrir `_encodeFeature`, descubrir el problema de row indices | Sugerir estructura inicial del request |
| Diseño de arquitectura | Separación de módulos, flujo de descarga sincronizada, integración de dos scrapers | Generar boilerplate de clases |
| Debugging | Detectar y resolver paginación rota, PDFs fuera de sincronía, encoding del body | — |
| Scraper PJ | Investigar repo de referencia, verificar con VPN, integrar al proyecto | Adaptar código del repo de referencia |
| Menú interactivo | Diseño de UX y flujo de fallback | Implementación base del raw mode |
| Testing | Scripts de prueba, validación end-to-end, calibración de tiempos | — |
| Documentación | Revisión y ajustes | Redacción de borradores |
