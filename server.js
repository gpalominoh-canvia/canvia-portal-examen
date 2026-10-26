'use strict';

// Portal Canvia Market: API JSON y web estática en un solo proceso, sin dependencias.
// Uso: node server.js   (puerto 3000 o el definido en la variable PORT)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = '1.0.0';
const DIR_PUBLICO = path.join(__dirname, 'public');
const RETARDO_LENTO_MS = 1500;
const LIMITE_CUERPO = 1024 * 1024;

const USUARIOS = {
  ana: { nombre: 'Ana Torres', clave: 'canvia123', bloqueado: false, interfaz: '2.4' },
  bloqueado: { nombre: 'Bruno Salas', clave: 'canvia123', bloqueado: true, interfaz: '2.4' },
  lento: { nombre: 'Luis Paredes', clave: 'canvia123', bloqueado: false, interfaz: '2.4' },
  errores: { nombre: 'Elena Ríos', clave: 'canvia123', bloqueado: false, interfaz: '2.3' },
};

const CATEGORIAS = ['Tecnología', 'Accesorios', 'Oficina', 'Hogar'];
const ESTADOS_PEDIDO = ['pendiente', 'pagado', 'enviado'];
const TRANSICIONES = { pendiente: ['pagado'], pagado: ['enviado'] };
const UNIDADES_MAYORISTA = 5;
const DESCUENTO_MAYORISTA = 0.1;

const PRODUCTOS_INICIALES = [
  { id: 1, nombre: 'Laptop Canvia Pro 14', descripcion: 'Procesador de 8 núcleos, 16 GB de RAM y SSD de 512 GB.', precio: 3499.0, categoria: 'Tecnología', stock: 12 },
  { id: 2, nombre: 'Monitor 27 pulgadas QHD', descripcion: 'Panel IPS de 2560 x 1440 con 75 Hz y base regulable.', precio: 1299.9, categoria: 'Tecnología', stock: 20 },
  { id: 3, nombre: 'Teclado mecánico inalámbrico', descripcion: 'Switches marrones, retroiluminación y conexión Bluetooth.', precio: 349.9, categoria: 'Tecnología', stock: 35 },
  { id: 4, nombre: 'Mouse ergonómico vertical', descripcion: 'Diseño vertical que reduce la tensión de la muñeca.', precio: 129.9, categoria: 'Accesorios', stock: 50 },
  { id: 5, nombre: 'Audífonos con cancelación de ruido', descripcion: 'Hasta 30 horas de batería y micrófono para reuniones.', precio: 899.0, categoria: 'Accesorios', stock: 18 },
  { id: 6, nombre: 'Mochila para laptop', descripcion: 'Compartimento acolchado para equipos de hasta 15,6 pulgadas.', precio: 179.9, categoria: 'Accesorios', stock: 40 },
  { id: 7, nombre: 'Teclado numérico USB', descripcion: 'Teclado numérico compacto para hojas de cálculo.', precio: 69.9, categoria: 'Accesorios', stock: 60 },
  { id: 8, nombre: 'Silla ergonómica Canvia', descripcion: 'Soporte lumbar ajustable y apoyabrazos 4D.', precio: 1150.0, categoria: 'Oficina', stock: 10 },
  { id: 9, nombre: 'Escritorio regulable en altura', descripcion: 'Motor doble, memoria de 3 alturas y tablero de 140 cm.', precio: 1890.0, categoria: 'Oficina', stock: 8 },
  { id: 10, nombre: 'Lámpara LED de escritorio', descripcion: 'Tres temperaturas de color y puerto de carga USB.', precio: 89.9, categoria: 'Oficina', stock: 45 },
  { id: 11, nombre: 'Cafetera de goteo programable', descripcion: 'Jarra de vidrio de 12 tazas y apagado automático.', precio: 259.0, categoria: 'Hogar', stock: 25 },
  { id: 12, nombre: 'Purificador de aire HEPA', descripcion: 'Cubre ambientes de hasta 40 m2 con filtro HEPA H13.', precio: 649.0, categoria: 'Hogar', stock: 15 },
];

const sesiones = new Map();
const datos = { productos: [], pedidos: [], siguienteProducto: 1, siguientePedido: 1001 };

function restaurarDatos() {
  datos.productos = PRODUCTOS_INICIALES.map((p) => ({ ...p, activo: true }));
  datos.pedidos = [];
  datos.siguienteProducto = PRODUCTOS_INICIALES.length + 1;
  datos.siguientePedido = 1001;
}
restaurarDatos();

// ---------- utilidades ----------

class ErrorHttp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const redondear = (n) => Math.round(n * 100) / 100;
const normalizar = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function enviarJson(res, estado, cuerpo, cabeceras = {}) {
  const texto = cuerpo === undefined ? '' : JSON.stringify(cuerpo);
  res.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...cabeceras,
  });
  res.end(estado === 204 ? undefined : texto);
}

function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    const partes = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > LIMITE_CUERPO) {
        rechazar(new ErrorHttp(413, 'El cuerpo de la petición es demasiado grande'));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => {
      const texto = Buffer.concat(partes).toString('utf8').trim();
      if (!texto) return resolver(undefined);
      try {
        resolver(JSON.parse(texto));
      } catch {
        rechazar(new ErrorHttp(400, 'El cuerpo no es un JSON válido'));
      }
    });
    req.on('error', rechazar);
  });
}

function usuarioDelToken(req) {
  const cabecera = req.headers.authorization || '';
  const [tipo, token] = cabecera.split(' ');
  if (!/^Bearer$/i.test(tipo || '') || !token) return null;
  return sesiones.get(token) || null;
}

function exigirUsuario(ctx) {
  if (!ctx.usuario) throw new ErrorHttp(401, 'Token ausente o inválido');
  return ctx.usuario;
}

function vistaProducto(p) {
  const { activo, ...publico } = p;
  return publico;
}

function buscarProducto(id) {
  return datos.productos.find((p) => p.id === id && p.activo) || null;
}

function idDeRuta(valor) {
  return /^\d+$/.test(valor) ? Number(valor) : NaN;
}

function categoriaValida(valor) {
  if (typeof valor !== 'string') return null;
  return CATEGORIAS.find((c) => normalizar(c) === normalizar(valor)) || null;
}

// ---------- validaciones ----------

function validarProductoCompleto(b) {
  if (!esObjeto(b)) throw new ErrorHttp(400, 'El cuerpo debe ser un objeto JSON');
  if (typeof b.nombre !== 'string' || !b.nombre.trim()) throw new ErrorHttp(400, 'El nombre es obligatorio');
  if (b.nombre.trim().length > 80) throw new ErrorHttp(400, 'El nombre no puede superar 80 caracteres');
  if (typeof b.precio !== 'number' || !b.precio) throw new ErrorHttp(400, 'El precio debe ser un número mayor a 0');
  const categoria = categoriaValida(b.categoria);
  if (!categoria) throw new ErrorHttp(400, `La categoría debe ser una de: ${CATEGORIAS.join(', ')}`);
  if (b.stock !== undefined && (!Number.isInteger(b.stock) || b.stock < 0)) {
    throw new ErrorHttp(400, 'El stock debe ser un entero mayor o igual a 0');
  }
  if (b.descripcion !== undefined && typeof b.descripcion !== 'string') {
    throw new ErrorHttp(400, 'La descripción debe ser texto');
  }
  return {
    nombre: b.nombre.trim(),
    descripcion: (b.descripcion || '').trim(),
    precio: redondear(b.precio),
    categoria,
    stock: b.stock === undefined ? 0 : b.stock,
  };
}

function validarCambiosProducto(b) {
  if (!esObjeto(b)) throw new ErrorHttp(400, 'El cuerpo debe ser un objeto JSON');
  const cambios = {};
  if ('nombre' in b) {
    if (typeof b.nombre !== 'string' || !b.nombre.trim()) throw new ErrorHttp(400, 'El nombre es obligatorio');
    if (b.nombre.trim().length > 80) throw new ErrorHttp(400, 'El nombre no puede superar 80 caracteres');
    cambios.nombre = b.nombre.trim();
  }
  if ('precio' in b) {
    if (typeof b.precio !== 'number' || !(b.precio > 0)) throw new ErrorHttp(400, 'El precio debe ser un número mayor a 0');
    cambios.precio = redondear(b.precio);
  }
  if ('categoria' in b) {
    const categoria = categoriaValida(b.categoria);
    if (!categoria) throw new ErrorHttp(400, `La categoría debe ser una de: ${CATEGORIAS.join(', ')}`);
    cambios.categoria = categoria;
  }
  if ('stock' in b) {
    if (!Number.isInteger(b.stock) || b.stock < 0) throw new ErrorHttp(400, 'El stock debe ser un entero mayor o igual a 0');
    cambios.stock = b.stock;
  }
  if ('descripcion' in b) {
    if (typeof b.descripcion !== 'string') throw new ErrorHttp(400, 'La descripción debe ser texto');
    cambios.descripcion = b.descripcion.trim();
  }
  if (Object.keys(cambios).length === 0) throw new ErrorHttp(400, 'No hay campos para actualizar');
  return cambios;
}

function armarLineas(items) {
  if (!Array.isArray(items) || items.length === 0) throw new ErrorHttp(400, 'El pedido debe tener al menos un ítem');
  return items.map((item) => {
    if (!esObjeto(item)) throw new ErrorHttp(400, 'Cada ítem debe tener productoId y cantidad');
    const { productoId, cantidad } = item;
    if (!Number.isInteger(productoId)) throw new ErrorHttp(400, 'productoId debe ser un número entero');
    const producto = buscarProducto(productoId);
    if (!producto) throw new ErrorHttp(400, `El producto ${productoId} no existe`);
    if (!Number.isInteger(cantidad) || cantidad < 0) throw new ErrorHttp(400, 'La cantidad debe ser un entero mayor a 0');
    if (cantidad > producto.stock) throw new ErrorHttp(400, `Stock insuficiente para ${producto.nombre}`);
    return {
      productoId: producto.id,
      nombre: producto.nombre,
      precioUnitario: producto.precio,
      cantidad,
      subtotal: redondear(producto.precio * cantidad),
    };
  });
}

function calcularTotales(lineas) {
  const subtotal = redondear(lineas.reduce((acc, l) => acc + l.subtotal, 0));
  const aplicaMayorista = lineas.some((l) => l.cantidad >= UNIDADES_MAYORISTA);
  const descuento = aplicaMayorista ? redondear(subtotal * DESCUENTO_MAYORISTA) : 0;
  return { subtotal, descuento, total: redondear(subtotal - descuento) };
}

function validarEnvio(envio) {
  if (envio === undefined || envio === null) return null;
  if (!esObjeto(envio)) throw new ErrorHttp(400, 'envio debe ser un objeto con nombre y direccion');
  return {
    nombre: typeof envio.nombre === 'string' ? envio.nombre.trim() : '',
    direccion: typeof envio.direccion === 'string' ? envio.direccion.trim() : '',
  };
}

// ---------- manejadores de la API ----------

const rutas = [];
function ruta(metodo, patron, manejador) {
  const claves = [];
  const regex = new RegExp('^' + patron.replace(/:(\w+)/g, (_, k) => (claves.push(k), '([^/]+)')) + '/?$');
  rutas.push({ metodo, regex, claves, manejador });
}

ruta('GET', '/api/salud', () => ({ estado: 200, cuerpo: { estado: 'ok', servicio: 'Portal Canvia Market', version: VERSION } }));

ruta('POST', '/api/reset', () => {
  restaurarDatos();
  return { estado: 200, cuerpo: { estado: 'ok', mensaje: 'Datos iniciales restaurados' } };
});

ruta('POST', '/api/auth', async (ctx) => {
  const b = ctx.cuerpo;
  if (!esObjeto(b) || typeof b.usuario !== 'string' || typeof b.clave !== 'string' || !b.usuario.trim() || !b.clave) {
    throw new ErrorHttp(400, 'usuario y clave son obligatorios');
  }
  const nombreUsuario = b.usuario.trim().toLowerCase();
  const usuario = USUARIOS[nombreUsuario];
  if (nombreUsuario === 'lento') await esperar(RETARDO_LENTO_MS);
  if (!usuario || usuario.clave !== b.clave) throw new ErrorHttp(401, 'Usuario o clave incorrectos');
  if (usuario.bloqueado) throw new ErrorHttp(423, 'El usuario está bloqueado. Contacta al administrador.');
  const token = crypto.randomBytes(24).toString('hex');
  sesiones.set(token, nombreUsuario);
  return {
    estado: 200,
    cuerpo: { token, tipo: 'Bearer', usuario: nombreUsuario, nombre: usuario.nombre, interfaz: usuario.interfaz },
  };
});

ruta('GET', '/api/categorias', () => ({ estado: 200, cuerpo: CATEGORIAS }));

ruta('GET', '/api/productos', (ctx) => {
  const buscar = normalizar(ctx.query.get('buscar') || '');
  const categoria = normalizar(ctx.query.get('categoria') || '');
  const lista = datos.productos
    .filter((p) => p.activo)
    .filter((p) => !buscar || normalizar(p.nombre).includes(buscar))
    .filter((p) => !categoria || normalizar(p.categoria) === categoria)
    .map(vistaProducto);
  return { estado: 200, cuerpo: lista };
});

ruta('GET', '/api/productos/:id', (ctx) => {
  const producto = buscarProducto(idDeRuta(ctx.params.id));
  if (!producto) throw new ErrorHttp(404, 'Producto no encontrado');
  return { estado: 200, cuerpo: vistaProducto(producto) };
});

ruta('POST', '/api/productos', (ctx) => {
  exigirUsuario(ctx);
  const valores = validarProductoCompleto(ctx.cuerpo);
  const producto = { id: datos.siguienteProducto++, ...valores, activo: true };
  datos.productos.push(producto);
  return { estado: 201, cuerpo: vistaProducto(producto), cabeceras: { Location: `/api/productos/${producto.id}` } };
});

ruta('PUT', '/api/productos/:id', (ctx) => {
  exigirUsuario(ctx);
  const producto = buscarProducto(idDeRuta(ctx.params.id));
  if (!producto) throw new ErrorHttp(404, 'Producto no encontrado');
  Object.assign(producto, validarProductoCompleto(ctx.cuerpo));
  return { estado: 200, cuerpo: vistaProducto(producto) };
});

ruta('PATCH', '/api/productos/:id', (ctx) => {
  exigirUsuario(ctx);
  const producto = buscarProducto(idDeRuta(ctx.params.id));
  if (!producto) throw new ErrorHttp(404, 'Producto no encontrado');
  Object.assign(producto, validarCambiosProducto(ctx.cuerpo));
  return { estado: 200, cuerpo: vistaProducto(producto) };
});

ruta('DELETE', '/api/productos/:id', (ctx) => {
  exigirUsuario(ctx);
  const producto = buscarProducto(idDeRuta(ctx.params.id));
  if (!producto) throw new ErrorHttp(404, 'Producto no encontrado');
  const actualizado = { ...producto, activo: false };
  datos.productos.map((p) => (p.id === actualizado.id ? actualizado : p));
  return { estado: 204 };
});

ruta('GET', '/api/pedidos', (ctx) => {
  const usuario = exigirUsuario(ctx);
  return { estado: 200, cuerpo: datos.pedidos.filter((p) => p.usuario === usuario) };
});

ruta('POST', '/api/pedidos', (ctx) => {
  const usuario = exigirUsuario(ctx);
  if (!esObjeto(ctx.cuerpo)) throw new ErrorHttp(400, 'El cuerpo debe ser un objeto JSON');
  const items = armarLineas(ctx.cuerpo.items);
  const envio = validarEnvio(ctx.cuerpo.envio);
  const pedido = {
    id: datos.siguientePedido++,
    usuario,
    items,
    ...calcularTotales(items),
    estado: 'pendiente',
    envio,
    fecha: new Date().toISOString(),
  };
  datos.pedidos.push(pedido);
  return { estado: 201, cuerpo: pedido, cabeceras: { Location: `/api/pedidos/${pedido.id}` } };
});

function pedidoDelUsuario(ctx) {
  const usuario = exigirUsuario(ctx);
  const id = idDeRuta(ctx.params.id);
  const pedido = datos.pedidos.find((p) => p.id === id && p.usuario === usuario);
  if (!pedido) throw new ErrorHttp(404, 'Pedido no encontrado');
  return pedido;
}

ruta('GET', '/api/pedidos/:id', (ctx) => {
  exigirUsuario(ctx);
  const pedido = datos.pedidos.find((p) => p.id === idDeRuta(ctx.params.id));
  if (!pedido) throw new ErrorHttp(404, 'Pedido no encontrado');
  return { estado: 200, cuerpo: pedido };
});

ruta('PATCH', '/api/pedidos/:id', (ctx) => {
  const pedido = pedidoDelUsuario(ctx);
  const b = ctx.cuerpo;
  if (!esObjeto(b) || !ESTADOS_PEDIDO.includes(b.estado)) {
    throw new ErrorHttp(400, `Estado inválido. Valores permitidos: ${ESTADOS_PEDIDO.join(', ')}`);
  }
  if (!TRANSICIONES[pedido.estado].includes(b.estado)) {
    throw new ErrorHttp(400, `No se puede pasar de ${pedido.estado} a ${b.estado}`);
  }
  pedido.estado = b.estado;
  return { estado: 200, cuerpo: pedido };
});

ruta('DELETE', '/api/pedidos/:id', (ctx) => {
  const pedido = pedidoDelUsuario(ctx);
  if (pedido.estado === 'enviado') throw new ErrorHttp(400, 'No se puede cancelar un pedido enviado');
  pedido.estado = 'cancelado';
  return { estado: 204 };
});

async function atenderApi(req, res, url) {
  const coincidentes = rutas.map((r) => ({ r, m: url.pathname.match(r.regex) })).filter((x) => x.m);
  if (coincidentes.length === 0) throw new ErrorHttp(404, 'Ruta no encontrada');
  const elegido = coincidentes.find((x) => x.r.metodo === req.method);
  if (!elegido) {
    const permitidos = [...new Set(coincidentes.map((x) => x.r.metodo))].join(', ');
    res.setHeader('Allow', permitidos);
    throw new ErrorHttp(405, `Método no permitido. Usa: ${permitidos}`);
  }
  const params = {};
  elegido.r.claves.forEach((k, i) => (params[k] = decodeURIComponent(elegido.m[i + 1])));
  const usuario = usuarioDelToken(req);
  if (usuario === 'lento') await esperar(RETARDO_LENTO_MS);
  const cuerpo = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await leerCuerpo(req) : undefined;
  const r = await elegido.r.manejador({ req, params, query: url.searchParams, cuerpo, usuario });
  enviarJson(res, r.estado, r.cuerpo, r.cabeceras);
}

// ---------- web estática ----------

const PAGINAS = {
  '/': 'index.html',
  '/catalogo': 'catalogo.html',
  '/carrito': 'carrito.html',
  '/checkout': 'checkout.html',
  '/pedidos': 'pedidos.html',
  '/docs': 'docs.html',
  '/examen': 'examen.html',
};

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function servirArchivo(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  const limpia = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  const relativo = PAGINAS[limpia] || decodeURIComponent(limpia).replace(/^\/+/, '');
  const archivo = path.normalize(path.join(DIR_PUBLICO, relativo));
  if (!archivo.startsWith(DIR_PUBLICO + path.sep)) return noEncontrado(res);
  fs.stat(archivo, (err, info) => {
    if (err || !info.isFile()) return noEncontrado(res);
    const tipo = TIPOS[path.extname(archivo)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': tipo,
      'Content-Length': info.size,
      'Cache-Control': tipo.startsWith('text/html') ? 'no-store' : 'public, max-age=300',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(archivo).pipe(res);
  });
}

function noEncontrado(res) {
  const archivo = path.join(DIR_PUBLICO, '404.html');
  fs.readFile(archivo, (err, html) => {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(err ? 'Página no encontrada' : html);
  });
}

// ---------- servidor ----------

function crearServidor() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Powered-By', 'Canvia Market');
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return servirArchivo(req, res, url);

    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    try {
      await atenderApi(req, res, url);
    } catch (err) {
      if (err instanceof ErrorHttp) return enviarJson(res, err.estado, { error: err.message });
      console.error(`[error] ${req.method} ${url.pathname}:`, err.message);
      if (!res.headersSent) enviarJson(res, 500, { error: 'Error interno del servidor' });
    }
  });
}

module.exports = { crearServidor, restaurarDatos, USUARIOS, CATEGORIAS };

if (require.main === module) {
  const puerto = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  crearServidor().listen(puerto, host, () => {
    console.log(`Portal Canvia Market ${VERSION} escuchando en http://localhost:${puerto}`);
    console.log(`  Web:  http://localhost:${puerto}/`);
    console.log(`  API:  http://localhost:${puerto}/api/salud`);
    console.log(`  Docs: http://localhost:${puerto}/docs`);
  });
}
