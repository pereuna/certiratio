// Ajaa WASI-ohjelman (GOOS=wasip1) Noden WASI-tuella: node tools/run-wasip1.mjs ohjelma.wasm args…
// Nykyhakemisto näkyy ohjelmalle hakemistona /work.
import { readFileSync } from 'node:fs';
import { WASI } from 'node:wasi';
const [file, ...args] = process.argv.slice(2);
const wasi = new WASI({ version: 'preview1', args: [file, ...args], env: {}, preopens: { '/work': process.cwd() }, returnOnExit: true });
const { instance } = await WebAssembly.instantiate(readFileSync(file), wasi.getImportObject());
process.exitCode = wasi.start(instance);
