import * as cheerio from 'cheerio';

export interface FormularioJsf {
  id: string;
  campos: Record<string, string>;
  viewState: string;
}

export function leerFormulario(html: string, formId = 'formBuscador'): FormularioJsf {
  const $ = cheerio.load(html);
  const form = $(`form#${formId.replace(/:/g, '\\:')}`);
  if (form.length === 0) throw new Error(`No se encontro el formulario "${formId}"`);

  const campos: Record<string, string> = {};

  form.find('input').each((_, el) => {
    const name = $(el).attr('name');
    if (!name) return;
    const type = ($(el).attr('type') ?? 'text').toLowerCase();
    if (['submit', 'button', 'image', 'reset'].includes(type)) return;
    if (['checkbox', 'radio'].includes(type)) {
      campos[name] = $(el).attr('checked') !== undefined ? $(el).attr('value') ?? 'on' : '';
      return;
    }
    campos[name] = $(el).attr('value') ?? '';
  });

  form.find('select').each((_, el) => {
    const name = $(el).attr('name');
    if (!name) return;
    const seleccionada = $(el).find('option[selected]').first();
    const opcion = seleccionada.length ? seleccionada : $(el).find('option').first();
    campos[name] = opcion.attr('value') ?? '';
  });

  form.find('textarea').each((_, el) => {
    const name = $(el).attr('name');
    if (!name) return;
    campos[name] = $(el).text() ?? '';
  });

  const viewState = campos['javax.faces.ViewState'] ?? '';
  if (!viewState) throw new Error('El formulario no tiene javax.faces.ViewState');

  return { id: formId, campos, viewState };
}

export function extraerParametrosBoton(onclick: string): Record<string, string> | null {
  const llamada = onclick.match(/mojarra\.jsfcljs\([^,]+,\s*(\{[^}]*\})/);
  if (!llamada) return null;

  const objeto = llamada[1];
  const params: Record<string, string> = {};
  const regex = /\\?'([^'\\]+)\\?'\s*:\s*\\?'([^'\\]*)\\?'/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(objeto)) !== null) {
    params[m[1]] = m[2];
  }
  return Object.keys(params).length ? params : null;
}
