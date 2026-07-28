type Nivel = 'info' | 'ok' | 'warn' | 'error' | 'debug';

const colores: Record<Nivel, string> = {
  info: '\x1b[36m',
  ok: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  debug: '\x1b[90m',
};
const reset = '\x1b[0m';

const mostrarDebug = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

function escribir(nivel: Nivel, mensaje: string): void {
  if (nivel === 'debug' && !mostrarDebug) return;
  const hora = new Date().toISOString().substring(11, 19);
  const etiqueta = nivel.toUpperCase().padEnd(5);
  const color = colores[nivel];
  const linea = `${color}[${hora}] ${etiqueta}${reset} ${mensaje}`;
  if (nivel === 'error') console.error(linea);
  else console.log(linea);
}

export const log = {
  info: (m: string) => escribir('info', m),
  ok: (m: string) => escribir('ok', m),
  warn: (m: string) => escribir('warn', m),
  error: (m: string) => escribir('error', m),
  debug: (m: string) => escribir('debug', m),
};
