// auth.js — Modulo central de seguridad (RAS-3): autenticacion con JWT y
// autorizacion por roles. Es el "Auth Middleware" del diagrama de componentes.
import jwt from 'jsonwebtoken';
import { db, verifyPassword } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-no-usar-en-produccion';
const JWT_EXPIRA = '2h';

export function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username y password son obligatorios' });
  const user = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }
  const token = jwt.sign(
    { sub: user.id, username: user.username, nombre: user.nombre, rol: user.rol },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRA }
  );
  res.json({ token, nombre: user.nombre, rol: user.rol, username: user.username });
}

export function me(req, res) {
  res.json({ username: req.user.username, nombre: req.user.nombre, rol: req.user.rol });
}

// Middleware: exige un token JWT valido en la cabecera Authorization.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Falta el token (Authorization: Bearer ...)' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

// Middleware: exige rol de administrador (minimo privilegio).
export function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'administrador') return res.status(403).json({ error: 'Requiere rol de administrador' });
  next();
}
