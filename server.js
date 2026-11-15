// server.js — Contenedor API REST (Node.js + Express) + sirve la SPA.
// Punto de entrada: cablea las rutas con los modulos, la seguridad y el dashboard.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from './db.js';
import { login, me, requireAuth, requireAdmin } from './auth.js';
import {
  listarMateriales, detalleMaterial, categorias, crearMaterial,
  actualizarMaterial, registrarMovimiento, historial,
} from './inventario.js';
import { reporteStockBajo, exportarInventarioCSV } from './alertas.js';
import { dashboard } from './dashboard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Observabilidad: id de correlacion por peticion + log.
app.use((req, res, next) => {
  req.id = randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  const t0 = Date.now();
  res.on('finish', () => console.log(`[${req.id}] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - t0}ms)`));
  next();
});

// Observabilidad: salud del servicio + conteos.
app.get('/health', (_req, res) => {
  const materiales = db.prepare('SELECT COUNT(*) AS n FROM materiales').get().n;
  const movimientos = db.prepare('SELECT COUNT(*) AS n FROM movimientos').get().n;
  res.json({ status: 'ok', uptime: Math.round(process.uptime()), materiales, movimientos });
});

// Seguridad.
app.post('/api/auth/login', login);
app.get('/api/me', requireAuth, me);

// Dashboard / KPIs.
app.get('/api/dashboard', requireAuth, dashboard);

// Modulo Inventario y Movimientos.
app.get('/api/categorias', requireAuth, categorias);
app.get('/api/materiales', requireAuth, listarMateriales);
app.get('/api/materiales/:id', requireAuth, detalleMaterial);
app.post('/api/materiales', requireAuth, requireAdmin, crearMaterial);
app.patch('/api/materiales/:id', requireAuth, requireAdmin, actualizarMaterial);
app.post('/api/movimientos', requireAuth, registrarMovimiento);
app.get('/api/movimientos', requireAuth, historial);

// Modulo Alertas y Reportes.
app.get('/api/reportes/stock-bajo', requireAuth, reporteStockBajo);
app.get('/api/reportes/inventario.csv', requireAuth, exportarInventarioCSV);

// Frontend (SPA) servido por el mismo contenedor.
app.use(express.static(join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Prototipo Inventario escuchando en http://localhost:${PORT}`);
  console.log('Usuarios de prueba:  admin/admin123  ·  operador/operador123');
});
