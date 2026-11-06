// server.js — Contenedor API REST (Node.js + Express) + sirve la SPA.
// Punto de entrada del prototipo. Cablea las rutas con los dos modulos y la seguridad.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import './db.js'; // crea el esquema y carga el seed al arrancar
import { login, requireAuth, requireAdmin } from './auth.js';
import { listarMateriales, crearMaterial, registrarMovimiento, historial } from './inventario.js';
import { reporteStockBajo } from './alertas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Observabilidad basica: un id de correlacion por peticion + log.
app.use((req, res, next) => {
  req.id = randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  const t0 = Date.now();
  res.on('finish', () => console.log(`[${req.id}] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - t0}ms)`));
  next();
});

// --- Observabilidad: endpoint de salud ---
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// --- Seguridad: autenticacion ---
app.post('/api/auth/login', login);

// --- Modulo Inventario y Movimientos (protegido por JWT) ---
app.get('/api/materiales', requireAuth, listarMateriales);
app.post('/api/materiales', requireAuth, requireAdmin, crearMaterial); // solo administrador
app.post('/api/movimientos', requireAuth, registrarMovimiento);
app.get('/api/movimientos', requireAuth, historial);

// --- Modulo Alertas y Reportes (protegido por JWT) ---
app.get('/api/reportes/stock-bajo', requireAuth, reporteStockBajo);

// --- Frontend (SPA minima) servido por el mismo contenedor ---
app.use(express.static(join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Prototipo Inventario escuchando en http://localhost:${PORT}`);
  console.log('Usuarios de prueba:  admin/admin123  ·  operador/operador123');
});
