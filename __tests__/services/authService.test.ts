import { describe, expect, it } from 'vitest';
import {
  iniciarSesion,
  miPerfil,
  recuperarPassword,
  refrescar,
  registrar,
} from '@/services/authService';
import { crearEntorno } from '../helpers/dobles';

const cuenta = { email: 'Ana@Correo.com', password: 'contraseña-segura' };

describe('registrar', () => {
  it('crea la cuenta y devuelve la sesión y el usuario (correo en minúsculas)', async () => {
    const { deps } = crearEntorno();

    const respuesta = await registrar(deps, cuenta);

    expect(respuesta).toMatchObject({
      token: expect.any(String),
      refreshToken: expect.any(String),
      expiraEnSeg: 3600,
      usuario: { id: expect.any(String), email: 'ana@correo.com' },
    });
  });

  it('un correo repetido es un 409', async () => {
    const { deps } = crearEntorno();
    await registrar(deps, cuenta);

    await expect(registrar(deps, { ...cuenta, email: 'ANA@correo.com' })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('una contraseña corta o un correo inválido es un 400 con detalle por campo', async () => {
    const { deps } = crearEntorno();

    await expect(
      registrar(deps, { email: 'ana@correo.com', password: '1234567' }),
    ).rejects.toThrow();
    await expect(
      registrar(deps, { email: 'no-es-correo', password: '12345678' }),
    ).rejects.toThrow();
    await expect(registrar(deps, null)).rejects.toThrow();
  });
});

describe('iniciarSesion', () => {
  it('con las credenciales correctas devuelve la sesión', async () => {
    const { deps } = crearEntorno();
    await registrar(deps, cuenta);

    const respuesta = await iniciarSesion(deps, cuenta);

    expect(respuesta.usuario.email).toBe('ana@correo.com');
  });

  it('contraseña incorrecta y correo inexistente dan el MISMO 401 y el mismo mensaje', async () => {
    const { deps } = crearEntorno();
    await registrar(deps, cuenta);

    const mala = await iniciarSesion(deps, { ...cuenta, password: 'otra-contraseña' }).catch(
      (e) => e,
    );
    const inexistente = await iniciarSesion(deps, {
      email: 'nadie@correo.com',
      password: 'contraseña-segura',
    }).catch((e) => e);

    expect(mala).toMatchObject({ status: 401 });
    expect(inexistente).toMatchObject({ status: 401, message: mala.message });
  });

  it('tras demasiados intentos fallidos responde 429', async () => {
    const { deps } = crearEntorno();
    await registrar(deps, cuenta);
    for (let i = 0; i < 5; i++) {
      await iniciarSesion(deps, { ...cuenta, password: 'incorrecta-1' }).catch(() => undefined);
    }

    await expect(iniciarSesion(deps, cuenta)).rejects.toMatchObject({ status: 429 });
  });
});

describe('refrescar', () => {
  it('cambia el refreshToken por una sesión nueva (y el viejo deja de servir)', async () => {
    const { deps } = crearEntorno();
    const { refreshToken } = await registrar(deps, cuenta);

    const renovada = await refrescar(deps, { refreshToken });

    expect(renovada).toMatchObject({
      token: expect.any(String),
      refreshToken: expect.any(String),
      expiraEnSeg: 3600,
    });
    expect(renovada).not.toHaveProperty('usuario');
    await expect(refrescar(deps, { refreshToken })).rejects.toMatchObject({ status: 401 });
  });

  it('un cuerpo sin refreshToken es un 400', async () => {
    const { deps } = crearEntorno();

    await expect(refrescar(deps, {})).rejects.toThrow();
  });
});

describe('miPerfil', () => {
  it('devuelve el usuario del token ya verificado', () => {
    expect(miPerfil({ uid: 'u1', email: 'ana@correo.com', rol: null })).toEqual({
      usuario: { id: 'u1', email: 'ana@correo.com' },
    });
  });

  it('si el token no trae correo, devuelve null', () => {
    expect(miPerfil({ uid: 'u1', email: null, rol: null }).usuario.email).toBeNull();
  });
});

describe('recuperarPassword', () => {
  it('pide el correo en minúsculas y responde ok', async () => {
    const { deps, auth } = crearEntorno();
    await registrar(deps, cuenta);

    const respuesta = await recuperarPassword(deps, { email: ' ANA@correo.com ' });

    expect(respuesta).toEqual({ ok: true });
    expect(auth.recuperaciones).toEqual(['ana@correo.com']);
  });

  it('un correo que no existe responde igual (ok) y no envía nada', async () => {
    const { deps, auth } = crearEntorno();

    const respuesta = await recuperarPassword(deps, { email: 'nadie@correo.com' });

    expect(respuesta).toEqual({ ok: true });
    expect(auth.recuperaciones).toEqual([]);
  });

  it('un correo inválido o un cuerpo vacío es un 400 (error de validación)', async () => {
    const { deps } = crearEntorno();

    await expect(recuperarPassword(deps, { email: 'no-es-correo' })).rejects.toThrow();
    await expect(recuperarPassword(deps, {})).rejects.toThrow();
    await expect(recuperarPassword(deps, null)).rejects.toThrow();
  });
});
