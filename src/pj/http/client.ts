import axios, { AxiosInstance, AxiosResponse, isAxiosError } from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { pjConfig } from '../config';
import { log } from '../../util/logger';
import { sleep, calcularBackoff } from '../../util/sleep';

export class ErrorReintentosAgotados extends Error {
  constructor(
    public readonly url: string,
    public readonly ultimoEstado: number | undefined,
    public readonly intentos: number,
  ) {
    super(
      `Se agotaron los ${intentos} intentos para ${url}` +
        (ultimoEstado ? ` (ultimo estado HTTP ${ultimoEstado})` : ''),
    );
    this.name = 'ErrorReintentosAgotados';
  }
}

interface OpcionesPeticion {
  maxIntentos?: number;
  conPausa?: boolean;
  headers?: Record<string, string>;
  maxRedirects?: number;
}

export class PjHttpClient {
  private readonly ax: AxiosInstance;
  readonly jar: CookieJar;

  constructor() {
    this.jar = new CookieJar();
    const instance = axios.create({
      baseURL: pjConfig.baseUrl,
        timeout: pjConfig.timeoutMs,
        validateStatus: () => true,
        maxRedirects: 5,
        beforeRedirect: (opciones: Record<string, any>) => {
          if (opciones.protocol === 'http:') {
            opciones.protocol = 'https:';
            opciones.port = 443;
            if (typeof opciones.href === 'string') {
              opciones.href = opciones.href.replace(/^http:/, 'https:');
            }
          }
        },
        headers: {
          'User-Agent': pjConfig.userAgent,
          'Accept-Language': 'es-PE,es;q=0.9',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
    (instance.defaults as any).jar = this.jar;
    this.ax = wrapper(instance);
  }

  async get(url: string, opciones: OpcionesPeticion = {}): Promise<AxiosResponse<string>> {
    return this.pedirConReintentos(
      () => this.ax.get<string>(url, { responseType: 'text' }),
      url, opciones,
    );
  }

  async postForm(
    url: string,
    campos: Record<string, string>,
    referer: string,
    opciones: OpcionesPeticion = {},
  ): Promise<AxiosResponse<string>> {
    const cuerpo = new URLSearchParams(campos).toString();
    return this.pedirConReintentos(
      () => this.ax.post<string>(url, cuerpo, {
        responseType: 'text',
        maxRedirects: opciones.maxRedirects,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: pjConfig.baseUrl + referer,
          ...(opciones.headers ?? {}),
        },
      }),
      url, opciones,
    );
  }

  async getBinary(url: string, referer: string, opciones: OpcionesPeticion = {}): Promise<AxiosResponse<Buffer>> {
    return this.pedirConReintentos(
      () => this.ax.get<Buffer>(url, {
        responseType: 'arraybuffer',
        headers: { Referer: pjConfig.baseUrl + referer },
      }),
      url, opciones,
    );
  }

  private async pedirConReintentos<T>(
    intento: () => Promise<AxiosResponse<T>>,
    url: string,
    opciones: OpcionesPeticion,
  ): Promise<AxiosResponse<T>> {
    const maxIntentos = opciones.maxIntentos ?? pjConfig.reintentos.maxIntentos;
    let ultimoEstado: number | undefined;

    for (let i = 0; i < maxIntentos; i++) {
      if (opciones.conPausa !== false) {
        await sleep(pjConfig.delayEntrePeticionesMs);
      }

      try {
        const respuesta = await intento();
        ultimoEstado = respuesta.status;

        if (respuesta.status === 429 || respuesta.status >= 500) {
          const espera = this.calcularEspera(respuesta, i);
          log.warn(`HTTP ${respuesta.status} en ${url}. Reintento ${i + 1}/${maxIntentos} en ${Math.round(espera / 1000)}s...`);
          await sleep(espera);
          continue;
        }
        return respuesta;
      } catch (err) {
        const detalle = isAxiosError(err) ? err.code ?? err.message : String(err);
        const espera = calcularBackoff(i, pjConfig.reintentos.baseMs, pjConfig.reintentos.factor, pjConfig.reintentos.maxMs);
        log.warn(`Error de red en ${url} (${detalle}). Reintento ${i + 1}/${maxIntentos} en ${Math.round(espera / 1000)}s...`);
        await sleep(espera);
      }
    }
    throw new ErrorReintentosAgotados(url, ultimoEstado, maxIntentos);
  }

  private calcularEspera(respuesta: AxiosResponse, intento: number): number {
    const retryAfter = respuesta.headers['retry-after'];
    if (retryAfter) {
      const segundos = Number(retryAfter);
      if (Number.isFinite(segundos)) return segundos * 1000;
    }
    return calcularBackoff(intento, pjConfig.reintentos.baseMs, pjConfig.reintentos.factor, pjConfig.reintentos.maxMs);
  }
}
