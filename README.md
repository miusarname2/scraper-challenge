# Scraper de Jurisprudencia

Scraper en TypeScript que extrae resoluciones de dos fuentes de jurisprudencia peruana:

1. **OEFA** - Tribunal de Fiscalizacion Ambiental (~1750 documentos)
2. **Poder Judicial** - Jurisprudencia Nacional Sistematizada (~664,000 documentos, requiere VPN a Peru)

Al ejecutar, un menu interactivo permite elegir cual sitio scrapear.

## Requisitos

- Node.js >= 18
- npm
- Git
- VPN a Peru (solo para el scraper del Poder Judicial)

## Instalacion

```bash
git clone https://github.com/miusarname2/scraper-challenge.git
cd scraper-challenge
npm install
```

## Ejecucion

```bash
npm run scrape
```

Esto compila el TypeScript y muestra un menu interactivo donde se puede elegir el sitio a scrapear usando las flechas arriba/abajo y Enter.

### Flags opcionales

```bash
# Sin descargar PDFs (solo extrae metadatos)
npm run scrape -- --no-pdfs

# Limitar paginas (util para el scraper del PJ)
npm run scrape -- --max-paginas=5
```

## Flujo interactivo

1. El programa muestra un menu para elegir entre OEFA y Poder Judicial
2. Al seleccionar, intenta conectar con el servidor y muestra el estado
3. Si se elige Poder Judicial y falla por 403 (sin VPN), pregunta si reintentar o cambiar a OEFA
4. Si se elige OEFA, conecta directamente (no requiere VPN)

## Output

Cada scraper guarda su salida en una carpeta separada:

### OEFA (`output/`)

```
output/
  documentos.json          # Los ~1753 documentos con todos sus campos
  pdfs/                    # PDFs descargados
  failed_downloads.json    # UUIDs que fallaron (si aplica)
```

### Poder Judicial (`output-pj/`)

```
output-pj/
  documentos.json          # Resoluciones extraidas
  pdfs/                    # PDFs descargados
  descargas-fallidas.json  # Descargas que fallaron
```

## Manejo de errores 429

Ambos scrapers implementan backoff exponencial cuando el servidor responde 429 (Too Many Requests):

- Reintentos con esperas crecientes: 2s, 4s, 8s, 16s, 32s
- Respeta la cabecera `Retry-After` si el servidor la envia
- Tras agotar los intentos, registra el fallo y continua con el siguiente documento
- Delay de cortesia entre peticiones para no saturar el servidor

## Estructura del proyecto

```
src/
  index.ts              # Menu interactivo y orquestacion
  client.ts             # HTTP client para OEFA (sesion JSF/PrimeFaces)
  scraper.ts            # Scraper de OEFA
  types.ts              # Interfaces del scraper OEFA
  ui/
    menu.ts             # Menu interactivo (flechas + Enter)
  util/
    logger.ts           # Logger con colores
    sleep.ts            # Pausas y backoff exponencial
  pj/
    config.ts           # Configuracion del scraper PJ
    http/
      client.ts         # HTTP client con cookie jar y reintentos
    jsf/
      form.ts           # Parseo de formularios JSF (ViewState, botones)
      partial.ts        # Parseo de respuestas AJAX parciales
    scraper/
      index.ts          # Orquestacion del scraper PJ
      search.ts         # Sesion JSF y busqueda paginada
      parser.ts         # Extraccion de documentos del HTML
      pdf.ts            # Descarga y validacion de PDFs
      failures.ts       # Registro persistente de fallos
```

## Notas tecnicas

- **OEFA**: Usa PrimeFaces 6 + JSF 2.x con server-side state. Los PDFs solo se pueden descargar mientras el servidor tiene la pagina correspondiente cargada, por lo que la descarga se hace pagina por pagina.

- **Poder Judicial**: Usa Mojarra + RichFaces. La busqueda se hace con un POST al formulario JSF y la paginacion con AJAX del dataScroller de RichFaces. Los PDFs se descargan con un GET directo al servlet `ServletDescarga?uuid=<UUID>`.

- Ambos scrapers usan solo requests HTTP (`axios`) y parsing HTML (`cheerio`). No usan ningun navegador automatizado.
