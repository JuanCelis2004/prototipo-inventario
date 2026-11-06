// db.js — Capa de acceso a datos: base de datos SQLite (modulo nativo node:sqlite).
// Crea el esquema y carga datos de ejemplo (seed) la primera vez.
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const db = new DatabaseSync(join(__dirname, 'inventario.db'));
db.exec('PRAGMA foreign_keys = ON;');

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
    categoria TEXT NOT NULL DEFAULT 'General',
    unidad TEXT NOT NULL DEFAULT 'und',
    ubicacion TEXT NOT NULL DEFAULT 'Almacen central',
    proveedor TEXT,
    costo_unitario REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    punto_reorden INTEGER NOT NULL DEFAULT 0
  );
  -- Historial de solo agregar (append-only): nunca se edita ni se borra (RAS-2 trazabilidad).
  CREATE TABLE IF NOT EXISTS movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL REFERENCES materiales(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida','traslado','ajuste')),
    cantidad INTEGER NOT NULL CHECK (cantidad >= 0),
    stock_resultante INTEGER NOT NULL,
    ubicacion TEXT,
    usuario TEXT NOT NULL,
    motivo TEXT,
    fecha TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 32).toString('hex') };
}
export function verifyPassword(password, salt, expectedHash) {
  return hashPassword(password, salt).hash === expectedHash;
}

// --- Datos de ejemplo (idempotente: solo si la tabla esta vacia) ---
export function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0) return;

  const insUser = db.prepare('INSERT INTO usuarios (username,password_hash,salt,nombre,rol) VALUES (?,?,?,?,?)');
  for (const u of [
    { username: 'admin', password: 'admin123', nombre: 'Juan Celis', rol: 'administrador' },
    { username: 'operador', password: 'operador123', nombre: 'David Forero', rol: 'operador' },
  ]) {
    const { salt, hash } = hashPassword(u.password);
    insUser.run(u.username, hash, salt, u.nombre, u.rol);
  }

  const insMat = db.prepare(
    'INSERT INTO materiales (codigo,nombre,categoria,unidad,ubicacion,proveedor,costo_unitario,stock,punto_reorden) VALUES (?,?,?,?,?,?,?,?,?)'
  );
  // [codigo, nombre, categoria, unidad, ubicacion, proveedor, costo, stock, reorden]
  const materiales = [
    ['TUB-PVC-110', 'Tubo PVC sanitario 110 mm', 'Tuberia', 'und', 'Almacen central', 'Pavco', 18500, 40, 15],
    ['TUB-PVC-050', 'Tubo PVC presion 1/2"', 'Tuberia', 'und', 'Almacen central', 'Pavco', 9200, 60, 20],
    ['COD-PVC-90', 'Codo PVC 90 grados 1/2"', 'Accesorios', 'und', 'Almacen central', 'Gerfor', 1200, 8, 20],
    ['TEE-PVC-050', 'Tee PVC 1/2"', 'Accesorios', 'und', 'Frente Norte', 'Gerfor', 1500, 34, 15],
    ['LLA-PASO-12', 'Llave de paso 1/2"', 'Valvulas', 'und', 'Almacen central', 'Grival', 14800, 25, 10],
    ['VAL-CHEQ-34', 'Valvula cheque 3/4"', 'Valvulas', 'und', 'Almacen central', 'Red White', 32000, 6, 8],
    ['TEF-ROLLO', 'Cinta de teflon (rollo)', 'Sellantes', 'und', 'Frente Norte', 'Teflex', 900, 12, 30],
    ['PEG-PVC-250', 'Pegante PVC 250 ml', 'Sellantes', 'tarro', 'Almacen central', 'Pavco', 16500, 18, 8],
    ['SIL-GAS-300', 'Silicona para gas 300 ml', 'Gas', 'tubo', 'Almacen central', 'Sika', 21000, 3, 10],
    ['MAN-GAS-12', 'Manguera gas flexible 1/2"', 'Gas', 'm', 'Frente Sur', 'Flexitubo', 8700, 45, 20],
    ['SOL-SOLD-14', 'Soldadura PVC 1/4 gal', 'Sellantes', 'gal', 'Almacen central', 'Pavco', 48000, 5, 6],
    ['ABR-TUB-110', 'Abrazadera tubo 110 mm', 'Accesorios', 'und', 'Almacen central', 'Gerfor', 2600, 70, 25],
  ];
  for (const m of materiales) insMat.run(...m);

  // Historial de ejemplo (incluye movimientos de hoy para los KPIs).
  const insMov = db.prepare(
    'INSERT INTO movimientos (material_id,tipo,cantidad,stock_resultante,ubicacion,usuario,motivo,fecha) VALUES (?,?,?,?,?,?,?,?)'
  );
  const hoy = new Date().toISOString().slice(0, 10);
  const movs = [
    [1, 'entrada', 50, 50, 'Almacen central', 'admin', 'Compra inicial', `${hoy} 08:12:00`],
    [1, 'salida', 10, 40, 'Frente Norte', 'operador', 'Despacho frente Norte', `${hoy} 09:40:00`],
    [3, 'salida', 12, 8, 'Frente Sur', 'operador', 'Instalacion red sanitaria', `${hoy} 10:05:00`],
    [9, 'salida', 7, 3, 'Frente Sur', 'operador', 'Conexion gas cocina', `${hoy} 11:20:00`],
    [7, 'ajuste', 12, 12, 'Frente Norte', 'admin', 'Conteo fisico de bodega', `${hoy} 12:00:00`],
  ];
  for (const m of movs) insMov.run(...m);
  console.log('[seed] Datos de ejemplo cargados (2 usuarios, 12 materiales, 5 movimientos).');
}

seed();
if (process.argv.includes('--seed')) console.log('Base de datos lista.');
