import { describe, expect, it } from 'vitest';
import { TAMANO_MAXIMO_IMAGEN } from '@/services/imagenesService';
import { conUsuarios, peticion } from '../helpers/rutas';

describe('autenticación', () => {
  const credenciales = { email: 'Cami@Correo.com', password: 'contraseña-1' };

  it('recuperar → 200 siempre que el correo sea válido (exista o no); inválido → 400', async () => {
    const { h } = await conUsuarios();
    await h.registro(peticion('POST', '/api/auth/registro', { cuerpo: credenciales }));

    const existe = await h.recuperar(
      peticion('POST', '/api/auth/recuperar', { cuerpo: { email: credenciales.email } }),
    );
    const noExiste = await h.recuperar(
      peticion('POST', '/api/auth/recuperar', { cuerpo: { email: 'nadie@correo.com' } }),
    );
    const invalido = await h.recuperar(
      peticion('POST', '/api/auth/recuperar', { cuerpo: { email: 'no-es-correo' } }),
    );

    expect([existe.status, noExiste.status, invalido.status]).toEqual([200, 200, 400]);
    expect(await existe.json()).toEqual({ ok: true });
    expect(await noExiste.json()).toEqual({ ok: true });
  });

  it('registro → 201 con la sesión; correo repetido → 409', async () => {
    const { h } = await conUsuarios();

    const nuevo = await h.registro(
      peticion('POST', '/api/auth/registro', { cuerpo: credenciales }),
    );
    const repetido = await h.registro(
      peticion('POST', '/api/auth/registro', { cuerpo: credenciales }),
    );

    expect(nuevo.status).toBe(201);
    expect(await nuevo.json()).toMatchObject({
      token: expect.any(String),
      refreshToken: expect.any(String),
      expiraEnSeg: 3600,
      usuario: { email: 'cami@correo.com' },
    });
    expect(repetido.status).toBe(409);
  });

  it('login → 200; credenciales malas → el mismo 401 exista o no el correo; muchos intentos → 429', async () => {
    const { h } = await conUsuarios();
    await h.registro(peticion('POST', '/api/auth/registro', { cuerpo: credenciales }));

    const bueno = await h.login(peticion('POST', '/api/auth/login', { cuerpo: credenciales }));
    const mala = await h.login(
      peticion('POST', '/api/auth/login', {
        cuerpo: { ...credenciales, password: 'incorrecta-1' },
      }),
    );
    const inexistente = await h.login(
      peticion('POST', '/api/auth/login', {
        cuerpo: { email: 'x@y.co', password: 'incorrecta-1' },
      }),
    );
    for (let i = 0; i < 5; i++)
      await h.login(
        peticion('POST', '/api/auth/login', {
          cuerpo: { ...credenciales, password: 'incorrecta-1' },
        }),
      );
    const bloqueado = await h.login(peticion('POST', '/api/auth/login', { cuerpo: credenciales }));

    expect(bueno.status).toBe(200);
    expect(mala.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(await inexistente.json()).toEqual(await mala.json());
    expect(bloqueado.status).toBe(429);
  });

  it('refresh renueva la sesión y el token viejo deja de servir; yo devuelve el usuario', async () => {
    const { h } = await conUsuarios();
    const sesion = (await (
      await h.registro(peticion('POST', '/api/auth/registro', { cuerpo: credenciales }))
    ).json()) as {
      token: string;
      refreshToken: string;
    };

    const renovada = await h.refresh(
      peticion('POST', '/api/auth/refresh', { cuerpo: { refreshToken: sesion.refreshToken } }),
    );
    const reuso = await h.refresh(
      peticion('POST', '/api/auth/refresh', { cuerpo: { refreshToken: sesion.refreshToken } }),
    );
    const yo = await h.yo(peticion('GET', '/api/auth/yo', { token: sesion.token }));

    expect(renovada.status).toBe(200);
    expect(reuso.status).toBe(401);
    expect(yo.status).toBe(200);
    expect(await yo.json()).toEqual({
      usuario: { id: expect.any(String), email: 'cami@correo.com' },
    });
  });
});

describe('imágenes', () => {
  const jpeg = { 'content-type': 'image/jpeg' };

  it('POST → 201 con { url, pathname } en la carpeta del usuario', async () => {
    const { h, ana } = await conUsuarios();

    const respuesta = await h.subirImagen(
      peticion('POST', '/api/imagenes', { token: ana, texto: 'x'.repeat(1000), encabezados: jpeg }),
    );

    expect(respuesta.status).toBe(201);
    const cuerpo = (await respuesta.json()) as { url: string; pathname: string };
    expect(cuerpo.pathname).toMatch(/^usuarios\/u1\//);
  });

  it('no es imagen → 415; pesa más de ~4 MB → 413 (sin leer el cuerpo si lo declara el encabezado)', async () => {
    const { h, ana } = await conUsuarios();

    const noImagen = await h.subirImagen(
      peticion('POST', '/api/imagenes', {
        token: ana,
        texto: 'hola',
        encabezados: { 'content-type': 'text/plain' },
      }),
    );
    const enorme = await h.subirImagen(
      peticion('POST', '/api/imagenes', {
        token: ana,
        texto: 'x',
        encabezados: { ...jpeg, 'content-length': String(TAMANO_MAXIMO_IMAGEN + 1) },
      }),
    );

    expect(noImagen.status).toBe(415);
    expect(enorme.status).toBe(413);
  });

  it('DELETE de una imagen propia → 200; de otro usuario → 403', async () => {
    const { h, ana, beto } = await conUsuarios();
    const subida = (await (
      await h.subirImagen(
        peticion('POST', '/api/imagenes', { token: ana, texto: 'x', encabezados: jpeg }),
      )
    ).json()) as { url: string };
    const ruta = `/api/imagenes?url=${encodeURIComponent(subida.url)}`;

    const ajeno = await h.borrarImagen(peticion('DELETE', ruta, { token: beto }));
    const propio = await h.borrarImagen(peticion('DELETE', ruta, { token: ana }));

    expect(ajeno.status).toBe(403);
    expect(propio.status).toBe(200);
  });
});
