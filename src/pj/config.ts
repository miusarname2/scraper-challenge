function envNum(nombre: string, porDefecto: number): number {
  const v = process.env[nombre];
  if (!v) return porDefecto;
  const n = Number(v);
  return Number.isFinite(n) ? n : porDefecto;
}

export const pjConfig = {
  baseUrl: process.env.BASE_URL ?? 'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb',
  paginaInicio: '/faces/page/inicio.xhtml',
  paginaResultado: '/faces/page/resultado.xhtml',

  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

  timeoutMs: envNum('TIMEOUT_MS', 45_000),
  delayEntrePeticionesMs: envNum('DELAY_MS', 1_200),

  reintentos: {
    maxIntentos: envNum('MAX_INTENTOS', 5),
    baseMs: envNum('BACKOFF_BASE_MS', 1_000),
    factor: envNum('BACKOFF_FACTOR', 2),
    maxMs: envNum('BACKOFF_MAX_MS', 60_000),
  },

  salida: {
    raiz: process.env.OUT_DIR ?? 'output-pj',
    pdfs: 'pdfs',
    datosJson: 'documentos.json',
    fallidos: 'descargas-fallidas.json',
  },

  resultadosPorPagina: 10,
  idPanel: 'formBuscador:panel',
};
