(() => {
  Portal.montarCabecera('pedidos');

  const cuerpo = document.querySelector('[data-test="lista-pedidos"]');
  const historial = document.querySelector('[data-test="historial"]');
  const sinPedidos = document.querySelector('[data-test="sin-pedidos"]');
  const cargando = document.querySelector('[data-test="cargando"]');

  const fecha = (iso) =>
    new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function fila(p) {
    const unidades = p.items.reduce((acc, i) => acc + i.cantidad, 0);
    const detalle = p.items.map((i) => Portal.escapar(i.nombre)).join(', ');
    return `
      <tr data-test="pedido" data-id="${p.id}">
        <td><span class="numero" data-test="numero">${p.id}</span></td>
        <td>${fecha(p.fecha)}</td>
        <td title="${detalle}">${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}</td>
        <td class="derecha" data-test="total-pedido">${Portal.moneda(p.total)}</td>
        <td><span class="estado estado-${p.estado}" data-test="estado-pedido">${p.estado}</span></td>
      </tr>`;
  }

  async function cargar() {
    cargando.classList.remove('oculto');
    const r = await Portal.api('/api/pedidos');
    cargando.classList.add('oculto');
    const pedidos = r.ok && Array.isArray(r.datos) ? [...r.datos].sort((a, b) => b.id - a.id) : [];
    cuerpo.innerHTML = pedidos.map(fila).join('');
    historial.classList.toggle('oculto', pedidos.length === 0);
    sinPedidos.classList.toggle('oculto', pedidos.length > 0);
  }

  cargar();
})();
