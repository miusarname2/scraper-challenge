import * as fs from 'fs';
import * as path from 'path';
import { pjConfig } from '../config';
import { log } from '../../util/logger';
import { PjHttpClient } from '../http/client';
import { Buscador, Filtros } from './search';
import { parsearResultados, detectarTotalPaginas, DocumentoPJ } from './parser';
import { DescargadorPdf } from './pdf';
import { RegistroFallidos } from './failures';

export interface OpcionesPJ {
  filtros: Filtros;
  maxPaginas: number;
  descargarPdf: boolean;
}

function guardarDocumentos(documentos: DocumentoPJ[]): string {
  const ruta = path.join(pjConfig.salida.raiz, pjConfig.salida.datosJson);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(documentos, null, 2), 'utf-8');
  return ruta;
}

export async function ejecutarScraperPJ(opc: OpcionesPJ): Promise<void> {
  const http = new PjHttpClient();
  const descargador = new DescargadorPdf(http);
  const fallidos = new RegistroFallidos(
    path.join(pjConfig.salida.raiz, pjConfig.salida.fallidos),
  );

  const buscador = new Buscador(http);
  await buscador.iniciarSesion();

  const documentos: DocumentoPJ[] = [];
  let pagina = 1;
  let totalPaginas: number | null = null;

  let html = await buscador.buscar(opc.filtros);

  while (true) {
    if (totalPaginas === null) {
      totalPaginas = detectarTotalPaginas(html, pjConfig.resultadosPorPagina);
      if (totalPaginas) log.info(`Paginas totales estimadas: ${totalPaginas}`);
    }

    const docs = parsearResultados(html, pagina);
    if (docs.length === 0) {
      log.info(`Pagina ${pagina} sin documentos. Fin de la busqueda.`);
      break;
    }

    log.ok(`Pagina ${pagina}: ${docs.length} documentos.`);
    documentos.push(...docs);

    if (opc.descargarPdf) {
      for (const doc of docs) {
        if (!doc.pdf) continue;
        const r = await descargador.descargar(doc);
        if (r.ok) {
          fallidos.resolver(doc.id);
        } else {
          log.error(`No se pudo descargar ${doc.id}: ${r.motivo}`);
          fallidos.registrar({
            id: doc.id, uuid: doc.uuid, pagina: doc.pagina,
            motivo: r.motivo ?? 'desconocido', pdf: doc.pdf,
            fecha: new Date().toISOString(),
          });
        }
      }
    }

    guardarDocumentos(documentos);

    const limite = opc.maxPaginas > 0 && pagina >= opc.maxPaginas;
    const final = totalPaginas !== null && pagina >= totalPaginas;
    if (limite) { log.info(`Limite de ${opc.maxPaginas} paginas alcanzado.`); break; }
    if (final) { log.info('Se llego a la ultima pagina.'); break; }

    pagina++;
    html = await buscador.paginar(pagina);
  }

  const ruta = guardarDocumentos(documentos);
  log.ok(`Listo. ${documentos.length} documentos guardados en ${ruta}`);

  const pendientes = fallidos.listar().length;
  if (pendientes > 0) {
    log.warn(`Quedaron ${pendientes} descargas fallidas en ${pjConfig.salida.fallidos}`);
  }
}
