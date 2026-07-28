export interface Documento {
  nro: number;
  expediente: string;
  administrado: string;
  unidadFiscalizable: string;
  sector: string;
  resolucion: string;
  pdfUuid: string | null;
  pdfRowIndex: number;
  pdfDescargado: boolean;
}

export interface ScraperProgress {
  totalRegistros: number;
  totalPaginas: number;
  paginaActual: number;
  documentosExtraidos: number;
  pdfsDescargados: number;
  pdfsConError: string[];
}

export interface SessionState {
  cookie: string;
  viewState: string;
}
