import * as fs from 'fs';
import * as path from 'path';
import { PjHttpClient, ErrorReintentosAgotados } from '../http/client';
import { pjConfig } from '../config';
import { log } from '../../util/logger';
import { DocumentoPJ } from './parser';

export interface ResultadoDescarga {
  ok: boolean;
  ruta?: string;
  motivo?: string;
}

export class DescargadorPdf {
  private readonly carpeta: string;

  constructor(private readonly http: PjHttpClient) {
    this.carpeta = path.join(pjConfig.salida.raiz, pjConfig.salida.pdfs);
    fs.mkdirSync(this.carpeta, { recursive: true });
  }

  async descargar(doc: DocumentoPJ): Promise<ResultadoDescarga> {
    if (!doc.pdf) return { ok: false, motivo: 'Sin PDF asociado' };

    const nombre = this.nombreArchivo(doc);
    const destino = path.join(this.carpeta, nombre);

    if (fs.existsSync(destino) && fs.statSync(destino).size > 0) {
      return { ok: true, ruta: destino };
    }

    try {
      const datos = await this.obtenerBytes(doc);
      if (!datos) return { ok: false, motivo: 'Respuesta vacia' };
      if (!this.pareceePdf(datos)) return { ok: false, motivo: 'No parece un PDF' };

      fs.writeFileSync(destino, datos);
      log.ok(`PDF: ${nombre} (${(datos.length / 1024).toFixed(0)} KB)`);
      return { ok: true, ruta: destino };
    } catch (err) {
      if (err instanceof ErrorReintentosAgotados) return { ok: false, motivo: err.message };
      return { ok: false, motivo: err instanceof Error ? err.message : String(err) };
    }
  }

  private async obtenerBytes(doc: DocumentoPJ): Promise<Buffer | null> {
    const href = doc.pdf!.href;
    const url = this.normalizarUrl(href);
    const res = await this.http.getBinary(url, pjConfig.paginaResultado);
    return res.status === 200 ? Buffer.from(res.data) : null;
  }

  private normalizarUrl(href: string): string {
    if (/^https?:\/\//i.test(href)) return href;
    if (href.startsWith('/')) return href.replace(/^\/jurisprudenciaweb/, '');
    return `/faces/page/${href.replace(/^\.?\//, '')}`;
  }

  private pareceePdf(datos: Buffer): boolean {
    return datos.length > 4 && datos.subarray(0, 5).toString('latin1').startsWith('%PDF');
  }

  private nombreArchivo(doc: DocumentoPJ): string {
    const partes = [doc.campos.nroExpediente, doc.campos.recurso, doc.uuid.substring(0, 8)]
      .filter(Boolean)
      .join('_');
    const base = (partes || doc.id || doc.uuid)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w.-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 120);
    return `${base || 'documento'}.pdf`;
  }
}
