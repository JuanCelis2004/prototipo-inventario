# Prototipo — Sistema de Gestión de Inventarios (JC Instalaciones)

Prototipo funcional que **demuestra la arquitectura** del proyecto de extremo a extremo.
No es un producto terminado, pero implementa un flujo real con dashboard, control de stock,
alertas y trazabilidad.

- **Estilo:** monolito modular en capas (MVC).
- **Backend:** Node.js + Express (contenedor API REST).
- **Base de datos:** SQLite con el módulo nativo `node:sqlite` (archivo `inventario.db`).
- **Frontend:** SPA "Consola de Operaciones" (dark + glassmorphism) servida por el mismo contenedor.
- **Seguridad:** autenticación con JWT y autorización por roles (operador / administrador).

## Módulos y funcionalidades

**1. Inventario y Movimientos** (`inventario.js`)
- Catálogo de materiales con categoría, unidad, ubicación, proveedor y costo.
- Búsqueda y filtros por categoría y estado; valorización del stock.
- 4 tipos de movimiento: **entrada, salida, traslado, ajuste** (recuento físico).
- Cada movimiento actualiza el stock en **una sola transacción ACID** (si falla, *rollback*).

**2. Alertas y Reportes** (`alertas.js` + `dashboard.js`)
- Estados **OK / BAJO / CRÍTICO** según el punto de reorden.
- Sugerencia de reposición y valor estimado de compra (notificación **simulada**).
- Dashboard con KPIs: valor del inventario, nº de materiales, alertas, críticos y movimientos del día.

Funcionalidad end-to-end que **cruza ambos módulos**: registrar una salida → se actualiza el
stock (transacción) → el módulo de Alertas evalúa el punto de reorden y marca el material.

## Cómo ejecutarlo

Requisito: **Node.js 22.5 o superior** (usa el módulo nativo `node:sqlite`).

```bash
cd prototipo-inventario
npm install
npm start
```

Abre **http://localhost:3000**.

| Usuario    | Contraseña    | Rol           |
|------------|---------------|---------------|
| `operador` | `operador123` | operador      |
| `admin`    | `admin123`    | administrador |

### Alternativa con Docker

```bash
docker compose up --build
```

## Demostración rápida (lo que se sustenta)

1. Entra como `operador`. Observa los **KPIs** y la lista con estados y barras de stock.
2. Registra una **salida** de un material cercano al reorden → el **stock baja** y aparece la **alerta** con sugerencia de reposición.
3. Prueba una salida mayor al stock → el sistema la **rechaza (409)** y el stock **no cambia** (integridad / ACID).
4. Filtra por categoría o por estado **Crítico**; usa el buscador.

## Endpoints (API REST)

| Método | Ruta                        | Rol         | Descripción                                  |
|--------|-----------------------------|-------------|----------------------------------------------|
| POST   | `/api/auth/login`           | público     | Autentica y devuelve un token JWT            |
| GET    | `/api/me`                   | autenticado | Datos del usuario autenticado                |
| GET    | `/api/dashboard`            | autenticado | KPIs e indicadores por categoría             |
| GET    | `/api/materiales`           | autenticado | Lista con búsqueda y filtros (`q`,`categoria`,`estado`) |
| GET    | `/api/materiales/:id`       | autenticado | Detalle de un material + sus movimientos     |
| POST   | `/api/materiales`           | admin       | Crea un material                             |
| PATCH  | `/api/materiales/:id`       | admin       | Ajusta punto de reorden / costo / proveedor  |
| POST   | `/api/movimientos`          | autenticado | Registra movimiento y actualiza stock (ACID) |
| GET    | `/api/movimientos`          | autenticado | Historial (filtros `material_id`,`tipo`)     |
| GET    | `/api/reportes/stock-bajo`  | autenticado | Materiales en alerta + sugerencia de compra  |
| GET    | `/api/categorias`           | autenticado | Categorías existentes                        |
| GET    | `/health`                   | público     | Estado del servicio                          |

> Todos los endpoints requieren el token JWT en `Authorization: Bearer <token>`, excepto
> `POST /api/auth/login` y `GET /health`.

## Estructura

```
server.js        Contenedor API REST (Express) + sirve la SPA
auth.js          Seguridad: login JWT + middleware de roles
inventario.js    Módulo 1: materiales y movimientos (transacción ACID)
alertas.js       Módulo 2: estados, alertas y sugerencias
dashboard.js     KPIs del inventario
db.js            Esquema SQLite + datos de ejemplo (seed)
public/index.html  SPA "Consola de Operaciones"
```

## Mapeo con la documentación de arquitectura

| Decisión / requisito        | Dónde se ve en el código                          |
|-----------------------------|---------------------------------------------------|
| RAS-1 Integridad (ACID)     | `inventario.js` → `BEGIN/COMMIT/ROLLBACK`          |
| RAS-2 Trazabilidad          | tabla `movimientos` (append-only) + `/api/movimientos` |
| RAS-3 Control de acceso     | `auth.js` → `requireAuth`, `requireAdmin`         |
| RAS-4 Alertas de reposición | `alertas.js` → `evaluarEstado`, `infoMaterial`    |
| ADR-001 Monolito en capas   | controladores (server) → servicios (módulos) → datos (db) |
| ADR-002 Base de datos       | `db.js` (SQLite; en producción: MySQL)            |
| ADR-003 Comunicación        | llamada síncrona `inventario → alertas`           |
