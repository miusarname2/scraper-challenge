import { Scraper } from './scraper';

async function main() {
  const skipPdfs = process.argv.includes('--no-pdfs');
  const scraper = new Scraper({ downloadPdfs: !skipPdfs });

  try {
    await scraper.run();
  } catch (err: any) {
    console.error(`\n[FATAL] ${err.message}`);
    process.exit(1);
  }
}

main();
