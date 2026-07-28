# Scraper - Repositorio Digital OEFA

Scraper para extraer las resoluciones del Tribunal de Fiscalización Ambiental desde el [Repositorio Digital de OEFA](https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml).

Extrae los datos de los ~1750 documentos publicados y descarga los PDFs asociados.

## Requisitos

- Node.js >= 18
- npm

## Instalacion

```bash
npm install
```

## Ejecucion

### Extraer datos y descargar PDFs

```bash
npm run scrape
```

Esto compila el TypeScript y ejecuta el scraper completo. Los PDFs se descargan pagina por pagina, asi que la ejecucion completa puede tardar varias horas dependiendo de la velocidad de descarga.

### Solo extraer datos (sin PDFs)

```bash
npm run scrape -- --no-pdfs
```

Util para obtener rapidamente el JSON con todos los registros (~3 minutos).

### Ejecucion directa con ts-node

```bash
npm start
npm start -- --no-pdfs
```

## Output

Todo se guarda en la carpeta `output/`:

```
output/
  documentos.json          # Array con los 1753 documentos
  pdfs/                    # PDFs descargados
  failed_downloads.json    # UUIDs de PDFs que fallaron (si hubo errores)
```

### Estructura de cada documento

```json
{
  "nro": 1,
  "expediente": "891-08-PRODUCE/DIGSECOVI-Dsvs",
  "administrado": "Corporacion del Mar S.A.",
  "unidadFiscalizable": "Planta Playa Lado Norte Puerto Malabrigo",
  "sector": "Pesqueria",
  "resolucion": "264-2012-OEFA/TFA",
  "pdfUuid": "153a6d2a-cbed-40ef-b8ef-cd2272b19867",
  "pdfRowIndex": 0,
  "pdfDescargado": true
}
```

## Manejo de errores 429

Cuando el servidor responde con HTTP 429 (Too Many Requests) durante la descarga de PDFs, el scraper aplica backoff exponencial:

1. Primer reintento despues de 2 segundos
2. Segundo reintento despues de 4 segundos
3. Tercero despues de 8, luego 16, luego 32 segundos
4. Si despues de 5 intentos sigue fallando, registra el UUID en `failed_downloads.json` y continua con el siguiente documento

Ademas, entre cada descarga de PDF hay un delay de 1.5 segundos para no saturar el servidor.

## Estructura del proyecto

```
src/
  index.ts     # Entry point, parsea argumentos
  client.ts    # HTTP client que maneja la sesion JSF/PrimeFaces
  scraper.ts   # Logica de scraping, paginacion y descarga
  types.ts     # Interfaces TypeScript
```

## Notas tecnicas

El sitio usa PrimeFaces 6 + JSF 2.x con server-side state. No se puede usar un simple GET para obtener los datos; hay que simular el protocolo AJAX de PrimeFaces manteniendo el `JSESSIONID` y el `ViewState` actualizados entre requests. Los PDFs solo se pueden descargar mientras el servidor tiene la pagina correspondiente cargada en su estado, por lo que la descarga se hace pagina por pagina.
