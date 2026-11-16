import { describe, expect, it, vi } from 'vitest';
import { crearManejadores } from '@/lib/manejadores';
import { crearEntorno } from '../helpers/dobles';
import { conUsuarios, contexto, labor, lote, peticion } from '../helpers/rutas';

describe('rutas privadas: sin token o con token inválido → 401', () => {
  it.each([
    [
      'GET /api/lotes',
      (h: ReturnType<typeof crearManejadores>, t?: string) =>
        h.listar('lotes')(peticion('GET', '/api/lotes', { token: t })),
    ],
    [
      'GET /api/labores',
      (h: ReturnType<typeof crearManejadores>, t?: string) =>
        h.listar('labores')(peticion('GET', '/api/labores', { token: t })),
    ],
    [
      'PUT /api/lotes/:id',
      (h: ReturnType<typeof crearManejadores>, t?: string) =>
        h.guardar('lotes')(
          peticion('PUT', '/api/lotes/x', { token: t, cuerpo: lote }),
          contexto('x'),
        ),
    ],
    [
      'DELETE /api/lotes/:id',
      (h: ReturnType<typeof crearManejadores>, t?: string) =>
        h.borrar('lotes')(peticion('DELETE', '/api/lotes/x', { token: t }), contexto('x')),
    ],
    [
      'GET produccion',
      (h: ReturnType<typeof crearManejadores>, t?: string) =>
        h.produccion(peticion('GET', '/api/lotes/x/produccion', { token: t }), contexto('x')),
    ],
    [
      'GET /api/auth/yo',
      (h: ReturnType<typeof crearManejadores>, t?: string) =>
        h.yo(peticion('GET', '/api/auth/yo', { token: t })),
    ],
    [
      'POST /api/imagenes',
      (h: ReturnType<typeof crearManejadores>, t?: string) =>
        h.subirImagen(
          peticion('POST', '/api/imagenes', {
            token: t,
            texto: 'x',
            encabezados: { 'content-type': 'image/jpeg' },
          }),
        ),
    ],
    [
      'DELETE /api/imagenes',
      (h: ReturnType<typeof crearManejadores>, t?: string) =>
        h.borrarImagen(
          peticion('DELETE', '/api/imagenes?url=https://x.y/usuarios/u1/a.jpg', { token: t }),
        ),
    ],
  ])('%s', async (_nombre, llamar) => {
    const { h } = await conUsuarios();

    const sinToken = await llamar(h, undefined);
    const falso = await llamar(h, 'token-falso');

    expect(sinToken.status).toBe(401);
    expect(falso.status).toBe(401);
    expect(await sinToken.json()).toEqual({ error: 'No autenticado' });
  });
});

describe('validación → 400 con detalles', () => {
  it('un lote con área 0 y altitud fuera de rango da 400 con un detalle por campo', async () => {
    const { h, ana } = await conUsuarios();

    const respuesta = await h.guardar('lotes')(
      peticion('PUT', '/api/lotes/lote-1', {
        token: ana,
        cuerpo: { ...lote, area_m2: 0, altitud_m: 9000 },
      }),
      contexto('lote-1'),
    );

    expect(respuesta.status).toBe(400);
    const cuerpo = (await respuesta.json()) as { error: string; detalles: { campo: string }[] };
    expect(cuerpo.error).toBe('Datos inválidos');
    expect(cuerpo.detalles.map((d) => d.campo).sort()).toEqual(['altitud_m', 'area_m2']);
  });

  it('un cuerpo que no es JSON es un 400', async () => {
    const { h, ana } = await conUsuarios();

    const respuesta = await h.guardar('lotes')(
      peticion('PUT', '/api/lotes/lote-1', { token: ana, texto: '{no es json' }),
      contexto('lote-1'),
    );

    expect(respuesta.status).toBe(400);
  });

  it('el registro con contraseña corta es un 400', async () => {
    const { h } = await conUsuarios();

    const respuesta = await h.registro(
      peticion('POST', '/api/auth/registro', { cuerpo: { email: 'c@d.co', password: '123' } }),
    );

    expect(respuesta.status).toBe(400);
  });
});

describe('aislamiento entre usuarios', () => {
  it('lo que guarda un usuario no lo ve otro, ni puede borrarlo ni ver su producción', async () => {
    const { h, ana, beto } = await conUsuarios();
    await h.guardar('lotes')(
      peticion('PUT', '/api/lotes/lote-1', { token: ana, cuerpo: lote }),
      contexto('lote-1'),
    );
    await h.guardar('labores')(
      peticion('PUT', '/api/labores/labor-1', { token: ana, cuerpo: labor }),
      contexto('labor-1'),
    );

    const deAna = (await (
      await h.listar('lotes')(peticion('GET', '/api/lotes', { token: ana }))
    ).json()) as { items: unknown[] };
    const deBeto = (await (
      await h.listar('lotes')(peticion('GET', '/api/lotes', { token: beto }))
    ).json()) as { items: unknown[] };
    const borrado = await h.borrar('lotes')(
      peticion('DELETE', '/api/lotes/lote-1', { token: beto }),
      contexto('lote-1'),
    );
    const produccion = await h.produccion(
      peticion('GET', '/api/lotes/lote-1/produccion', { token: beto }),
      contexto('lote-1'),
    );
    const laborDeBeto = await h.guardar('labores')(
      peticion('PUT', '/api/labores/labor-2', { token: beto, cuerpo: labor }),
      contexto('labor-2'),
    );

    expect(deAna.items).toHaveLength(1);
    expect(deBeto.items).toHaveLength(0);
    expect(borrado.status).toBe(404);
    expect(produccion.status).toBe(404);
    expect(laborDeBeto.status).toBe(400); // el lote-1 de Ana no existe para Beto
  });

  it('el uid sale del token: un cuerpo con uid ajeno no cambia a quién pertenece el dato', async () => {
    const { h, ana, beto, entorno } = await conUsuarios();

    await h.guardar('lotes')(
      peticion('PUT', '/api/lotes/lote-1', { token: ana, cuerpo: { ...lote, uid: 'u2' } }),
      contexto('lote-1'),
    );

    expect(entorno.almacen.todos()).toHaveLength(1);
    const deBeto = (await (
      await h.listar('lotes')(peticion('GET', '/api/lotes', { token: beto }))
    ).json()) as { items: unknown[] };
    expect(deBeto.items).toHaveLength(0);
  });
});

describe('sincronización de punta a punta', () => {
  it('PUT, GET ?since= (con servidor_ahora), producción y DELETE lógico', async () => {
    const { h, ana, entorno } = await conUsuarios();
    const puesto = await h.guardar('lotes')(
      peticion('PUT', '/api/lotes/lote-1', { token: ana, cuerpo: lote }),
      contexto('lote-1'),
    );
    await h.guardar('labores')(
      peticion('PUT', '/api/labores/labor-1', { token: ana, cuerpo: labor }),
      contexto('labor-1'),
    );
    const corte = entorno.avanzar();

    const produccion = await (
      await h.produccion(
        peticion('GET', '/api/lotes/lote-1/produccion', { token: ana }),
        contexto('lote-1'),
      )
    ).json();
    const borrado = await h.borrar('lotes')(
      peticion('DELETE', '/api/lotes/lote-1', { token: ana }),
      contexto('lote-1'),
    );
    const cambios = (await (
      await h.listar('lotes')(peticion('GET', `/api/lotes?since=${corte}`, { token: ana }))
    ).json()) as {
      items: { id: string; deleted_at: string | null }[];
      servidor_ahora: string;
    };

    expect(puesto.status).toBe(200);
    expect(produccion).toEqual({
      lote_id: 'lote-1',
      total_kg: 12.5,
      por_mes: [{ mes: '2026-10', kg: 12.5 }],
      costo_total: 0,
      costo_por_kg: 0,
    });
    expect(borrado.status).toBe(200);
    expect(await borrado.json()).toEqual({ ok: true });
    expect(cambios.items.map((i) => [i.id, i.deleted_at !== null])).toEqual([['lote-1', true]]);
    expect(cambios.servidor_ahora).toBe('2026-11-15T10:00:01.000Z');
  });

  it('un since inválido es un 400 y un nombre repetido es un 409', async () => {
    const { h, ana } = await conUsuarios();
    await h.guardar('lotes')(
      peticion('PUT', '/api/lotes/lote-1', { token: ana, cuerpo: lote }),
      contexto('lote-1'),
    );

    const since = await h.listar('lotes')(peticion('GET', '/api/lotes?since=ayer', { token: ana }));
    const repetido = await h.guardar('lotes')(
      peticion('PUT', '/api/lotes/lote-2', {
        token: ana,
        cuerpo: { ...lote, nombre: 'EL MIRADOR' },
      }),
      contexto('lote-2'),
    );

    expect(since.status).toBe(400);
    expect(repetido.status).toBe(409);
  });
});

describe('errores internos', () => {
  it('si el almacén falla, responde 500 «Error interno» sin filtrar el mensaje', async () => {
    const entorno = crearEntorno();
    const { token } = await entorno.deps.auth.registrar('ana@correo.com', 'contraseña-1');
    const escribir = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const roto = {
      ...entorno.deps,
      almacen: {
        ...entorno.deps.almacen,
        listarDesde: () => Promise.reject(new Error('clave privada abc123')),
      },
    };
    const h = crearManejadores(() => roto);

    const respuesta = await h.listar('lotes')(peticion('GET', '/api/lotes', { token }));

    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toEqual({ error: 'Error interno' });
    escribir.mockRestore();
  });
});
