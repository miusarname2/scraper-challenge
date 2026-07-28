import * as cheerio from 'cheerio';
import { PjHttpClient } from '../http/client';
import { pjConfig } from '../config';
import { log } from '../../util/logger';
import { leerFormulario, extraerParametrosBoton, FormularioJsf } from '../jsf/form';
import { parsearRespuestaParcial } from '../jsf/partial';

export interface Filtros {
  corte?: string;
  anio?: string;
  especialidad?: string;
  distrito?: string;
  sala?: string;
  texto?: string;
}

export class Buscador {
  private formInicio!: FormularioJsf;
  private paramsBoton!: Record<string, string>;
  private clavePagina!: string;
  private formResultado: FormularioJsf | null = null;
  private idsScroller: string[] = [];

  constructor(private readonly http: PjHttpClient) {}

  async iniciarSesion(): Promise<void> {
    log.info('Abriendo la pagina de inicio para crear la sesion...');
    const res = await this.http.get(pjConfig.paginaInicio);
    if (res.status !== 200) throw new Error(`Inicio respondio HTTP ${res.status}`);

    this.formInicio = leerFormulario(res.data);
    this.paramsBoton = this.ubicarBotonBuscar(res.data);
    this.clavePagina = this.detectarClavePagina(this.paramsBoton);
    log.ok('Sesion lista.');
  }

  async buscar(filtros: Filtros): Promise<string> {
    if (!this.formInicio) throw new Error('Hay que llamar a iniciarSesion() antes');

    const campos: Record<string, string> = { ...this.formInicio.campos };
    this.aplicarFiltros(campos, filtros);
    Object.assign(campos, this.paramsBoton);
    campos[this.clavePagina] = '1';

    log.info('Enviando busqueda...');
    const post = await this.http.postForm(pjConfig.paginaInicio, campos, pjConfig.paginaInicio, {
      maxRedirects: 0,
    });
    if (post.status !== 302 && post.status !== 200) {
      throw new Error(`La busqueda respondio HTTP ${post.status}`);
    }

    const res = await this.http.get(pjConfig.paginaResultado);
    if (res.status !== 200) throw new Error(`Resultados respondio HTTP ${res.status}`);

    this.formResultado = leerFormulario(res.data);
    this.idsScroller = this.detectarScrollers(res.data);
    return res.data;
  }

  async paginar(pagina: number): Promise<string> {
    if (!this.formResultado) throw new Error('Hay que llamar a buscar() antes');
    const scroller = this.idsScroller[0];
    if (!scroller) throw new Error('No se detecto el dataScroller');

    const campos: Record<string, string> = { ...this.formResultado.campos };
    Object.assign(campos, {
      'javax.faces.partial.ajax': 'true',
      'javax.faces.source': scroller,
      'javax.faces.partial.execute': scroller,
      'javax.faces.partial.render': [pjConfig.idPanel, ...this.idsScroller].join(' '),
      'org.richfaces.ajax.component': scroller,
      [scroller]: scroller,
      [`${scroller}:page`]: String(pagina),
      'AJAX:EVENTS_COUNT': '1',
    });

    log.info(`Pidiendo pagina ${pagina}...`);
    const res = await this.http.postForm(pjConfig.paginaResultado, campos, pjConfig.paginaResultado, {
      headers: {
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (res.status !== 200) throw new Error(`Paginacion respondio HTTP ${res.status}`);

    const parcial = parsearRespuestaParcial(res.data);
    if (parcial.viewState) {
      this.formResultado.campos['javax.faces.ViewState'] = parcial.viewState;
      this.formResultado.viewState = parcial.viewState;
    }
    return parcial.html;
  }

  private aplicarFiltros(campos: Record<string, string>, f: Filtros): void {
    if (f.corte !== undefined) campos['formBuscador:buCorte'] = f.corte;
    if (f.anio !== undefined) campos['formBuscador:buAnio'] = f.anio;
    if (f.especialidad !== undefined) campos['formBuscador:buEspecialidad'] = f.especialidad;
    if (f.distrito !== undefined) campos['formBuscador:buDistrito'] = f.distrito;
    if (f.sala !== undefined) campos['formBuscador:buSala'] = f.sala;
    if (f.texto !== undefined) campos['formBuscador:txtBusqueda'] = f.texto;
  }

  private ubicarBotonBuscar(html: string): Record<string, string> {
    const $ = cheerio.load(html);
    const candidatos: Record<string, string>[] = [];

    $('input[type="image"], a[onclick], input[type="submit"]').each((_, el) => {
      const onclick = $(el).attr('onclick') ?? '';
      if (!onclick.includes('forward') || !onclick.includes('buscar')) return;
      const params = extraerParametrosBoton(onclick);
      if (params && params['forward'] === 'buscar') candidatos.push(params);
    });

    if (candidatos.length === 0) throw new Error('No se encontro el boton Buscar');
    return candidatos.find((p) => p['busqueda'] !== 'especializada') ?? candidatos[0];
  }

  private detectarClavePagina(params: Record<string, string>): string {
    const porValorUno = Object.entries(params).find(
      ([clave, valor]) => valor === '1' && clave.startsWith('formBuscador:'),
    );
    if (porValorUno) return porValorUno[0];
    const claves = Object.keys(params).filter((k) => k.startsWith('formBuscador:j_idt'));
    if (claves.length) return claves[claves.length - 1];
    throw new Error('No se pudo identificar el parametro de pagina');
  }

  private detectarScrollers(html: string): string[] {
    const $ = cheerio.load(html);
    const ids = new Set<string>();
    $('.rf-ds[id], [id*="data"][class*="rf-ds"]').each((_, el) => {
      const id = $(el).attr('id');
      if (id && /:data\d+$/.test(id)) ids.add(id);
    });
    if (ids.size === 0) {
      const re = /id="(formBuscador:data\d+)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) ids.add(m[1]);
    }
    return [...ids];
  }
}
