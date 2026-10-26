'use strict';

// Arranca el portal en un puerto libre y ofrece atajos para llamar a la API.
const { crearServidor, restaurarDatos } = require('../server');

async function iniciarPortal() {
  const servidor = crearServidor();
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  async function pedir(metodo, ruta, { cuerpo, token, crudo } = {}) {
    const cabeceras = {};
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    if (token) cabeceras.Authorization = `Bearer ${token}`;
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: cabeceras,
      body: crudo !== undefined ? crudo : cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await res.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
    return { estado: res.status, datos, cabeceras: res.headers };
  }

  async function token(usuario = 'ana') {
    const r = await pedir('POST', '/api/auth', { cuerpo: { usuario, clave: 'canvia123' } });
    return r.datos.token;
  }

  return {
    base,
    pedir,
    token,
    reiniciar: () => restaurarDatos(),
    cerrar: () => new Promise((r) => {
      servidor.close(r);
      servidor.closeAllConnections();
    }),
  };
}

const PRODUCTO_VALIDO = { nombre: 'Webcam Full HD', precio: 219.9, categoria: 'Accesorios', stock: 30 };

module.exports = { iniciarPortal, PRODUCTO_VALIDO };
