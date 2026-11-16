import { describe, expect, it } from 'vitest';
import { borrar, guardar, listar } from '@/services/sincronizacionService';
import { crearEntorno } from '../helpers/dobles';

const lote = {
  nombre: 'El Mirador',
  cultivo: 'Café',
  area_m2: 5000,
  altitud_m: 1650,
  lat: 4.65,
  lng: -75.57,
  fecha_siembra: '2026-08-16',
};

const labor = (cambios = {}) => ({
  lote_id: 'lote-1',
  tipo: 'riego',
  fecha: '2026-11-10',
  cantidad: 20,
  unidad: 'L',
  nota: null,
  foto_url: null,
  luz: null,
  ...cambios,
});

describe('guardar (PUT, idempotente)', () => {
  it('crea el lote con los campos base puestos por el servidor', async () => {
    const { deps } = crearEntorno();

    const doc = await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    expect(doc).toMatchObject({
      id: 'lote-1',
      ...lote,
      created_at: '2026-11-15T10:00:00.000Z',
      updated_at: '2026-11-15T10:00:00.000Z',
      deleted_at: null,
    });
  });

  it('repetir la misma escritura no duplica y conserva created_at (idempotente)', async () => {
    const { deps, almacen, avanzar } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    avanzar();

    const segundo = await guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, area_m2: 7000 });

    expect(almacen.todos()).toHaveLength(1);
    expect(segundo).toMatchObject({
      area_m2: 7000,
      created_at: '2026-11-15T10:00:00.000Z',
      updated_at: '2026-11-15T10:00:01.000Z',
    });
  });

  it('el cliente no decide los campos del servidor ni el uid (se descartan)', async () => {
    const { deps, almacen } = crearEntorno();

    await guardar(deps, 'u1', 'lotes', 'lote-1', {
      ...lote,
      uid: 'otro',
      created_at: '1999-01-01T00:00:00.000Z',
      deleted_at: '2020-01-01T00:00:00.000Z',
    });

    const [doc] = almacen.todos();
    expect(doc).not.toHaveProperty('uid');
    expect(doc?.created_at).toBe('2026-11-15T10:00:00.000Z');
    expect(doc?.deleted_at).toBeNull();
  });

  it('valida: un lote con área 0 o altitud fuera de rango es un 400 y no se guarda', async () => {
    const { deps, almacen } = crearEntorno();

    await expect(guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, area_m2: 0 })).rejects.toThrow();
    await expect(
      guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, altitud_m: 7000 }),
    ).rejects.toThrow();
    expect(almacen.todos()).toHaveLength(0);
  });

  it('un id con caracteres peligrosos es un 400', async () => {
    const { deps } = crearEntorno();

    await expect(guardar(deps, 'u1', 'lotes', '../otro', lote)).rejects.toThrow();
  });

  it('el nombre de lote es único por usuario sin distinguir mayúsculas: 409', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    await expect(
      guardar(deps, 'u1', 'lotes', 'lote-2', { ...lote, nombre: ' el mirador ' }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Ya existe un lote con ese nombre.',
    });
  });

  it('el mismo lote puede conservar su nombre; otro usuario puede usar el mismo; un borrado libera el nombre', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    await expect(
      guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, area_m2: 1 }),
    ).resolves.toBeTruthy();
    await expect(guardar(deps, 'u2', 'lotes', 'lote-9', lote)).resolves.toBeTruthy();
    await borrar(deps, 'u1', 'lotes', 'lote-1');
    await expect(guardar(deps, 'u1', 'lotes', 'lote-2', lote)).resolves.toBeTruthy();
  });
});

describe('guardar una labor', () => {
  it('guarda la labor de un lote propio', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    const doc = await guardar(deps, 'u1', 'labores', 'labor-1', labor());

    expect(doc).toMatchObject({
      id: 'labor-1',
      lote_id: 'lote-1',
      tipo: 'riego',
      deleted_at: null,
    });
  });

  it('un lote inexistente, ajeno o borrado es un 400 con detalle en lote_id', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u2', 'lotes', 'lote-1', lote);

    const ajeno = await guardar(deps, 'u1', 'labores', 'labor-1', labor()).catch((e) => e);

    expect(ajeno).toMatchObject({
      status: 400,
      detalles: [{ campo: 'lote_id', mensaje: 'El lote no existe.' }],
    });
  });

  it('la cosecha no puede ser anterior a la siembra', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    const error = await guardar(
      deps,
      'u1',
      'labores',
      'labor-1',
      labor({ tipo: 'cosecha', fecha: '2026-08-15' }),
    ).catch((e) => e);

    expect(error).toMatchObject({ status: 400, detalles: [{ campo: 'fecha' }] });
  });

  it('cantidad negativa o tipo inválido es un 400', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    await expect(guardar(deps, 'u1', 'labores', 'l', labor({ cantidad: -1 }))).rejects.toThrow();
    await expect(guardar(deps, 'u1', 'labores', 'l', labor({ tipo: 'otro' }))).rejects.toThrow();
  });
});

describe('listar (GET ?since=)', () => {
  it('devuelve los documentos del usuario con servidor_ahora', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    const respuesta = await listar(deps, 'u1', 'lotes', {});

    expect(respuesta.servidor_ahora).toBe('2026-11-15T10:00:00.000Z');
    expect(respuesta.items.map((i) => i.id)).toEqual(['lote-1']);
  });

  it('aislamiento: un usuario nunca ve los datos de otro', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    await guardar(deps, 'u2', 'lotes', 'lote-2', { ...lote, nombre: 'Otro' });

    const deU1 = await listar(deps, 'u1', 'lotes', {});
    const deU2 = await listar(deps, 'u2', 'lotes', {});

    expect(deU1.items.map((i) => i.id)).toEqual(['lote-1']);
    expect(deU2.items.map((i) => i.id)).toEqual(['lote-2']);
  });

  it('since devuelve lo cambiado desde ese instante (inclusive), y los borrados lógicos también', async () => {
    const { deps, avanzar } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    const corte = avanzar();
    await guardar(deps, 'u1', 'lotes', 'lote-2', { ...lote, nombre: 'Segundo' });
    avanzar();
    await borrar(deps, 'u1', 'lotes', 'lote-1');

    const respuesta = await listar(deps, 'u1', 'lotes', { since: corte });

    expect(respuesta.items.map((i) => [i.id, i.deleted_at !== null])).toEqual([
      ['lote-2', false],
      ['lote-1', true],
    ]);
  });

  it('since inválido es un 400', async () => {
    const { deps } = crearEntorno();

    await expect(listar(deps, 'u1', 'lotes', { since: 'ayer' })).rejects.toThrow();
  });

  it('devuelve como máximo 500 por llamada (se repite con el último updated_at)', async () => {
    const { deps, avanzar } = crearEntorno();
    for (let i = 0; i < 502; i++) {
      avanzar(1);
      await guardar(deps, 'u1', 'lotes', `l${i}`, { ...lote, nombre: `Lote ${i}` });
    }

    const primera = await listar(deps, 'u1', 'lotes', {});
    const ultimo = primera.items.at(-1)?.updated_at;
    const segunda = await listar(deps, 'u1', 'lotes', { since: ultimo });

    expect(primera.items).toHaveLength(500);
    // Inclusive: el último de la página anterior se repite (inocuo, el PUT es idempotente).
    expect(segunda.items.map((i) => i.id)).toEqual([primera.items.at(-1)?.id, 'l500', 'l501']);
  });
});

describe('borrar (DELETE lógico)', () => {
  it('marca deleted_at y responde { ok: true }', async () => {
    const { deps, almacen, avanzar } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    const ahora = avanzar();

    const respuesta = await borrar(deps, 'u1', 'lotes', 'lote-1');

    expect(respuesta).toEqual({ ok: true });
    expect(almacen.todos()[0]).toMatchObject({ deleted_at: ahora, updated_at: ahora });
  });

  it('un documento que no existe (o es de otro usuario) es un 404', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u2', 'lotes', 'lote-1', lote);

    await expect(borrar(deps, 'u1', 'lotes', 'lote-1')).rejects.toMatchObject({ status: 404 });
    await expect(borrar(deps, 'u1', 'lotes', 'nada')).rejects.toMatchObject({ status: 404 });
  });
});
