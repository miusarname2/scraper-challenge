import * as fs from 'fs';
import * as path from 'path';

export interface DescargaFallida {
  id: string;
  uuid: string;
  pagina: number;
  motivo: string;
  pdf?: unknown;
  fecha: string;
}

export class RegistroFallidos {
  private fallidos: DescargaFallida[] = [];

  constructor(private readonly ruta: string) {
    this.cargar();
  }

  private cargar(): void {
    if (fs.existsSync(this.ruta)) {
      try { this.fallidos = JSON.parse(fs.readFileSync(this.ruta, 'utf-8')); }
      catch { this.fallidos = []; }
    }
  }

  registrar(item: DescargaFallida): void {
    this.fallidos = this.fallidos.filter((f) => f.id !== item.id);
    this.fallidos.push(item);
    this.guardar();
  }

  resolver(id: string): void {
    const antes = this.fallidos.length;
    this.fallidos = this.fallidos.filter((f) => f.id !== id);
    if (this.fallidos.length !== antes) this.guardar();
  }

  listar(): DescargaFallida[] {
    return [...this.fallidos];
  }

  private guardar(): void {
    fs.mkdirSync(path.dirname(this.ruta), { recursive: true });
    fs.writeFileSync(this.ruta, JSON.stringify(this.fallidos, null, 2), 'utf-8');
  }
}
