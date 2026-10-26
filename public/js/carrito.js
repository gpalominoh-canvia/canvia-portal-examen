(() => {
  Portal.montarCabecera('carrito');

  const lista = document.querySelector('[data-test="lista-carrito"]');
  const vacio = document.querySelector('[data-test="carrito-vacio"]');
  const total = document.querySelector('[data-test="total"]');
  const unidadesResumen = document.querySelector('[data-test="unidades-resumen"]');
  const irAPagar = document.querySelector('[data-test="ir-a-pagar"]');

  function linea(item) {
    return `
      <li class="item-carrito" data-test="item-carrito" data-id="${item.id}">
        <div class="miniatura">${Portal.icono(item.categoria)}</div>
        <div>
          <h3 data-test="nombre-producto">${Portal.escapar(item.nombre)}</h3>
          <div class="detalle"><span data-test="cantidad">${item.cantidad}</span> x <span data-test="precio-producto">${Portal.moneda(item.precio)}</span></div>
        </div>
        <span class="importe" data-test="subtotal">${Portal.moneda(item.precio * item.cantidad)}</span>
        <button type="button" class="boton-texto" data-test="quitar-${item.id}">Quitar</button>
      </li>`;
  }

  function pintar() {
    const items = Portal.carrito();
    lista.innerHTML = items.map(linea).join('');
    vacio.classList.toggle('oculto', items.length > 0);
    lista.classList.toggle('oculto', items.length === 0);
    unidadesResumen.textContent = String(items.reduce((acc, i) => acc + i.cantidad, 0));
    total.textContent = Portal.moneda(Portal.totalCarrito(items));
    irAPagar.disabled = items.length === 0;
  }

  lista.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-test^="quitar-"]');
    if (!boton) return;
    Portal.quitarDelCarrito(Number(boton.closest('[data-test="item-carrito"]').dataset.id));
    pintar();
  });

  irAPagar.addEventListener('click', () => {
    location.href = '/checkout';
  });

  pintar();
})();
