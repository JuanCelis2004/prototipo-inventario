// db.js — Capa de acceso a datos: base de datos SQLite (modulo nativo node:sqlite).
// Crea el esquema y carga datos de ejemplo (seed) la primera vez.
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const db = new DatabaseSync(join(__dirname, 'inventario.db'));

// --- Esquema (una sola base de datos relacional, como define el ADR-002) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('administrador','operador'))
  );
  CREATE TABLE IF NOT EXISTS materiales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    unidad TEXT NOT NULL DEFAULT 'und',
    stock INTEGER NOT NULL DEFAULT 0,
    punto_reorden INTEGER NOT NULL DEFAULT 0
  );
  -- Historial de solo agregar (append-only): nunca se edita ni se borra (RAS-2 trazabilidad).
  CREATE TABLE IF NOT EXISTS movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL REFERENCES materiales(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida','traslado')),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    usuario TEXT NOT NULL,
    motivo TEXT,
    fecha TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 32).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  return hash === expectedHash;
}

// --- Datos de ejemplo (idempotente: solo si la tabla esta vacia) ---
export function seed() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
  if (count > 0) return;

  const insUser = db.prepare(
    'INSERT INTO usuarios (username, password_hash, salt, nombre, rol) VALUES (?,?,?,?,?)'
  );
  for (const u of [
    { username: 'admin', password: 'admin123', nombre: 'Juan Celis (Administrador)', rol: 'administrador' },
    { username: 'operador', password: 'operador123', nombre: 'David Forero (Operador)', rol: 'operador' },
  ]) {
    const { salt, hash } = hashPassword(u.password);
    insUser.run(u.username, hash, salt, u.nombre, u.rol);
  }

  const insMat = db.prepare(
    'INSERT INTO materiales (codigo, nombre, unidad, stock, punto_reorden) VALUES (?,?,?,?,?)'
  );
  for (const m of [
    ['TUB-PVC-110', 'Tubo PVC sanitario 110 mm', 'und', 40, 15],
    ['COD-PVC-90', 'Codo PVC 90 grados 1/2"', 'und', 8, 20],
    ['LLA-PASO-12', 'Llave de paso 1/2"', 'und', 25, 10],
    ['TEF-ROLLO', 'Cinta de teflon (rollo)', 'und', 12, 30],
    ['PEG-PVC-250', 'Pegante PVC 250 ml', 'tarro', 18, 8],
  ]) {
    insMat.run(...m);
  }
  console.log('[seed] Datos de ejemplo cargados (2 usuarios, 5 materiales).');
}

seed();

// Permite ejecutar "npm run seed" directamente.
if (process.argv.includes('--seed')) {
  console.log('Base de datos lista.');
}
