import * as cheerio from 'cheerio';

export interface RefPdf {
  tipo: 'href';
  href: string;
}

export interface DocumentoPJ {
  id: string;
  uuid: string;
  pagina: number;
  campos: {
    nroExpediente?: string;
    recurso?: string;
    pretensiones?: string;
    tipoResolucion?: string;
    fechaResolucion?: string;
    sala?: string;
    palabrasClave?: string;
    sumilla?: string;
  };
  pdf?: RefPdf;
}

const CLAVES_META = [
  'uuid', 'recurso', 'nroexp', 'palabras', 'pretensiones',
  'normaDI', 'tipoResolucion', 'fechaResolucion', 'sala', 'sumilla',
] as const;

export function parsearResultados(html: string, pagina: number): DocumentoPJ[] {
  const $ = cheerio.load(html);

  const metaPorUuid = new Map<string, DocumentoPJ['campos']>();
  $('[onclick]').each((_, el) => {
    const onclick = $(el).attr('onclick') ?? '';
    if (!onclick.includes('parameters') || !onclick.includes('uuid')) return;
    const meta = extraerMetadatos(onclick);
    if (meta?.uuid) metaPorUuid.set(meta.uuid, meta.campos);
  });

  const documentos: DocumentoPJ[] = [];
  const vistos = new Set<string>();

  $('a[href*="ServletDescarga"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const uuid = href.match(/uuid=([0-9a-fA-F-]+)/)?.[1];
    if (!uuid || vistos.has(uuid)) return;
    vistos.add(uuid);

    const campos = metaPorUuid.get(uuid) ?? {};
    documentos.push({ id: campos.nroExpediente || uuid, uuid, pagina, campos, pdf: { tipo: 'href', href } });
  });

  for (const [uuid, campos] of metaPorUuid) {
    if (vistos.has(uuid)) continue;
    vistos.add(uuid);
    documentos.push({ id: campos.nroExpediente || uuid, uuid, pagina, campos });
  }

  return documentos;
}

export function detectarTotalPaginas(html: string, porPagina: number): number | null {
  const texto = cheerio.load(html).root().text();
  const numeros: number[] = [];
  for (const m of texto.matchAll(/de\s+([\d,\.]+)/gi)) {
    const n = Number(m[1].replace(/[,\.]/g, ''));
    if (Number.isFinite(n)) numeros.push(n);
  }
  for (const m of texto.matchAll(/([\d,\.]+)\s+resultados?/gi)) {
    const n = Number(m[1].replace(/[,\.]/g, ''));
    if (Number.isFinite(n)) numeros.push(n);
  }
  const total = numeros.length ? Math.max(...numeros) : 0;
  return total > 0 ? Math.ceil(total / porPagina) : null;
}

function extraerMetadatos(onclick: string): { uuid: string; campos: DocumentoPJ['campos'] } | null {
  const s = onclick.replace(/\\"/g, '"');

  const marcas = CLAVES_META.map((clave) => ({
    clave,
    marcador: `"${clave}":"`,
    pos: s.indexOf(`"${clave}":"`),
  }))
    .filter((m) => m.pos >= 0)
    .sort((a, b) => a.pos - b.pos);

  if (marcas.length === 0) return null;

  const valores: Record<string, string> = {};
  for (let i = 0; i < marcas.length; i++) {
    const actual = marcas[i];
    const siguiente = marcas[i + 1];
    const inicio = actual.pos + actual.marcador.length;
    const fin = siguiente ? siguiente.pos : (s.indexOf('"}', inicio) >= 0 ? s.indexOf('"}', inicio) : s.length);
    let bruto = s.substring(inicio, fin);
    bruto = bruto.replace(/"[\s,]*$/, '').replace(/[\s,]*$/, '');
    valores[actual.clave] = desescapar(bruto);
  }

  if (!valores['uuid']) return null;

  return {
    uuid: valores['uuid'],
    campos: {
      nroExpediente: valores['nroexp'] || undefined,
      recurso: valores['recurso'] || undefined,
      pretensiones: valores['pretensiones'] || undefined,
      tipoResolucion: valores['tipoResolucion'] || undefined,
      fechaResolucion: valores['fechaResolucion'] || undefined,
      sala: valores['sala'] || undefined,
      palabrasClave: valores['palabras'] || undefined,
      sumilla: valores['sumilla'] || undefined,
    },
  };
}

function desescapar(v: string): string {
  return v
    .replace(/\\+u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\+\//g, '/')
    .replace(/\\+n/g, ' ')
    .replace(/\\+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
