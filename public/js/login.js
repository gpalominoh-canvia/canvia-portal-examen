(() => {
  if (Portal.sesion()) {
    location.replace('/catalogo');
    return;
  }

  const form = document.getElementById('form-login');
  const error = document.querySelector('[data-test="error"]');
  const boton = document.querySelector('[data-test="ingresar"]');

  function mostrarError(texto) {
    error.textContent = texto;
    error.classList.remove('oculto');
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.classList.add('oculto');
    const usuario = form.usuario.value.trim();
    const clave = form.clave.value;
    if (!usuario || !clave) {
      mostrarError('Ingresa tu usuario y tu clave.');
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Ingresando...';
    try {
      const r = await Portal.api('/api/auth', { metodo: 'POST', cuerpo: { usuario, clave } });
      if (r.estado === 200) {
        Portal.guardarSesion(r.datos);
        location.href = '/catalogo';
        return;
      }
      if (r.estado === 423) mostrarError('Tu usuario está bloqueado. Contacta al administrador.');
      else if (r.estado === 401) mostrarError('Usuario o clave incorrectos.');
      else mostrarError((r.datos && r.datos.error) || 'No se pudo iniciar sesión. Intenta nuevamente.');
    } catch {
      mostrarError('No hay conexión con el servidor.');
    }
    boton.disabled = false;
    boton.textContent = 'Ingresar';
  });
})();
