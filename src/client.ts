import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { SessionState } from './types';

const BASE_URL = 'https://publico.oefa.gob.pe';
const PAGE_PATH = '/repdig/consulta/consultaTfa.xhtml';
const FORM_ID = 'listarDetalleInfraccionRAAForm';

/**
 * HTTP client que maneja la sesion JSF contra el repositorio digital de OEFA.
 *
 * El sitio usa PrimeFaces 6 + JSF 2.x con server-side state, asi que cada
 * request necesita el JSESSIONID cookie y el ViewState token actualizado.
 */
export class OefaClient {
  private http: AxiosInstance;
  private session: SessionState | null = null;

  constructor() {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 30_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      },
      maxRedirects: 5,
    });
  }

  async init(): Promise<void> {
    const res = await this.http.get(PAGE_PATH);

    const cookies = res.headers['set-cookie'] as string[] | undefined;
    const sessionCookie = cookies?.find(c => c.includes('JSESSIONID'));
    if (!sessionCookie) throw new Error('No se pudo obtener JSESSIONID');

    const cookie = sessionCookie.split(';')[0];

    const $ = cheerio.load(res.data);
    const viewState = $('input[name="javax.faces.ViewState"]').val() as string;
    if (!viewState) throw new Error('No se encontro ViewState en la pagina');

    this.session = { cookie, viewState };
  }

  private updateViewState(responseData: string): void {
    const match = responseData.match(/javax\.faces\.ViewState:0">\s*<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (match) this.session!.viewState = match[1];
  }

  async buscarTodos(): Promise<string> {
    this.ensureSession();
    const res = await this.postAjax(this.buildSearchBody());
    this.updateViewState(res.data);
    return res.data;
  }

  async obtenerPagina(firstRow: number, rowsPerPage: number = 10): Promise<string> {
    this.ensureSession();
    const res = await this.postAjax(this.buildPaginationBody(firstRow, rowsPerPage));
    this.updateViewState(res.data);
    return res.data;
  }

  async descargarPdf(rowIndex: number, uuid: string): Promise<{ data: Buffer; filename: string }> {
    this.ensureSession();

    // El download se hace con un POST JSF normal (no AJAX), simulando
    // el click en el icono de PDF que invoca mojarra.jsfcljs
    const params = new URLSearchParams();
    params.set(FORM_ID, FORM_ID);
    params.set(`${FORM_ID}:dt:${rowIndex}:j_idt63`, `${FORM_ID}:dt:${rowIndex}:j_idt63`);
    params.set('param_uuid', uuid);
    params.set(`${FORM_ID}:dt_scrollState`, '0,0');
    params.set('javax.faces.ViewState', this.session!.viewState);

    const res = await this.http.post(PAGE_PATH, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': this.session!.cookie,
        'Referer': `${BASE_URL}${PAGE_PATH}`,
      },
      responseType: 'arraybuffer',
      validateStatus: () => true,
      timeout: 60_000,
    });

    if (res.status === 429) {
      const err = new Error('Rate limited (429)') as Error & { status: number };
      err.status = 429;
      throw err;
    }

    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status} descargando PDF uuid=${uuid}`);
    }

    const disposition = res.headers['content-disposition'] as string || '';
    const fnMatch = disposition.match(/filename="?(.+?)"?\s*$/);
    const filename = fnMatch ? fnMatch[1] : `${uuid}.pdf`;

    return { data: Buffer.from(res.data), filename };
  }

  private ensureSession(): void {
    if (!this.session) throw new Error('Client no inicializado');
  }

  // Construye el body para el boton "Buscar" (PrimeFaces CommandButton AJAX)
  private buildSearchBody(): string {
    const parts = [
      'javax.faces.partial.ajax=true',
      `javax.faces.source=${enc(`${FORM_ID}:btnBuscar`)}`,
      'javax.faces.partial.execute=%40all',
      `javax.faces.partial.render=${enc(`${FORM_ID}:pgLista`)}+${enc(`${FORM_ID}:txtNroexp`)}`,
      `${enc(`${FORM_ID}:btnBuscar`)}=${enc(`${FORM_ID}:btnBuscar`)}`,
      `${FORM_ID}=${FORM_ID}`,
      `${enc(`${FORM_ID}:txtNroexp`)}=`,
      `${enc(`${FORM_ID}:j_idt21`)}=`,
      `${enc(`${FORM_ID}:j_idt25`)}=`,
      `${enc(`${FORM_ID}:idsector`)}=`,
      `${enc(`${FORM_ID}:j_idt34`)}=`,
      `${enc(`${FORM_ID}:dt_scrollState`)}=0%2C0`,
      `javax.faces.ViewState=${encodeURIComponent(this.session!.viewState)}`,
    ];
    return parts.join('&');
  }

  // Construye el body para la paginacion del DataTable (PrimeFaces DataTable.paginate)
  private buildPaginationBody(first: number, rows: number): string {
    const dt = `${FORM_ID}:dt`;
    const parts = [
      'javax.faces.partial.ajax=true',
      `javax.faces.source=${enc(dt)}`,
      `javax.faces.partial.execute=${enc(dt)}`,
      `javax.faces.partial.render=${enc(dt)}`,
      `${enc(dt)}=${enc(dt)}`,
      `${enc(dt + '_pagination')}=true`,
      `${enc(dt + '_first')}=${first}`,
      `${enc(dt + '_rows')}=${rows}`,
      `${enc(dt + '_skipChildren')}=true`,
      `${enc(dt + '_encodeFeature')}=true`,
      `${FORM_ID}=${FORM_ID}`,
      `${enc(`${FORM_ID}:txtNroexp`)}=`,
      `${enc(`${FORM_ID}:j_idt21`)}=`,
      `${enc(`${FORM_ID}:j_idt25`)}=`,
      `${enc(`${FORM_ID}:idsector`)}=`,
      `${enc(`${FORM_ID}:j_idt34`)}=`,
      `${enc(dt + '_scrollState')}=0%2C0`,
      `javax.faces.ViewState=${encodeURIComponent(this.session!.viewState)}`,
    ];
    return parts.join('&');
  }

  private postAjax(body: string): Promise<AxiosResponse<string>> {
    return this.http.post(PAGE_PATH, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': this.session!.cookie,
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': BASE_URL,
        'Referer': `${BASE_URL}${PAGE_PATH}`,
      },
    });
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}
