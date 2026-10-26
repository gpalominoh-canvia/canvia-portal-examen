'use strict';

// Contrato de la API: lo que el portal debe cumplir para que los exámenes funcionen.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { iniciarPortal, PRODUCTO_VALIDO } = require('./ayuda');

let portal;
before(async () => { portal = await iniciarPortal(); });
after(async () => { await portal.cerrar(); });
beforeEach(() => portal.reiniciar());

describe('Sistema', () => {
  test('GET /api/salud responde ok', async () => {
    const r = await portal.pedir('GET', '/api/salud');
    assert.equal(r.estado, 200);
    assert.equal(r.datos.estado, 'ok');
  });

  test('POST /api/reset restaura productos y elimina pedidos', async () => {
    const t = await portal.token();
    await portal.pedir('POST', '/api/productos', { token: t, cuerpo: PRODUCTO_VALIDO });
    await portal.pedir('POST', '/api/pedidos', { token: t, cuerpo: { items: [{ productoId: 1, cantidad: 1 }] } });
    const r = await portal.pedir('POST', '/api/reset');
    assert.equal(r.estado, 200);
    assert.equal((await portal.pedir('GET', '/api/productos')).datos.length, 12);
    assert.deepEqual((await portal.pedir('GET', '/api/pedidos', { token: t })).datos, []);
  });

  test('ruta inexistente responde 404 JSON y método no permitido 405', async () => {
    assert.equal((await portal.pedir('GET', '/api/nada')).estado, 404);
    const r = await portal.pedir('DELETE', '/api/salud');
    assert.equal(r.estado, 405);
  });

  test('JSON mal formado responde 400', async () => {
    const r = await portal.pedir('POST', '/api/auth', { crudo: '{usuario:', cuerpo: undefined });
    assert.equal(r.estado, 400);
  });
});

describe('Autenticación', () => {
  test('credenciales correctas devuelven token', async () => {
    const r = await portal.pedir('POST', '/api/auth', { cuerpo: { usuario: 'ana', clave: 'canvia123' } });
    assert.equal(r.estado, 200);
    assert.match(r.datos.token, /^[0-9a-f]{48}$/);
    assert.equal(r.datos.usuario, 'ana');
  });

  test('clave incorrecta responde 401', async () => {
    const r = await portal.pedir('POST', '/api/auth', { cuerpo: { usuario: 'ana', clave: 'otra' } });
    assert.equal(r.estado, 401);
    assert.equal(r.datos.error, 'Usuario o clave incorrectos');
  });

  test('usuario inexistente responde 401', async () => {
    const r = await portal.pedir('POST', '/api/auth', { cuerpo: { usuario: 'pepe', clave: 'canvia123' } });
    assert.equal(r.estado, 401);
  });

  test('usuario bloqueado responde 423', async () => {
    const r = await portal.pedir('POST', '/api/auth', { cuerpo: { usuario: 'bloqueado', clave: 'canvia123' } });
    assert.equal(r.estado, 423);
    assert.match(r.datos.error, /bloqueado/);
  });

  test('faltan campos responde 400', async () => {
    const r = await portal.pedir('POST', '/api/auth', { cuerpo: { usuario: 'ana' } });
    assert.equal(r.estado, 400);
  });

  test('usuario lento tarda al menos 1,4 s', async () => {
    const inicio = Date.now();
    const r = await portal.pedir('POST', '/api/auth', { cuerpo: { usuario: 'lento', clave: 'canvia123' } });
    assert.equal(r.estado, 200);
    assert.ok(Date.now() - inicio >= 1400);
  });

  test('token inválido o ausente responde 401', async () => {
    assert.equal((await portal.pedir('GET', '/api/pedidos')).estado, 401);
    assert.equal((await portal.pedir('GET', '/api/pedidos', { token: 'falso' })).estado, 401);
  });
});

describe('Productos', () => {
  test('lista 12 productos en 4 categorías', async () => {
    const r = await portal.pedir('GET', '/api/productos');
    assert.equal(r.estado, 200);
    assert.equal(r.datos.length, 12);
    assert.equal(new Set(r.datos.map((p) => p.categoria)).size, 4);
    for (const p of r.datos) {
      assert.deepEqual(Object.keys(p).sort(), ['categoria', 'descripcion', 'id', 'nombre', 'precio', 'stock']);
    }
  });

  test('buscar no distingue mayúsculas ni tildes', async () => {
    const r = await portal.pedir('GET', '/api/productos?buscar=NUMERICO');
    assert.deepEqual(r.datos.map((p) => p.id), [7]);
    const teclados = await portal.pedir('GET', '/api/productos?buscar=teclado');
    assert.equal(teclados.datos.length, 2);
  });

  test('filtra por categoría', async () => {
    const r = await portal.pedir('GET', '/api/productos?categoria=hogar');
    assert.ok(r.datos.length > 0);
    assert.ok(r.datos.every((p) => p.categoria === 'Hogar'));
  });

  test('GET por id: 200 y 404', async () => {
    assert.equal((await portal.pedir('GET', '/api/productos/3')).datos.nombre, 'Teclado mecánico inalámbrico');
    assert.equal((await portal.pedir('GET', '/api/productos/999')).estado, 404);
    assert.equal((await portal.pedir('GET', '/api/productos/abc')).estado, 404);
  });

  test('POST crea con 201, Location y se puede consultar', async () => {
    const t = await portal.token();
    const r = await portal.pedir('POST', '/api/productos', { token: t, cuerpo: PRODUCTO_VALIDO });
    assert.equal(r.estado, 201);
    assert.equal(r.datos.id, 13);
    assert.equal(r.cabeceras.get('location'), '/api/productos/13');
    const g = await portal.pedir('GET', '/api/productos/13');
    assert.deepEqual(g.datos, { id: 13, descripcion: '', ...PRODUCTO_VALIDO });
  });

  test('POST sin token responde 401', async () => {
    const r = await portal.pedir('POST', '/api/productos', { cuerpo: PRODUCTO_VALIDO });
    assert.equal(r.estado, 401);
  });

  for (const [caso, cambios] of [
    ['sin nombre', { nombre: '' }],
    ['precio 0', { precio: 0 }],
    ['precio texto', { precio: '10' }],
    ['categoría inexistente', { categoria: 'Juguetes' }],
    ['stock negativo', { stock: -1 }],
    ['stock decimal', { stock: 1.5 }],
  ]) {
    test(`POST con ${caso} responde 400`, async () => {
      const t = await portal.token();
      const r = await portal.pedir('POST', '/api/productos', { token: t, cuerpo: { ...PRODUCTO_VALIDO, ...cambios } });
      assert.equal(r.estado, 400);
      assert.equal(typeof r.datos.error, 'string');
    });
  }

  test('PUT reemplaza y valida; 404 si no existe', async () => {
    const t = await portal.token();
    const r = await portal.pedir('PUT', '/api/productos/4', { token: t, cuerpo: { nombre: 'Mouse X', precio: 99, categoria: 'Accesorios', stock: 3 } });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.nombre, 'Mouse X');
    assert.equal((await portal.pedir('PUT', '/api/productos/4', { token: t, cuerpo: { nombre: 'Sin precio', categoria: 'Hogar' } })).estado, 400);
    assert.equal((await portal.pedir('PUT', '/api/productos/999', { token: t, cuerpo: PRODUCTO_VALIDO })).estado, 404);
  });

  test('PATCH modifica parcialmente y valida precio', async () => {
    const t = await portal.token();
    const r = await portal.pedir('PATCH', '/api/productos/4', { token: t, cuerpo: { precio: 119.9 } });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.precio, 119.9);
    assert.equal(r.datos.nombre, 'Mouse ergonómico vertical');
    assert.equal((await portal.pedir('PATCH', '/api/productos/4', { token: t, cuerpo: { precio: -5 } })).estado, 400);
    assert.equal((await portal.pedir('PATCH', '/api/productos/4', { token: t, cuerpo: {} })).estado, 400);
    assert.equal((await portal.pedir('PATCH', '/api/productos/999', { token: t, cuerpo: { precio: 1 } })).estado, 404);
  });

  test('DELETE responde 204, 401 sin token y 404 si no existe', async () => {
    const t = await portal.token();
    assert.equal((await portal.pedir('DELETE', '/api/productos/5')).estado, 401);
    assert.equal((await portal.pedir('DELETE', '/api/productos/5', { token: t })).estado, 204);
    assert.equal((await portal.pedir('DELETE', '/api/productos/999', { token: t })).estado, 404);
  });
});

describe('Pedidos', () => {
  test('POST crea pedido pendiente con total correcto', async () => {
    const t = await portal.token();
    const r = await portal.pedir('POST', '/api/pedidos', {
      token: t,
      cuerpo: { items: [{ productoId: 4, cantidad: 2 }, { productoId: 10, cantidad: 1 }] },
    });
    assert.equal(r.estado, 201);
    assert.equal(r.datos.id, 1001);
    assert.equal(r.datos.estado, 'pendiente');
    assert.equal(r.datos.total, 349.7);
    assert.equal(r.datos.descuento, 0);
    assert.equal(r.datos.items[0].subtotal, 259.8);
  });

  test('descuento mayorista correcto cuando el pedido tiene un solo ítem', async () => {
    const t = await portal.token();
    const r = await portal.pedir('POST', '/api/pedidos', { token: t, cuerpo: { items: [{ productoId: 10, cantidad: 6 }] } });
    assert.equal(r.datos.subtotal, 539.4);
    assert.equal(r.datos.descuento, 53.94);
    assert.equal(r.datos.total, 485.46);
  });

  for (const [caso, cuerpo] of [
    ['sin ítems', { items: [] }],
    ['producto inexistente', { items: [{ productoId: 99, cantidad: 1 }] }],
    ['cantidad negativa', { items: [{ productoId: 1, cantidad: -1 }] }],
    ['cantidad decimal', { items: [{ productoId: 1, cantidad: 1.5 }] }],
    ['stock insuficiente', { items: [{ productoId: 9, cantidad: 9 }] }],
  ]) {
    test(`POST con ${caso} responde 400`, async () => {
      const t = await portal.token();
      assert.equal((await portal.pedir('POST', '/api/pedidos', { token: t, cuerpo })).estado, 400);
    });
  }

  test('GET lista solo los pedidos del usuario', async () => {
    const ana = await portal.token('ana');
    const elena = await portal.token('errores');
    await portal.pedir('POST', '/api/pedidos', { token: ana, cuerpo: { items: [{ productoId: 1, cantidad: 1 }] } });
    await portal.pedir('POST', '/api/pedidos', { token: elena, cuerpo: { items: [{ productoId: 2, cantidad: 1 }] } });
    const r = await portal.pedir('GET', '/api/pedidos', { token: ana });
    assert.equal(r.datos.length, 1);
    assert.equal(r.datos[0].usuario, 'ana');
  });

  test('GET por id propio responde 200 y 404 si no existe', async () => {
    const t = await portal.token();
    const p = await portal.pedir('POST', '/api/pedidos', { token: t, cuerpo: { items: [{ productoId: 1, cantidad: 1 }] } });
    assert.equal((await portal.pedir('GET', `/api/pedidos/${p.datos.id}`, { token: t })).estado, 200);
    assert.equal((await portal.pedir('GET', '/api/pedidos/5000', { token: t })).estado, 404);
  });

  test('flujo de estados pendiente, pagado, enviado y transiciones inválidas desde pendiente', async () => {
    const t = await portal.token();
    const { datos: p } = await portal.pedir('POST', '/api/pedidos', { token: t, cuerpo: { items: [{ productoId: 1, cantidad: 1 }] } });
    const ruta = `/api/pedidos/${p.id}`;
    assert.equal((await portal.pedir('PATCH', ruta, { token: t, cuerpo: { estado: 'enviado' } })).estado, 400);
    assert.equal((await portal.pedir('PATCH', ruta, { token: t, cuerpo: { estado: 'otro' } })).estado, 400);
    assert.equal((await portal.pedir('PATCH', ruta, { token: t, cuerpo: { estado: 'pagado' } })).datos.estado, 'pagado');
    assert.equal((await portal.pedir('PATCH', ruta, { token: t, cuerpo: { estado: 'pendiente' } })).estado, 400);
    assert.equal((await portal.pedir('PATCH', ruta, { token: t, cuerpo: { estado: 'enviado' } })).datos.estado, 'enviado');
  });

  test('PATCH y DELETE de un pedido ajeno responden 404', async () => {
    const ana = await portal.token('ana');
    const elena = await portal.token('errores');
    const { datos: p } = await portal.pedir('POST', '/api/pedidos', { token: ana, cuerpo: { items: [{ productoId: 1, cantidad: 1 }] } });
    assert.equal((await portal.pedir('PATCH', `/api/pedidos/${p.id}`, { token: elena, cuerpo: { estado: 'pagado' } })).estado, 404);
    assert.equal((await portal.pedir('DELETE', `/api/pedidos/${p.id}`, { token: elena })).estado, 404);
  });

  test('DELETE cancela el pedido y no permite cancelar uno enviado', async () => {
    const t = await portal.token();
    const { datos: p } = await portal.pedir('POST', '/api/pedidos', { token: t, cuerpo: { items: [{ productoId: 1, cantidad: 1 }] } });
    assert.equal((await portal.pedir('DELETE', `/api/pedidos/${p.id}`, { token: t })).estado, 204);
    assert.equal((await portal.pedir('GET', `/api/pedidos/${p.id}`, { token: t })).datos.estado, 'cancelado');

    const { datos: q } = await portal.pedir('POST', '/api/pedidos', { token: t, cuerpo: { items: [{ productoId: 1, cantidad: 1 }] } });
    await portal.pedir('PATCH', `/api/pedidos/${q.id}`, { token: t, cuerpo: { estado: 'pagado' } });
    await portal.pedir('PATCH', `/api/pedidos/${q.id}`, { token: t, cuerpo: { estado: 'enviado' } });
    assert.equal((await portal.pedir('DELETE', `/api/pedidos/${q.id}`, { token: t })).estado, 400);
  });
});

describe('Web estática', () => {
  for (const ruta of ['/', '/catalogo', '/carrito', '/checkout', '/pedidos', '/docs', '/examen']) {
    test(`${ruta} sirve HTML`, async () => {
      const res = await fetch(portal.base + ruta);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /text\/html/);
      await res.text();
    });
  }

  test('selectores data-test del contrato presentes', async () => {
    const paginas = {
      '/': ['usuario', 'clave', 'ingresar', 'error'],
      '/catalogo': ['buscar', 'ordenar', 'contador-carrito', 'cerrar-sesion'],
      '/carrito': ['total', 'ir-a-pagar', 'contador-carrito'],
      '/checkout': ['nombre', 'direccion', 'confirmar', 'pedido-confirmado', 'numero-pedido'],
    };
    for (const [ruta, selectores] of Object.entries(paginas)) {
      const html = await (await fetch(portal.base + ruta)).text();
      for (const s of selectores) assert.ok(html.includes(`data-test="${s}"`), `${ruta} sin data-test="${s}"`);
    }
    const js = await (await fetch(portal.base + '/js/catalogo.js')).text();
    for (const s of ['producto', 'nombre-producto', 'precio-producto', 'agregar-']) assert.ok(js.includes(`data-test="${s}`));
    const carrito = await (await fetch(portal.base + '/js/carrito.js')).text();
    for (const s of ['item-carrito', 'quitar-']) assert.ok(carrito.includes(`data-test="${s}`));
  });

  test('rutas fuera de public responden 404', async () => {
    const res = await fetch(portal.base + '/..%2fserver.js');
    assert.equal(res.status, 404);
    await res.text();
  });
});
