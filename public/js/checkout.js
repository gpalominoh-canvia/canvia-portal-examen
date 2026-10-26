(() => {
  Portal.montarCabecera('checkout');

  const form = document.getElementById('form-checkout');
  const error = document.querySelector('[data-test="error"]');
  const confirmar = document.querySelector('[data-test="confirmar"]');
  const pasoDatos = document.querySelector('[data-test="paso-datos"]');
  const confirmado = document.querySelector('[data-test="pedido-confirmado"]');
  const resumenItems = document.querySelector('[data-test="resumen-items"]');
  const total = document.querySelector('[data-test="total"]');

  const items = Portal.carrito();

  function mostrarError(texto) {
    error.textContent = texto;
    error.classList.remove('oculto');
  }

  resumenItems.innerHTML = items
    .map((i) => `<div class="fila"><span>${i.cantidad} x ${Portal.escapar(i.nombre)}</span><span>${Portal.moneda(i.precio * i.cantidad)}</span></div>`)
    .join('');
  total.textContent = Portal.moneda(Portal.totalCarrito(items));

  if (items.length === 0) {
    mostrarError('Tu carrito está vacío. Agrega productos antes de confirmar.');
    confirmar.disabled = true;
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.classList.add('oculto');
    const nombre = form.nombre.value;
    const direccion = form.direccion.value.trim();

    if (!direccion) return mostrarError('Ingresa la dirección de entrega.');
    if (direccion.length < 8) return mostrarError('La dirección debe tener al menos 8 caracteres.');
    if (nombre.length > 60) return mostrarError('El nombre no puede superar 60 caracteres.');

    confirmar.disabled = true;
    confirmar.textContent = 'Procesando...';
    try {
      const r = await Portal.api('/api/pedidos', {
        metodo: 'POST',
        cuerpo: {
          items: items.map((i) => ({ productoId: i.id, cantidad: i.cantidad })),
          envio: { nombre: nombre.trim(), direccion },
        },
      });
      if (r.estado !== 201) {
        mostrarError((r.datos && r.datos.error) || 'No se pudo registrar el pedido.');
        confirmar.disabled = false;
        confirmar.textContent = 'Confirmar pedido';
        return;
      }
      Portal.vaciarCarrito();
      document.querySelector('[data-test="numero-pedido"]').textContent = String(r.datos.id);
      document.querySelector('[data-test="total-confirmado"]').textContent = Portal.moneda(r.datos.total);
      pasoDatos.classList.add('oculto');
      confirmado.classList.remove('oculto');
    } catch {
      mostrarError('No hay conexión con el servidor.');
      confirmar.disabled = false;
      confirmar.textContent = 'Confirmar pedido';
    }
  });
})();
