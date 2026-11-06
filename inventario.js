// inventario.js — Modulo 1: Inventario y Movimientos.
// Regla de negocio central (RAS-1): un movimiento actualiza el stock en UNA SOLA
// transaccion ACID; si algo falla, se revierte todo (rollback) y el stock no cambia.
import { db } from './db.js';
import { infoMaterial } from './alertas.js';

// GET /api/materiales?q=&categoria=&estado=&page=&size=
export function listarMateriales(req, res) {
  const { q = '', categoria = '', estado = '' } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Math.max(1, Number(req.query.size) || 50));

  const where = [];
  const params = {};
  if (q) { where.push('(LOWER(nombre) LIKE :q OR LOWER(codigo) LIKE :q OR LOWER(proveedor) LIKE :q)'); params.q = `%${String(q).toLowerCase()}%`; }
  if (categoria) { where.push('categoria = :cat'); params.cat = categoria; }
  const sql = 'SELECT * FROM materiales' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY nombre';

  let items = db.prepare(sql).all(params).map(infoMaterial);
  if (estado) items = items.filter((m) => m.estado === estado);

  const total = items.length;
  const inicio = (page - 1) * size;
  res.json({ total, page, size, items: items.slice(inicio, inicio + size) });
}

export function detalleMaterial(req, res) {
  const m = db.prepare('SELECT * FROM materiales WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Material no encontrado' });
  const movimientos = db.prepare('SELECT * FROM movimientos WHERE material_id = ? ORDER BY id DESC LIMIT 20').all(m.id);
  res.json({ ...infoMaterial(m), movimientos });
}

export function categorias(_req, res) {
  res.json(db.prepare('SELECT DISTINCT categoria FROM materiales ORDER BY categoria').all().map((r) => r.categoria));
}

export function crearMaterial(req, res) {
  const { codigo, nombre, categoria = 'General', unidad = 'und', ubicacion = 'Almacen central', proveedor = '', costo_unitario = 0, stock = 0, punto_reorden = 0 } = req.body || {};
  if (!codigo || !nombre) return res.status(400).json({ error: 'codigo y nombre son obligatorios' });
  try {
    const info = db.prepare(
      'INSERT INTO materiales (codigo,nombre,categoria,unidad,ubicacion,proveedor,costo_unitario,stock,punto_reorden) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(codigo, nombre, categoria, unidad, ubicacion, proveedor, Number(costo_unitario), Number(stock), Number(punto_reorden));
    res.status(201).json(infoMaterial(db.prepare('SELECT * FROM materiales WHERE id = ?').get(info.lastInsertRowid)));
  } catch (e) {
    res.status(409).json({ error: 'El codigo ya existe', detalle: String(e.message) });
  }
}

// PATCH /api/materiales/:id -> ajustar parametros (solo admin).
export function actualizarMaterial(req, res) {
  const m = db.prepare('SELECT * FROM materiales WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Material no encontrado' });
  const { punto_reorden = m.punto_reorden, costo_unitario = m.costo_unitario, proveedor = m.proveedor } = req.body || {};
  db.prepare('UPDATE materiales SET punto_reorden = ?, costo_unitario = ?, proveedor = ? WHERE id = ?')
    .run(Number(punto_reorden), Number(costo_unitario), proveedor, m.id);
  res.json(infoMaterial(db.prepare('SELECT * FROM materiales WHERE id = ?').get(m.id)));
}

// POST /api/movimientos  -> entrada | salida | traslado | ajuste.
// Funcionalidad completa de extremo a extremo que CRUZA ambos modulos.
export function registrarMovimiento(req, res) {
  const { material_id, tipo, cantidad, ubicacion, motivo = '' } = req.body || {};
  const cant = Number(cantidad);
  if (!material_id || !['entrada', 'salida', 'traslado', 'ajuste'].includes(tipo) || !(cant >= 0)) {
    return res.status(400).json({ error: 'material_id, tipo (entrada|salida|traslado|ajuste) y cantidad son obligatorios' });
  }

  const material = db.prepare('SELECT * FROM materiales WHERE id = ?').get(material_id);
  if (!material) return res.status(404).json({ error: 'Material no encontrado' });

  // Calcular el nuevo stock segun el tipo de movimiento.
  let nuevoStock = material.stock;
  let nuevaUbic = material.ubicacion;
  if (tipo === 'entrada') nuevoStock = material.stock + cant;
  else if (tipo === 'salida') nuevoStock = material.stock - cant;
  else if (tipo === 'ajuste') nuevoStock = cant; // recuento fisico: stock absoluto
  else if (tipo === 'traslado') nuevaUbic = ubicacion || material.ubicacion; // mueve de ubicacion, sin cambiar total

  if (nuevoStock < 0) {
    // Integridad: no hay stock suficiente -> se rechaza y NADA cambia.
    return res.status(409).json({ error: `Stock insuficiente: hay ${material.stock}, se pidieron ${cant}` });
  }

  // --- Transaccion ACID: registrar movimiento + actualizar material de forma atomica ---
  try {
    db.exec('BEGIN');
    db.prepare('INSERT INTO movimientos (material_id,tipo,cantidad,stock_resultante,ubicacion,usuario,motivo) VALUES (?,?,?,?,?,?,?)')
      .run(material_id, tipo, cant, nuevoStock, ubicacion || nuevaUbic, req.user.username, motivo);
    db.prepare('UPDATE materiales SET stock = ?, ubicacion = ? WHERE id = ?').run(nuevoStock, nuevaUbic, material_id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK'); // si algo falla, el stock queda igual que antes
    return res.status(500).json({ error: 'No se pudo registrar el movimiento', detalle: String(e.message) });
  }

  const actualizado = infoMaterial(db.prepare('SELECT * FROM materiales WHERE id = ?').get(material_id));
  res.status(201).json({
    movimiento: { material_id, tipo, cantidad: cant, usuario: req.user.username, motivo },
    material: actualizado,
    estado: actualizado.estado,
    alerta: actualizado.en_alerta
      ? `${actualizado.estado}: reponer ${actualizado.nombre} (stock ${actualizado.stock} <= reorden ${actualizado.punto_reorden}). Sugerido: +${actualizado.sugerencia_compra}.`
      : null,
  });
}

// GET /api/movimientos?material_id=&tipo=&limit=
export function historial(req, res) {
  const { material_id, tipo } = req.query;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const where = [];
  const params = {};
  if (material_id) { where.push('mo.material_id = :mid'); params.mid = Number(material_id); }
  if (tipo) { where.push('mo.tipo = :tipo'); params.tipo = tipo; }
  const sql = `SELECT mo.*, ma.codigo, ma.nombre FROM movimientos mo
               JOIN materiales ma ON ma.id = mo.material_id
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY mo.id DESC LIMIT ${limit}`;
  res.json(db.prepare(sql).all(params));
}
