(() => {
  Portal.montarCabecera('catalogo');

  const rejilla = document.getElementById('rejilla');
  const buscar = document.querySelector('[data-test="buscar"]');
  const categoria = document.querySelector('[data-test="categoria"]');
  const ordenar = document.querySelector('[data-test="ordenar"]');
  const cargando = document.querySelector('[data-test="cargando"]');
  const sinResultados = document.querySelector('[data-test="sin-resultados"]');
  const resultados = document.querySelector('[data-test="resultados"]');

  const productosPorId = new Map();
  let consulta = 0;
  let temporizador;

  const textoPrecio = (tarjeta) => tarjeta.querySelector('[data-test="precio-producto"]').textContent;
  const textoNombre = (tarjeta) => tarjeta.querySelector('[data-test="nombre-producto"]').textContent;

  const CRITERIOS = {
    'nombre-asc': (a, b) => textoNombre(a).localeCompare(textoNombre(b), 'es'),
    'nombre-desc': (a, b) => textoNombre(b).localeCompare(textoNombre(a), 'es'),
    'precio-asc': (a, b) => parseFloat(textoPrecio(a).replace('S/', '')) - parseFloat(textoPrecio(b).replace('S/', '')),
    'precio-desc': (a, b) => parseFloat(textoPrecio(b).replace('S/', '')) - parseFloat(textoPrecio(a).replace('S/', '')),
  };

  function tarjeta(p) {
    const stock = p.stock > 0 ? `${p.stock} disponibles` : 'Agotado';
    return `
      <article class="panel producto" data-test="producto" data-id="${p.id}">
        <div class="producto-imagen" data-categoria="${Portal.escapar(p.categoria)}">
          <span class="etiqueta" data-test="categoria-producto">${Portal.escapar(p.categoria)}</span>
          ${Portal.icono(p.categoria)}
        </div>
        <div class="producto-cuerpo">
          <h3 data-test="nombre-producto">${Portal.escapar(p.nombre)}</h3>
          <p>${Portal.escapar(p.descripcion || '')}</p>
          <span class="stock">${stock}</span>
          <div class="producto-pie">
            <span class="precio" data-test="precio-producto">${Portal.moneda(p.precio)}</span>
            <button type="button" class="boton boton-primario" data-test="agregar-${p.id}" ${p.stock > 0 ? '' : 'disabled'}>Agregar</button>
          </div>
        </div>
      </article>`;
  }

  function aplicarOrden() {
    const criterio = CRITERIOS[ordenar.value] || CRITERIOS['nombre-asc'];
    const tarjetas = [...rejilla.querySelectorAll('[data-test="producto"]')];
    tarjetas.sort(criterio).forEach((t) => rejilla.appendChild(t));
  }

  function pintar(lista) {
    productosPorId.clear();
    lista.forEach((p) => productosPorId.set(p.id, p));
    rejilla.innerHTML = lista.map(tarjeta).join('');
    aplicarOrden();
    sinResultados.classList.toggle('oculto', lista.length > 0);
    resultados.textContent = lista.length === 1 ? '1 producto' : `${lista.length} productos`;
  }

  async function cargar() {
    const numero = ++consulta;
    const params = new URLSearchParams();
    if (buscar.value.trim()) params.set('buscar', buscar.value.trim());
    if (categoria.value) params.set('categoria', categoria.value);
    cargando.classList.remove('oculto');
    try {
      const r = await Portal.api('/api/productos' + (params.toString() ? `?${params}` : ''));
      if (numero !== consulta) return;
      pintar(r.ok && Array.isArray(r.datos) ? r.datos : []);
    } finally {
      if (numero === consulta) cargando.classList.add('oculto');
    }
  }

  async function cargarCategorias() {
    const r = await Portal.api('/api/categorias');
    if (!r.ok) return;
    r.datos.forEach((c) => {
      const opcion = document.createElement('option');
      opcion.value = c;
      opcion.textContent = c;
      categoria.appendChild(opcion);
    });
  }

  rejilla.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-test^="agregar-"]');
    if (!boton) return;
    const tarjetas = [...rejilla.querySelectorAll('[data-test="producto"]')];
    let indice = tarjetas.indexOf(boton.closest('[data-test="producto"]'));
    if (Portal.modoCompatible() && indice < tarjetas.length - 1) indice += 1;
    const producto = productosPorId.get(Number(tarjetas[indice].dataset.id));
    Portal.agregarAlCarrito(producto);
    Portal.avisar('Producto agregado al carrito');
  });

  buscar.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(cargar, 300);
  });
  buscar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(temporizador);
      cargar();
    }
  });
  categoria.addEventListener('change', cargar);
  ordenar.addEventListener('change', aplicarOrden);

  cargarCategorias();
  cargar();
})();
