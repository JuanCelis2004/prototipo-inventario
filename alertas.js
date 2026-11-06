// alertas.js — Modulo 2: Alertas y Reportes (RAS-4).
// Se comunica de forma sincrona con Inventario: tras cada movimiento evalua si el
// stock llego al punto de reorden. Las notificaciones se SIMULAN (sin correo real).
import { db } from './db.js';

// Evalua el punto de reorden de un material y devuelve su estado.
export function evaluarReorden(material) {
  const bajo = material.stock <= material.punto_reorden;
  if (bajo) {
    // Notificacion simulada (en produccion: cola asincrona hacia un proveedor real).
    console.log(`[ALERTA simulada] ${material.codigo} en stock bajo: ${material.stock} <= ${material.punto_reorden}`);
  }
  return {
    estado: bajo ? 'STOCK_BAJO' : 'OK',
    alerta: bajo
      ? `Reponer ${material.nombre}: stock ${material.stock} <= punto de reorden ${material.punto_reorden}`
      : null,
  };
}

// GET /api/reportes/stock-bajo -> materiales en o por debajo del punto de reorden.
export function reporteStockBajo(_req, res) {
  const rows = db
    .prepare('SELECT * FROM materiales WHERE stock <= punto_reorden ORDER BY stock ASC')
    .all();
  res.json(rows.map((m) => ({ ...m, ...evaluarReorden(m) })));
}
