// dashboard.js — Indicadores (KPIs) del inventario. Parte del modulo de Reportes.
import { db } from './db.js';
import { evaluarEstado } from './alertas.js';

export function dashboard(_req, res) {
  const materiales = db.prepare('SELECT * FROM materiales').all();
  const hoy = new Date().toISOString().slice(0, 10);

  const valor_inventario = materiales.reduce((s, m) => s + m.stock * m.costo_unitario, 0);
  const total_unidades = materiales.reduce((s, m) => s + m.stock, 0);
  const estados = materiales.map(evaluarEstado);
  const alertas = estados.filter((e) => e !== 'OK').length;
  const criticos = estados.filter((e) => e === 'CRITICO').length;
  const movimientos_hoy = db.prepare("SELECT COUNT(*) AS n FROM movimientos WHERE substr(fecha,1,10) = ?").get(hoy).n;

  // Agregado por categoria.
  const cats = {};
  for (const m of materiales) {
    const c = (cats[m.categoria] ??= { categoria: m.categoria, materiales: 0, valor: 0, alertas: 0, unidades: 0 });
    c.materiales++; c.unidades += m.stock; c.valor += m.stock * m.costo_unitario;
    if (evaluarEstado(m) !== 'OK') c.alertas++;
  }

  res.json({
    kpis: {
      valor_inventario: Math.round(valor_inventario),
      total_materiales: materiales.length,
      total_unidades,
      alertas,
      criticos,
      movimientos_hoy,
    },
    por_categoria: Object.values(cats).map((c) => ({ ...c, valor: Math.round(c.valor) })).sort((a, b) => b.valor - a.valor),
  });
}
