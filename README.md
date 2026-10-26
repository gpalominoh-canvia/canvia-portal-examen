<p align="center">
  <img src="public/img/logo-canvia.svg" alt="Canvia" width="228">
</p>

<h1 align="center">Portal Canvia Market</h1>

<p align="center">
  <img alt="Node 20+" src="https://img.shields.io/badge/node-%E2%89%A5%2020-005293">
  <img alt="Sin dependencias" src="https://img.shields.io/badge/dependencias-0-FF5700">
  <img alt="Puerto 3000" src="https://img.shields.io/badge/puerto-3000-005293">
</p>

Tienda en línea de práctica (API REST + web) sobre la que se rinde el **examen final de la capacitación QA de Canvia**:

| Examen | Herramientas | Duración |
|---|---|---|
| API | REST Assured + Cucumber (Java 17) | 60 min |
| Web | Playwright + Screenplay + Cucumber (TypeScript) | 45 min |

Un solo proceso de Node sirve la API JSON (`/api`), la tienda web, la documentación de la API (`/docs`) y los enunciados del examen (`/examen`). Los datos viven en memoria y se restauran con `POST /api/reset`.

## Cómo levantarlo

### Con Node (20 o superior)

```bash
node server.js            # http://localhost:3000
PORT=4000 node server.js  # otro puerto
```

No hay que instalar nada: el portal no tiene dependencias.

### Con Docker

```bash
docker compose up -d      # http://localhost:3000
docker compose down
PORTAL_PUERTO=4000 docker compose up -d   # publicar en otro puerto
```

### En GitHub Actions

La action levanta el portal en segundo plano, espera a que `/api/salud` responda y expone la URL base en la salida `url` (y en la variable `PORTAL_URL`). Necesita Node 20 o superior en el runner (`ubuntu-latest` ya lo trae).

```yaml
- name: Levantar Portal Canvia Market
  id: portal
  uses: gpalominoh-canvia/canvia-portal-examen@main
  # with:
  #   puerto: "3000"   # opcional
  #   espera: "30"     # segundos máximos de espera, opcional

# REST Assured
- run: mvn -B test -DbaseUrl=${{ steps.portal.outputs.url }}

# Playwright
- run: npm test
  env:
    BASE_URL: ${{ steps.portal.outputs.url }}
```

El portal sigue corriendo en los pasos siguientes del mismo job. Su log queda en `$RUNNER_TEMP/portal-canvia.log`.

## Usuarios

Clave para todos: `canvia123`.

| Usuario | Comportamiento |
|---|---|
| `ana` | Cliente habitual |
| `bloqueado` | No puede ingresar (`423`) |
| `lento` | Cada respuesta tarda unos 1,5 s |
| `errores` | Cliente con una versión anterior de la tienda web |

## Páginas

| Ruta | Contenido |
|---|---|
| `/` | Inicio de sesión |
| `/catalogo` | Catálogo con búsqueda, filtro por categoría y orden |
| `/carrito` | Carrito |
| `/checkout` | Datos de entrega y confirmación del pedido |
| `/pedidos` | Historial de pedidos |
| [`/docs`](http://localhost:3000/docs) | Referencia de la API: endpoints, cuerpos, códigos y ejemplos `curl` |
| [`/examen`](http://localhost:3000/examen) | Enunciados de los exámenes de API y web, entregables y rúbrica |

La web usa atributos `data-test` en español (`usuario`, `clave`, `ingresar`, `buscar`, `ordenar`, `agregar-<id>`, `contador-carrito`, `total`, `confirmar`, `numero-pedido`...). La lista completa está en `/examen`.

## API en resumen

| Método y ruta | Token | Respuesta |
|---|---|---|
| `GET /api/salud` | no | 200 |
| `POST /api/auth` | no | 200 `{ token }` · 401 · 423 |
| `GET /api/productos?buscar=&categoria=` | no | 200 lista |
| `GET /api/productos/:id` | no | 200 · 404 |
| `POST /api/productos` | sí | 201 · 400 · 401 |
| `PUT` / `PATCH` / `DELETE /api/productos/:id` | sí | 200 / 200 / 204 · 404 |
| `GET /api/pedidos` | sí | 200 pedidos del usuario |
| `POST /api/pedidos` | sí | 201 pedido `pendiente` |
| `GET /api/pedidos/:id` | sí | 200 · 404 |
| `PATCH /api/pedidos/:id` | sí | 200 · 400 |
| `DELETE /api/pedidos/:id` | sí | 204 (cancela) |
| `POST /api/reset` | no | 200, restaura los datos iniciales |

El detalle de cada endpoint y las reglas de negocio están en `/docs`.

## Pruebas del portal

```bash
npm test     # node --test, sin dependencias
```

## Estructura

```
server.js                  API, archivos estáticos y datos en memoria
public/                    tienda web (HTML, CSS y JS sin frameworks), /docs y /examen
action.yml                 composite action para GitHub Actions
scripts/iniciar-portal.sh  arranque en segundo plano usado por la action
test/                      pruebas con node --test
Dockerfile, docker-compose.yml
```

---

Canvia · Capacitación QA · Octubre 2026
