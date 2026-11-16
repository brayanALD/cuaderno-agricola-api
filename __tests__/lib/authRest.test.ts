import { describe, expect, it, vi } from 'vitest';
import { ErrorHttp } from '@/lib/errores';
import { crearProveedorAuth, traducirError } from '@/lib/firebase/authRest';
import type { Identidad } from '@/lib/puertos';

const identidad: Identidad = { uid: 'u1', email: 'a@b.co', rol: null };
const verificarToken = vi.fn().mockResolvedValue(identidad);

function respuesta(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const errorDeFirebase = (message: string, status = 400) =>
  respuesta({ error: { code: status, message } }, status);

function proveedor(fetchImpl: typeof fetch, hostEmulador?: string) {
  return crearProveedorAuth({ apiKey: 'CLAVE-FALSA', hostEmulador, fetchImpl, verificarToken });
}

const sesionRest = {
  idToken: 'id-token',
  refreshToken: 'refresh',
  expiresIn: '3600',
  localId: 'u1',
  email: 'a@b.co',
};

describe('registrar e iniciarSesion (REST de Firebase Auth)', () => {
  it('registrar llama a accounts:signUp con la clave y devuelve la sesión mapeada', async () => {
    const llamada = vi.fn().mockResolvedValue(respuesta(sesionRest));

    const resultado = await proveedor(llamada).registrar('a@b.co', 'contraseña-1');

    const [url, init] = llamada.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=CLAVE-FALSA');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'a@b.co',
      password: 'contraseña-1',
      returnSecureToken: true,
    });
    expect(resultado).toEqual({
      token: 'id-token',
      refreshToken: 'refresh',
      expiraEnSeg: 3600,
      usuario: { id: 'u1', email: 'a@b.co' },
    });
  });

  it('iniciarSesion llama a accounts:signInWithPassword', async () => {
    const llamada = vi.fn().mockResolvedValue(respuesta(sesionRest));

    await proveedor(llamada).iniciarSesion('a@b.co', 'contraseña-1');

    expect(String(llamada.mock.calls[0]?.[0])).toContain(
      'accounts:signInWithPassword?key=CLAVE-FALSA',
    );
  });

  it('con el emulador apunta a su host local y no al de Google', async () => {
    const llamada = vi.fn().mockResolvedValue(respuesta(sesionRest));

    await proveedor(llamada, '127.0.0.1:9099').registrar('a@b.co', 'contraseña-1');

    expect(String(llamada.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=CLAVE-FALSA',
    );
  });

  it.each([
    ['EMAIL_EXISTS', 409],
    ['WEAK_PASSWORD : Password should be at least 6 characters', 400],
    ['INVALID_EMAIL', 400],
    ['INVALID_LOGIN_CREDENTIALS', 401],
    ['EMAIL_NOT_FOUND', 401],
    ['INVALID_PASSWORD', 401],
    ['TOO_MANY_ATTEMPTS_TRY_LATER', 429],
    ['USER_DISABLED', 403],
  ])('traduce el error de Firebase «%s» a %i', async (codigo, estado) => {
    const llamada = vi.fn().mockResolvedValue(errorDeFirebase(codigo));

    const error = await proveedor(llamada)
      .iniciarSesion('a@b.co', 'x')
      .catch((e) => e);

    expect(error).toBeInstanceOf(ErrorHttp);
    expect(error.status).toBe(estado);
  });

  it('credenciales inválidas: el mismo mensaje exista o no el correo', () => {
    expect(traducirError('EMAIL_NOT_FOUND').message).toBe(
      traducirError('INVALID_LOGIN_CREDENTIALS').message,
    );
    expect(traducirError('INVALID_PASSWORD').message).toBe(
      traducirError('INVALID_LOGIN_CREDENTIALS').message,
    );
  });

  it('un error desconocido NO es un ErrorHttp (se vuelve 500 y no se muestra al cliente)', async () => {
    const llamada = vi
      .fn()
      .mockResolvedValue(errorDeFirebase('API_KEY_INVALID : clave-secreta-123', 400));

    const error = await proveedor(llamada)
      .iniciarSesion('a@b.co', 'x')
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ErrorHttp);
    expect(String((error as Error).message)).not.toContain('clave-secreta-123');
  });

  it('una respuesta con formato inesperado es un error interno, no un 200 raro', async () => {
    const llamada = vi.fn().mockResolvedValue(respuesta({ algo: 'raro' }));

    await expect(proveedor(llamada).registrar('a@b.co', 'contraseña-1')).rejects.toThrow();
  });
});

describe('renovar (securetoken)', () => {
  it('cambia el refreshToken por un token nuevo', async () => {
    const llamada = vi.fn().mockResolvedValue(
      respuesta({
        id_token: 'nuevo',
        refresh_token: 'refresh-2',
        expires_in: '3600',
        user_id: 'u1',
      }),
    );

    const sesion = await proveedor(llamada).renovar('refresh-1');

    const [url, init] = llamada.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://securetoken.googleapis.com/v1/token?key=CLAVE-FALSA');
    expect(String(init.body)).toBe('grant_type=refresh_token&refresh_token=refresh-1');
    expect(sesion).toEqual({ token: 'nuevo', refreshToken: 'refresh-2', expiraEnSeg: 3600 });
  });

  it('un refreshToken inválido o vencido es un 401', async () => {
    for (const codigo of ['INVALID_REFRESH_TOKEN', 'TOKEN_EXPIRED']) {
      const llamada = vi.fn().mockResolvedValue(errorDeFirebase(codigo));

      await expect(proveedor(llamada).renovar('x')).rejects.toMatchObject({ status: 401 });
    }
  });

  it('con el emulador usa su host', async () => {
    const llamada = vi
      .fn()
      .mockResolvedValue(
        respuesta({ id_token: 'n', refresh_token: 'r', expires_in: '3600', user_id: 'u1' }),
      );

    await proveedor(llamada, 'localhost:9099').renovar('x');

    expect(String(llamada.mock.calls[0]?.[0])).toBe(
      'http://localhost:9099/securetoken.googleapis.com/v1/token?key=CLAVE-FALSA',
    );
  });
});

describe('verificar', () => {
  it('delega en el verificador del Admin SDK', async () => {
    const llamada = vi.fn();

    await expect(proveedor(llamada).verificar('tok')).resolves.toEqual(identidad);
    expect(verificarToken).toHaveBeenCalledWith('tok');
  });
});

describe('recuperarPassword (accounts:sendOobCode)', () => {
  it('pide el correo de recuperación en español con la clave y el tipo PASSWORD_RESET', async () => {
    const llamada = vi.fn().mockResolvedValue(respuesta({ email: 'a@b.co' }));

    await proveedor(llamada).recuperarPassword('a@b.co');

    const [url, init] = llamada.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=CLAVE-FALSA',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      requestType: 'PASSWORD_RESET',
      email: 'a@b.co',
    });
    expect((init.headers as Record<string, string>)['x-firebase-locale']).toBe('es');
  });

  it('un correo que no existe NO falla: no se revela qué correos están registrados', async () => {
    const llamada = vi.fn().mockResolvedValue(errorDeFirebase('EMAIL_NOT_FOUND'));

    await expect(proveedor(llamada).recuperarPassword('nadie@b.co')).resolves.toBeUndefined();
  });

  it('demasiados intentos es un 429 y un correo inválido un 400', async () => {
    const muchos = vi.fn().mockResolvedValue(errorDeFirebase('TOO_MANY_ATTEMPTS_TRY_LATER'));
    const invalido = vi.fn().mockResolvedValue(errorDeFirebase('INVALID_EMAIL'));

    const e429 = await proveedor(muchos)
      .recuperarPassword('a@b.co')
      .catch((e) => e);
    const e400 = await proveedor(invalido)
      .recuperarPassword('a@b.co')
      .catch((e) => e);

    expect([e429.status, e400.status]).toEqual([429, 400]);
  });

  it('un error desconocido es interno (no un ErrorHttp)', async () => {
    const llamada = vi.fn().mockResolvedValue(errorDeFirebase('OPERATION_NOT_ALLOWED'));

    const error = await proveedor(llamada)
      .recuperarPassword('a@b.co')
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ErrorHttp);
  });
});
