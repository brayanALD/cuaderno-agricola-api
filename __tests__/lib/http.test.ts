import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { detallesDeZod, ErrorHttp, responderError } from '@/lib/errores';
import { leerJson, tokenBearer } from '@/lib/peticion';

const peticion = (cuerpo: string, encabezados: Record<string, string> = {}) =>
  new Request('http://localhost/api/x', { method: 'POST', body: cuerpo, headers: encabezados });

describe('responderError', () => {
  it('un ErrorHttp responde su estado y { error }', async () => {
    const respuesta = responderError(new ErrorHttp(409, 'Ese correo ya está registrado.'));

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({ error: 'Ese correo ya está registrado.' });
  });

  it('un ErrorHttp con detalles los incluye', async () => {
    const respuesta = responderError(
      new ErrorHttp(400, 'Datos inválidos', [{ campo: 'email', mensaje: 'Correo inválido.' }]),
    );

    expect(await respuesta.json()).toEqual({
      error: 'Datos inválidos',
      detalles: [{ campo: 'email', mensaje: 'Correo inválido.' }],
    });
  });

  it('un error de zod responde 400 con un detalle por campo', async () => {
    const resultado = z
      .object({ area_m2: z.number(), nombre: z.string() })
      .safeParse({ nombre: 3 });
    const respuesta = responderError(resultado.error);

    expect(respuesta.status).toBe(400);
    const cuerpo = (await respuesta.json()) as { error: string; detalles: { campo: string }[] };
    expect(cuerpo.error).toBe('Datos inválidos');
    expect(cuerpo.detalles.map((d) => d.campo).sort()).toEqual(['area_m2', 'nombre']);
  });

  it('un error inesperado responde 500 «Error interno» sin revelar su mensaje', async () => {
    const escribir = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const respuesta = responderError(new Error('clave privada abc123 no válida'));

    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toEqual({ error: 'Error interno' });
    const registrado = escribir.mock.calls.map((c) => String(c[0])).join('');
    expect(registrado).not.toContain('abc123');
    escribir.mockRestore();
  });
});

describe('detallesDeZod', () => {
  it('une la ruta del campo con puntos y usa «cuerpo» si no hay ruta', () => {
    const anidado = z.object({ a: z.object({ b: z.number() }) }).safeParse({ a: { b: 'x' } });
    const raiz = z.object({}).safeParse(null);

    expect(anidado.error && detallesDeZod(anidado.error)[0]?.campo).toBe('a.b');
    expect(raiz.error && detallesDeZod(raiz.error)[0]?.campo).toBe('cuerpo');
  });
});

describe('leerJson', () => {
  it('devuelve el cuerpo ya convertido', async () => {
    expect(await leerJson(peticion('{"a":1}'))).toEqual({ a: 1 });
  });

  it('un cuerpo que no es JSON es un 400', async () => {
    await expect(leerJson(peticion('no es json'))).rejects.toMatchObject({ status: 400 });
    await expect(leerJson(peticion(''))).rejects.toMatchObject({ status: 400 });
  });

  it('un cuerpo demasiado grande es un 413', async () => {
    await expect(
      leerJson(peticion(JSON.stringify({ x: 'a'.repeat(200) })), 100),
    ).rejects.toMatchObject({
      status: 413,
    });
  });
});

describe('tokenBearer', () => {
  const con = (valor?: string) =>
    new Request('http://localhost/api/x', {
      headers: valor === undefined ? {} : { authorization: valor },
    });

  it('extrae el token de «Authorization: Bearer …»', () => {
    expect(tokenBearer(con('Bearer abc.def'))).toBe('abc.def');
  });

  it.each([undefined, '', 'abc', 'Basic abc', 'Bearer', 'Bearer  '])(
    'sin un Bearer válido (%j) es un 401',
    (valor) => {
      expect(() => tokenBearer(con(valor))).toThrowError(ErrorHttp);
      try {
        tokenBearer(con(valor));
      } catch (error) {
        expect(error).toMatchObject({ status: 401, message: 'No autenticado' });
      }
    },
  );
});
