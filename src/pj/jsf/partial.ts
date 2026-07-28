export interface RespuestaParcial {
  html: string;
  viewState?: string;
}

export function parsearRespuestaParcial(xml: string): RespuestaParcial {
  let viewState: string | undefined;
  const partes: string[] = [];

  const regex = /<update id="([^"]+)"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    if (m[1] === 'javax.faces.ViewState') {
      viewState = m[2].trim();
    } else {
      partes.push(m[2]);
    }
  }

  return { html: partes.join('\n'), viewState };
}
