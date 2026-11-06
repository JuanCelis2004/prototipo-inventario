// inventario.js — Modulo 1: Inventario y Movimientos.
// Regla de negocio central (RAS-1): un movimiento actualiza el stock en UNA SOLA
// transaccion ACID; si algo falla, se revierte todo (rollback) y el stock no cambia.
import { db } from './db.js';
import { evaluarReorden } from './alertas.js';

export function listarMateriales(_req, res) {
  const materiales = db.prepare('SELECT * FROM materiales ORDER BY nombre').all();
  // El estado lo decide el Modulo de Alertas -> comunicacion entre modulos.
  res.json(materiales.map((m) => ({ ...m, ...evaluarReorden(m) })));
}

export function crearMaterial(req, res) {
  const { codigo, nombre, unidad = 'und', stock = 0, punto_reorden = 0 } = req.body || {};
  if (!codigo || !nombre) return res.status(400).json({ error: 'codigo y nombre son obligatorios' });
  try {
    const info = db
      .prepare('INSERT INTO materiales (codigo, nombre, unidad, stock, punto_reorden) VALUES (?,?,?,?,?)')
      .run(codigo, nombre, unidad, Number(stock), Number(punto_reorden));
    res.status(201).json({ id: info.lastInsertRowid, codigo, nombre, unidad, stock, punto_reorden });
  } catch (e) {
    res.status(409).json({ error: 'El codigo ya existe', detalle: String(e.message) });
  }
}

// POST /api/movimientos  -> registra entrada/salida/traslado y actualiza el stock.
// Esta es la "funcionalidad completa de extremo a extremo que cruza ambos modulos".
export function registrarMovimiento(req, res) {
  const { material_id, tipo, cantidad, motivo = '' } = req.body || {};
  const cant = Number(cantidad);
  if (!material_id || !['entrada', 'salida', 'traslado'].includes(tipo) || !(cant > 0)) {
    return res.status(400).json({ error: 'material_id, tipo (entrada|salida|traslado) y cantidad>0 son obligatorios' });
  }

  const material = db.prepare('SELECT * FROM materiales WHERE id = ?').get(material_id);
  if (!material) return res.status(404).json({ error: 'Material no encontrado' });

  const delta = tipo === 'entrada' ? cant : -cant; // salida y traslado descuentan
  const nuevoStock = material.stock + delta;
  if (nuevoStock < 0) {
    // Integridad: no hay stock suficiente -> se rechaza y NADA cambia.
    return res.status(409).json({ error: `Stock insuficiente: hay ${material.stock}, se pidieron ${cant}` });
  }

  // --- Transaccion ACID: insertar movimiento + actualizar stock de forma atomica ---
  try {
    db.exec('BEGIN');
    db.prepare(
      'INSERT INTO movimientos (material_id, tipo, cantidad, usuario, motivo) VALUES (?,?,?,?,?)'
    ).run(material_id, tipo, cant, req.user.username, motivo);
    db.prepare('UPDATE materiales SET stock = ? WHERE id = ?').run(nuevoStock, material_id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK'); // si algo falla, el stock queda igual que antes
    return res.status(500).json({ error: 'No se pudo registrar el movimiento', detalle: String(e.message) });
  }

  const actualizado = db.prepare('SELECT * FROM materiales WHERE id = ?').get(material_id);
  const alerta = evaluarReorden(actualizado); // <-- Modulo 2 (Alertas) evalua el punto de reorden
  res.status(201).json({
    movimiento: { material_id, tipo, cantidad: cant, usuario: req.user.username, motivo },
    material: actualizado,
    ...alerta,
  });
}

export function historial(req, res) {
  const { material_id } = req.query;
  const rows = material_id
    ? db.prepare('SELECT * FROM movimientos WHERE material_id = ? ORDER BY id DESC').all(material_id)
    : db.prepare('SELECT * FROM movimientos ORDER BY id DESC LIMIT 50').all();
  res.json(rows);
}
