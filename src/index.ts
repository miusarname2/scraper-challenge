import axios from 'axios';
import { mostrarMenu, preguntarSiNo } from './ui/menu';
import { Scraper as OefaScraper } from './scraper';
import { ejecutarScraperPJ } from './pj/scraper/index';
import { sleep } from './util/sleep';

const SITIOS = {
  oefa: {
    nombre: 'OEFA - Tribunal de Fiscalizacion Ambiental',
    url: 'https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml',
    requiereVpn: false,
  },
  pj: {
    nombre: 'Poder Judicial - Jurisprudencia Nacional',
    url: 'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/inicio.xhtml',
    requiereVpn: true,
  },
};

async function verificarConexion(url: string): Promise<boolean> {
  try {
    const res = await axios.get(url, {
      timeout: 15_000,
      validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

function leerArgsPJ(): { maxPaginas: number; sinPdf: boolean } {
  const args = process.argv.slice(2);
  let maxPaginas = 0;
  let sinPdf = false;

  for (const a of args) {
    if (a.startsWith('--max-paginas=')) maxPaginas = parseInt(a.split('=')[1]) || 0;
    if (a === '--sin-pdf' || a === '--no-pdfs') sinPdf = true;
  }

  return { maxPaginas, sinPdf };
}

async function ejecutarOefa(): Promise<void> {
  const { maxPaginas, sinPdf } = leerArgsPJ();
  const scraper = new OefaScraper({ downloadPdfs: !sinPdf, maxPaginas });
  await scraper.run();
}

async function ejecutarPJ(): Promise<void> {
  const { maxPaginas, sinPdf } = leerArgsPJ();
  await ejecutarScraperPJ({
    filtros: { corte: '1' },
    maxPaginas,
    descargarPdf: !sinPdf,
  });
}

async function intentarConectarPJ(): Promise<boolean> {
  const sitio = SITIOS.pj;
  console.log(`\n  Intentando conectar con ${sitio.url} ...`);
  await sleep(500);

  const ok = await verificarConexion(sitio.url);

  if (ok) {
    console.log('  \x1b[32mConexion exitosa.\x1b[0m\n');
    return true;
  }

  console.log('  \x1b[31mNo se pudo conectar (403 Forbidden).\x1b[0m');
  console.log('  \x1b[33mEste sitio requiere una VPN conectada a Peru.\x1b[0m\n');
  return false;
}

async function main(): Promise<void> {
  console.log('\x1b[1m\n  === Scraper de Jurisprudencia ===\x1b[0m\n');

  const seleccion = await mostrarMenu('Selecciona el sitio a scrapear:', [
    {
      label: SITIOS.oefa.nombre,
      value: 'oefa',
      descripcion: '(sin VPN)',
    },
    {
      label: SITIOS.pj.nombre,
      value: 'pj',
      descripcion: '(requiere VPN Peru)',
    },
  ]);

  if (seleccion === 'oefa') {
    const sitio = SITIOS.oefa;
    console.log(`  Intentando conectar con ${sitio.url} ...`);
    await sleep(500);

    const ok = await verificarConexion(sitio.url);
    if (!ok) {
      console.log('  \x1b[31mNo se pudo conectar con el servidor de OEFA.\x1b[0m');
      process.exit(1);
    }
    console.log('  \x1b[32mConexion exitosa.\x1b[0m\n');
    await ejecutarOefa();
    return;
  }

  // Flujo PJ con manejo de VPN
  let conectado = await intentarConectarPJ();

  while (!conectado) {
    const reintentar = await preguntarSiNo(
      '  Deseas reintentar la conexion, o pasar al scraper de OEFA? (s = reintentar, n = OEFA)',
    );

    if (reintentar) {
      conectado = await intentarConectarPJ();
    } else {
      console.log('\n  Cambiando al scraper de OEFA...\n');
      console.log(`  Intentando conectar con ${SITIOS.oefa.url} ...`);
      await sleep(500);
      const ok = await verificarConexion(SITIOS.oefa.url);
      if (!ok) {
        console.log('  \x1b[31mNo se pudo conectar con OEFA.\x1b[0m');
        process.exit(1);
      }
      console.log('  \x1b[32mConexion exitosa.\x1b[0m\n');
      await ejecutarOefa();
      return;
    }
  }

  await ejecutarPJ();
}

main().catch((err) => {
  console.error(`\n[FATAL] ${err.message}`);
  process.exit(1);
});
