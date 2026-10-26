// Utilidades compartidas por las páginas del portal: sesión, API, carrito y cabecera.
const Portal = (() => {
  const CLAVE_SESION = 'canvia.sesion';

  const ICONOS = {
    'Tecnología': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    'Accesorios': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/></svg>',
    'Oficina': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>',
    'Hogar': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  };
  const ICONO_GENERICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>';

  function leerJson(clave, porDefecto) {
    try {
      const valor = localStorage.getItem(clave);
      return valor === null ? porDefecto : JSON.parse(valor);
    } catch {
      return porDefecto;
    }
  }

  function sesion() {
    return leerJson(CLAVE_SESION, null);
  }

  function guardarSesion(datos) {
    localStorage.setItem(CLAVE_SESION, JSON.stringify(datos));
  }

  function cerrarSesion() {
    localStorage.removeItem(CLAVE_SESION);
    location.href = '/';
  }

  function exigirSesion() {
    const s = sesion();
    if (!s || !s.token) {
      location.replace('/');
      throw new Error('Sesión requerida');
    }
    return s;
  }

  function modoCompatible() {
    const s = sesion();
    return !!s && Number(s.interfaz) < 2.4;
  }

  async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
    const s = sesion();
    const cabeceras = { Accept: 'application/json' };
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    if (s && s.token) cabeceras.Authorization = `Bearer ${s.token}`;
    const res = await fetch(ruta, { method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    let datos = null;
    const texto = await res.text();
    if (texto) {
      try { datos = JSON.parse(texto); } catch { datos = null; }
    }
    if (res.status === 401 && s && ruta !== '/api/auth') {
      cerrarSesion();
    }
    return { estado: res.status, ok: res.ok, datos };
  }

  function moneda(valor) {
    return 'S/ ' + Number(valor).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function icono(categoria) {
    return ICONOS[categoria] || ICONO_GENERICO;
  }

  function escapar(texto) {
    return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- carrito (por usuario, en localStorage) ----------

  const claveCarrito = () => `canvia.carrito.${(sesion() || {}).usuario}`;
  const claveContador = () => `canvia.contador.${(sesion() || {}).usuario}`;

  function carrito() {
    return leerJson(claveCarrito(), []);
  }

  function guardarCarrito(items) {
    localStorage.setItem(claveCarrito(), JSON.stringify(items));
  }

  function unidades() {
    return Number(localStorage.getItem(claveContador())) || 0;
  }

  function agregarAlCarrito(producto) {
    const items = carrito();
    const existente = items.find((i) => i.id === producto.id);
    if (existente) existente.cantidad += 1;
    else items.push({ id: producto.id, nombre: producto.nombre, precio: producto.precio, categoria: producto.categoria, cantidad: 1 });
    guardarCarrito(items);
    localStorage.setItem(claveContador(), String(unidades() + 1));
    pintarContador();
  }

  function quitarDelCarrito(id) {
    guardarCarrito(carrito().filter((i) => i.id !== id));
    pintarContador();
  }

  function vaciarCarrito() {
    localStorage.removeItem(claveCarrito());
    localStorage.removeItem(claveContador());
    pintarContador();
  }

  function totalCarrito(items) {
    const lineas = modoCompatible() ? items.slice(0, Math.max(items.length - 1, 1)) : items;
    return Math.round(lineas.reduce((acc, i) => acc + i.precio * i.cantidad, 0) * 100) / 100;
  }

  // ---------- cabecera ----------

  function pintarContador() {
    const nodo = document.querySelector('[data-test="contador-carrito"]');
    if (nodo) nodo.textContent = String(unidades());
  }

  function montarCabecera(paginaActiva) {
    const s = exigirSesion();
    const nombre = document.querySelector('[data-test="nombre-usuario"]');
    if (nombre) nombre.textContent = s.nombre || s.usuario;
    const avatar = document.querySelector('.avatar');
    if (avatar) avatar.textContent = (s.nombre || s.usuario).split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
    document.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('activo', a.dataset.pagina === paginaActiva));
    const salir = document.querySelector('[data-test="cerrar-sesion"]');
    if (salir) salir.addEventListener('click', cerrarSesion);
    pintarContador();
    window.addEventListener('storage', pintarContador);
    return s;
  }

  let temporizadorAviso;
  function avisar(texto) {
    let aviso = document.querySelector('[data-test="aviso"]');
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.className = 'aviso';
      aviso.setAttribute('role', 'status');
      aviso.dataset.test = 'aviso';
      document.body.appendChild(aviso);
    }
    aviso.textContent = texto;
    aviso.classList.add('visible');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), 2200);
  }

  return {
    sesion, guardarSesion, cerrarSesion, exigirSesion, modoCompatible, api, moneda, icono, escapar,
    carrito, guardarCarrito, agregarAlCarrito, quitarDelCarrito, vaciarCarrito, totalCarrito, unidades,
    montarCabecera, pintarContador, avisar,
  };
})();
