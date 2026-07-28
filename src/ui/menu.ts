import * as readline from 'readline';

export interface OpcionMenu {
  label: string;
  value: string;
  descripcion?: string;
}

/**
 * Menu interactivo en terminal: el usuario se mueve con flechas arriba/abajo
 * y confirma con Enter. Funciona con stdin en raw mode.
 */
export function mostrarMenu(titulo: string, opciones: OpcionMenu[]): Promise<string> {
  return new Promise((resolve) => {
    let seleccion = 0;

    const render = () => {
      // Limpia las lineas anteriores del menu
      process.stdout.write(`\x1b[${opciones.length + 2}A\x1b[0J`);
      dibujar();
    };

    const dibujar = () => {
      console.log(`\n\x1b[1m${titulo}\x1b[0m`);
      opciones.forEach((opt, i) => {
        const cursor = i === seleccion ? '\x1b[36m> ' : '  ';
        const reset = '\x1b[0m';
        const desc = opt.descripcion ? `  \x1b[90m${opt.descripcion}${reset}` : '';
        console.log(`${cursor}${opt.label}${reset}${desc}`);
      });
    };

    // Dibujar por primera vez
    dibujar();

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const onKey = (key: Buffer) => {
      const str = key.toString();

      // Flecha arriba
      if (str === '\x1b[A' || str === '\x1bOA') {
        seleccion = seleccion > 0 ? seleccion - 1 : opciones.length - 1;
        render();
      }
      // Flecha abajo
      else if (str === '\x1b[B' || str === '\x1bOB') {
        seleccion = seleccion < opciones.length - 1 ? seleccion + 1 : 0;
        render();
      }
      // Enter
      else if (str === '\r' || str === '\n') {
        process.stdin.removeListener('data', onKey);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        rl.close();
        console.log(`\n  Seleccionado: \x1b[1m${opciones[seleccion].label}\x1b[0m\n`);
        resolve(opciones[seleccion].value);
      }
      // Ctrl+C
      else if (str === '\x03') {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        rl.close();
        process.exit(0);
      }
    };

    process.stdin.on('data', onKey);
  });
}

/** Pregunta simple de si/no en terminal */
export function preguntarSiNo(pregunta: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${pregunta} (s/n): `, (resp) => {
      rl.close();
      resolve(resp.trim().toLowerCase().startsWith('s'));
    });
  });
}
