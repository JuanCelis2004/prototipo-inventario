# Prototipo mínimo — Sistema de Gestión de Inventarios

Prototipo que **demuestra la arquitectura** del proyecto (JC Instalaciones) de extremo a
extremo. No es un producto terminado: implementa una funcionalidad completa que cruza los
dos módulos principales.

- **Estilo:** monolito modular en capas (MVC).
- **Backend:** Node.js + Express (contenedor API REST).
- **Base de datos:** SQLite mediante el módulo nativo `node:sqlite` (archivo `inventario.db`).
- **Frontend:** SPA mínima en HTML/JS servida por el mismo contenedor.
- **Seguridad:** autenticación con JWT y autorización por roles (operador / administrador).

## Módulos

1. **Inventario y Movimientos** (`inventario.js`): registra entradas/salidas/traslados y
   actualiza el stock en **una sola transacción ACID** (si falla, *rollback* y el stock no cambia).
2. **Alertas y Reportes** (`alertas.js`): tras cada movimiento evalúa el **punto de reorden**
   y marca el material en *stock bajo* (notificación **simulada**).

La funcionalidad end-to-end: **registrar una salida de material → se actualiza el stock →
si queda en o bajo el punto de reorden, se genera una alerta.** Cruza ambos módulos.

## Cómo ejecutarlo

Requisito: **Node.js 22.5 o superior** (usa el módulo nativo `node:sqlite`).

```bash
cd prototipo-inventario
npm install
npm start
```

Luego abre **http://localhost:3000** en el navegador.

Usuarios de prueba:

| Usuario    | Contraseña    | Rol           |
|------------|---------------|---------------|
| `operador` | `operador123` | operador      |
| `admin`    | `admin123`    | administrador |

### Alternativa con Docker

```bash
docker compose up --build
```

## Demostración rápida (lo que se sustenta)

1. Inicia sesión como `operador`.
2. Registra una **salida** de un material con stock cercano al punto de reorden
   (por ejemplo `COD-PVC-90`, que ya inicia en stock bajo).
3. Observa que el **stock se actualiza** y aparece la **alerta** de reposición.
4. Intenta una salida mayor al stock disponible: el sistema la **rechaza (409)** y el stock
   **no cambia** (integridad / ACID).

## Endpoints (API REST)

| Método | Ruta                       | Rol        | Descripción                                   |
|--------|----------------------------|------------|-----------------------------------------------|
| POST   | `/api/auth/login`          | público    | Autentica y devuelve un token JWT             |
| GET    | `/api/materiales`          | autenticado| Lista materiales con su estado de stock       |
| POST   | `/api/materiales`          | admin      | Crea un material                              |
| POST   | `/api/movimientos`         | autenticado| Registra movimiento y actualiza stock (ACID)  |
| GET    | `/api/movimientos`         | autenticado| Historial de movimientos (append-only)        |
| GET    | `/api/reportes/stock-bajo` | autenticado| Materiales en o bajo el punto de reorden      |
| GET    | `/health`                  | público    | Estado del servicio (observabilidad)          |

> Todos los endpoints requieren el token JWT en la cabecera `Authorization`, excepto
> `POST /api/auth/login` y `GET /health`.

## Mapeo con la documentación de arquitectura

| Decisión / requisito        | Dónde se ve en el código                          |
|-----------------------------|---------------------------------------------------|
| RAS-1 Integridad (ACID)     | `inventario.js` → `BEGIN/COMMIT/ROLLBACK`          |
| RAS-2 Trazabilidad          | tabla `movimientos` (append-only) + `/api/movimientos` |
| RAS-3 Control de acceso     | `auth.js` → `requireAuth`, `requireAdmin`         |
| RAS-4 Alertas de reposición | `alertas.js` → `evaluarReorden`                   |
| ADR-001 Monolito en capas   | controladores (server) → servicios (módulos) → datos (db) |
| ADR-002 Base de datos       | `db.js` (SQLite; en producción: MySQL)            |
| ADR-003 Comunicación        | llamada síncrona `inventario → alertas`           |
