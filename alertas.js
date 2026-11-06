// alertas.js — Modulo 2: Alertas y Reportes (RAS-4).
// Se comunica de forma sincrona con Inventario: tras cada movimiento evalua si el
// stock llego al punto de reorden. Las notificaciones se SIMULAN (sin correo real).
import { db } from './db.js';

// Estado de un material segun su stock vs. punto de reorden.
//  CRITICO: agotado o <= mitad del punto de reorden.
//  BAJO:    en o por debajo del punto de reorden.
//  OK:      por encima del punto de reorden.
export function evaluarEstado(m) {
  if (m.stock === 0 || m.stock * 2 <= m.punto_reorden) return 'CRITICO';
  if (m.stock <= m.punto_reorden) return 'BAJO';
  return 'OK';
}

// Enriquece un material con estado, valor y sugerencia de reposicion.
export function infoMaterial(m) {
  const estado = evaluarEstado(m);
  const en_alerta = estado !== 'OK';
  // Sugerir reponer hasta el doble del punto de reorden (colchon de seguridad).
  const sugerencia_compra = en_alerta ? Math.max(1, m.punto_reorden * 2 - m.stock) : 0;
  if (en_alerta) {
    // Notificacion simulada (en produccion: cola asincrona hacia un proveedor real).
    console.log(`[ALERTA simulada] ${m.codigo} ${estado}: stock ${m.stock} <= reorden ${m.punto_reorden}`);
  }
  return {
    ...m,
    estado,
    en_alerta,
    sugerencia_compra,
    valor_stock: Math.round(m.stock * m.costo_unitario),
  };
}

// GET /api/reportes/stock-bajo -> materiales en alerta, con sugerencia de compra.
export function reporteStockBajo(_req, res) {
  const rows = db
    .prepare('SELECT * FROM materiales WHERE stock <= punto_reorden ORDER BY (CAST(stock AS REAL)/NULLIF(punto_reorden,0)) ASC')
    .all()
    .map(infoMaterial);
  const valor_reposicion = rows.reduce((s, m) => s + m.sugerencia_compra * m.costo_unitario, 0);
  res.json({ total: rows.length, valor_reposicion: Math.round(valor_reposicion), materiales: rows });
}
