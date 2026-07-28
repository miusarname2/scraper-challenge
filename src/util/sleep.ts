export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function calcularBackoff(intento: number, baseMs: number, factor: number, maxMs: number): number {
  const espera = baseMs * Math.pow(factor, intento);
  const topada = Math.min(espera, maxMs);
  const jitter = topada * 0.2 * (Math.random() * 2 - 1);
  return Math.round(topada + jitter);
}
