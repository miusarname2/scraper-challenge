import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { OefaClient } from './client';
import { Documento, ScraperProgress } from './types';

const ROWS_PER_PAGE = 10;
const DELAY_BETWEEN_PAGES = 800;
const DELAY_BETWEEN_PDFS = 1500;
const MAX_RETRIES_429 = 5;
const OUTPUT_DIR = path.join(process.cwd(), 'output');
const PDF_DIR = path.join(OUTPUT_DIR, 'pdfs');
const FAILED_LOG = path.join(OUTPUT_DIR, 'failed_downloads.json');

export class Scraper {
  private client: OefaClient;
  private documentos: Documento[] = [];
  private downloadPdfs: boolean;
  private maxPaginas: number;
  private progress: ScraperProgress = {
    totalRegistros: 0,
    totalPaginas: 0,
    paginaActual: 0,
    documentosExtraidos: 0,
    pdfsDescargados: 0,
    pdfsConError: [],
  };

  constructor(opts: { downloadPdfs?: boolean; maxPaginas?: number } = {}) {
    this.client = new OefaClient();
    this.downloadPdfs = opts.downloadPdfs ?? true;
    this.maxPaginas = opts.maxPaginas ?? 0;
  }

  async run(): Promise<void> {
    this.setupDirs();

    console.log('[*] Iniciando sesion con el servidor...');
    await this.client.init();
    console.log('[+] Sesion iniciada\n');

    console.log('[*] Ejecutando busqueda...');
    const searchResponse = await this.client.buscarTodos();

    const { total, totalPages } = this.parseSearchMeta(searchResponse);
    this.progress.totalRegistros = total;
    this.progress.totalPaginas = totalPages;
    const paginasARecorrer = this.maxPaginas > 0 ? Math.min(totalPages, this.maxPaginas) : totalPages;
    console.log(`[+] ${total} registros encontrados (${totalPages} paginas)`);
    if (this.maxPaginas > 0 && this.maxPaginas < totalPages) {
      console.log(`[*] Limitado a ${this.maxPaginas} paginas por --max-paginas`);
    }
    console.log();

    // Pagina 1 viene en el response de busqueda
    const firstPageHtml = this.extractCDATA(searchResponse, 'listarDetalleInfraccionRAAForm:pgLista');
    if (firstPageHtml) {
      const rows = this.parseRowsFromFullTable(firstPageHtml);
      this.documentos.push(...rows);
      this.progress.paginaActual = 1;
      this.progress.documentosExtraidos = rows.length;
      this.logPageProgress(1, rows.length);

      if (this.downloadPdfs) await this.descargarPdfsDePagina(rows);
    }

    const limite = this.maxPaginas > 0 ? Math.min(totalPages, this.maxPaginas) : totalPages;
    for (let page = 2; page <= limite; page++) {
      await sleep(DELAY_BETWEEN_PAGES);

      const firstRow = (page - 1) * ROWS_PER_PAGE;
      try {
        const response = await this.client.obtenerPagina(firstRow, ROWS_PER_PAGE);
        let html = this.extractCDATA(response, 'listarDetalleInfraccionRAAForm:dt');

        if (!html) {
          console.warn(`[!] Pagina ${page}: respuesta vacia, reintentando...`);
          await sleep(2000);
          const retry = await this.client.obtenerPagina(firstRow, ROWS_PER_PAGE);
          html = this.extractCDATA(retry, 'listarDetalleInfraccionRAAForm:dt');
          if (!html) {
            console.error(`[x] Pagina ${page}: sin datos despues de reintento`);
            continue;
          }
        }

        const rows = this.parseRowsFromEncodedResponse(html);
        this.documentos.push(...rows);
        this.progress.paginaActual = page;
        this.progress.documentosExtraidos += rows.length;
        this.logPageProgress(page, rows.length);

        // Los PDFs se descargan aqui porque el servidor JSF solo permite
        // descargar los rows de la pagina que tiene actualmente cargada
        if (this.downloadPdfs) await this.descargarPdfsDePagina(rows);
      } catch (err: any) {
        console.error(`[x] Error en pagina ${page}: ${err.message}`);
      }

      // checkpoint periodico por si se corta la ejecucion
      if (page % 10 === 0) this.guardarResultados();
    }

    console.log(`\n[+] Extraccion completa: ${this.documentos.length} documentos`);
    this.guardarResultados();
    this.imprimirResumen();
  }

  private async descargarPdfsDePagina(rows: Documento[]): Promise<void> {
    for (const doc of rows) {
      if (!doc.pdfUuid) continue;

      const safeName = this.buildPdfFilename(doc);
      const filePath = path.join(PDF_DIR, safeName);

      if (fs.existsSync(filePath)) {
        doc.pdfDescargado = true;
        this.progress.pdfsDescargados++;
        continue;
      }

      await sleep(DELAY_BETWEEN_PDFS);

      const ok = await this.descargarConRetry(doc, filePath);
      if (ok) {
        doc.pdfDescargado = true;
        this.progress.pdfsDescargados++;
      } else {
        this.progress.pdfsConError.push(doc.pdfUuid);
      }
    }
  }

  private async descargarConRetry(doc: Documento, filePath: string): Promise<boolean> {
    let delay = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES_429; attempt++) {
      try {
        const { data } = await this.client.descargarPdf(doc.pdfRowIndex, doc.pdfUuid!);

        if (data.length < 100 || !data.subarray(0, 5).toString('utf-8').startsWith('%PDF')) {
          console.warn(`    [!] ${doc.resolucion}: respuesta no es PDF (${data.length} bytes)`);
          return false;
        }

        fs.writeFileSync(filePath, data);
        return true;
      } catch (err: any) {
        if (err.status === 429) {
          console.warn(`    [429] ${doc.resolucion}: rate limited, esperando ${delay / 1000}s (intento ${attempt}/${MAX_RETRIES_429})`);
          await sleep(delay);
          delay *= 2;
        } else {
          console.error(`    [x] ${doc.resolucion}: ${err.message}`);
          return false;
        }
      }
    }

    console.error(`    [x] ${doc.resolucion}: reintentos agotados`);
    return false;
  }

  private setupDirs(): void {
    fs.mkdirSync(PDF_DIR, { recursive: true });
  }

  private parseSearchMeta(data: string): { total: number; totalPages: number } {
    const match = data.match(/rowCount:(\d+)/);
    const total = match ? parseInt(match[1], 10) : 0;
    return { total, totalPages: Math.ceil(total / ROWS_PER_PAGE) };
  }

  private parseRowsFromFullTable(html: string): Documento[] {
    const $ = cheerio.load(html);
    return this.extractRows($);
  }

  private parseRowsFromEncodedResponse(html: string): Documento[] {
    const $ = cheerio.load(`<table><tbody>${html}</tbody></table>`);
    return this.extractRows($);
  }

  private extractRows($: cheerio.CheerioAPI): Documento[] {
    const docs: Documento[] = [];

    $('tr[data-ri]').each((_i, row) => {
      const cells = $(row).find('td');
      const nro = parseInt(cells.eq(0).text().trim(), 10) || 0;
      const expediente = cells.eq(1).text().trim();
      const administrado = cells.eq(2).text().trim();
      const unidadFiscalizable = cells.eq(3).text().trim();
      const sector = cells.eq(4).text().trim();
      const resolucion = cells.eq(5).text().trim();

      const onclick = cells.eq(6).find('a').attr('onclick') || '';
      const uuidMatch = onclick.match(/param_uuid':'([a-f0-9-]+)'/);
      const rowIndex = parseInt($(row).attr('data-ri') || '0', 10);

      docs.push({
        nro,
        expediente,
        administrado,
        unidadFiscalizable,
        sector,
        resolucion,
        pdfUuid: uuidMatch ? uuidMatch[1] : null,
        pdfRowIndex: rowIndex,
        pdfDescargado: false,
      });
    });

    return docs;
  }

  private buildPdfFilename(doc: Documento): string {
    const base = doc.resolucion || doc.expediente || doc.pdfUuid || 'desconocido';
    const sanitized = base
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 150);
    return `${sanitized}.pdf`;
  }

  private guardarResultados(): void {
    const jsonPath = path.join(OUTPUT_DIR, 'documentos.json');
    fs.writeFileSync(jsonPath, JSON.stringify(this.documentos, null, 2), 'utf-8');
    console.log(`[+] Datos guardados en ${jsonPath}`);
  }

  private imprimirResumen(): void {
    if (this.progress.pdfsConError.length > 0) {
      fs.writeFileSync(FAILED_LOG, JSON.stringify(this.progress.pdfsConError, null, 2), 'utf-8');
    }

    console.log('\n========== RESUMEN ==========');
    console.log(`Total registros:      ${this.progress.totalRegistros}`);
    console.log(`Documentos extraidos: ${this.documentos.length}`);
    console.log(`PDFs descargados:     ${this.progress.pdfsDescargados}`);
    console.log(`PDFs con error:       ${this.progress.pdfsConError.length}`);
    if (this.progress.pdfsConError.length > 0) {
      console.log(`Errores guardados en: ${FAILED_LOG}`);
    }
    console.log('=============================');
  }

  private logPageProgress(page: number, rows: number): void {
    console.log(`  Pagina ${page}/${this.progress.totalPaginas}: ${rows} registros (total: ${this.progress.documentosExtraidos})`);
  }

  private extractCDATA(data: string, id: string): string | null {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<update id="${escaped}">\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'm');
    return data.match(re)?.[1] || null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
