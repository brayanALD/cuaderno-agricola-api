import { describe, expect, it } from 'vitest';
import { ErrorHttp } from '@/lib/errores';
import type { Unicidad } from '@/lib/puertos';
import { aplicarCambios } from '@/services/cambiosService';
import { borrar, guardar, listar } from '@/services/sincronizacionService';
import { crearEntorno } from '../helpers/dobles';

const lote = (nombre = 'El Mirador') => ({
  nombre,
  cultivo: 'Café',
  area_m2: 5000,
  altitud_m: 1650,
  lat: 4.65,
  lng: -75.57,
  fecha_siembra: '2026-08-16',
});

const labor = (loteId = 'lote-1', cambios = {}) => ({
  lote_id: loteId,
  tipo: 'riego',
  fecha: '2026-11-10',
  cantidad: 20,
  unidad: 'L',
  nota: null,
  foto_url: null,
  luz: null,
  ...cambios,
});

const ciclo = (loteId = 'lote-1') => ({
  lote_id: loteId,
  cultivo: 'Maíz',
  fecha_inicio: '2026-01-10',
  fecha_fin: '2026-06-15',
  total_kg: 320,
});

const esNombreRepetido = (error: unknown) =>
  error instanceof ErrorHttp && error.status === 409 && error.detalles === undefined;

describe('unicidad atómica del nombre de lote (D98)', () => {
  it('dos escrituras SIMULTÁNEAS con el mismo nombre: solo una se queda con él', async () => {
    const { deps, almacen } = crearEntorno();

    const resultados = await Promise.allSettled([
      guardar(deps, 'u1', 'lotes', 'lote-a', lote('Repetido')),
      guardar(deps, 'u1', 'lotes', 'lote-b', lote('Repetido')),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazo = resultados.find((r) => r.status === 'rejected');
    expect(esNombreRepetido(rechazo?.reason)).toBe(true);
    expect(almacen.todos().filter((d) => d.nombre === 'Repetido')).toHaveLength(1);
  });

  it('la reserva por sí sola impide el duplicado aunque la comprobación previa no lo vea', async () => {
    const { deps, almacen } = crearEntorno();
    const unicidad: Unicidad = {
      campo: 'nombre',
      clave: (v) => v.trim().toLowerCase(),
      conflicto: () => new ErrorHttp(409, 'Ya existe un lote con ese nombre.'),
    };
    await almacen.guardar('u1', 'lote', 'a', lote('Uno'), deps.ahora(), { unicidad });

    await expect(
      almacen.guardar('u1', 'lote', 'b', lote(' UNO '), deps.ahora(), { unicidad }),
    ).rejects.toThrow('Ya existe un lote con ese nombre.');
    expect(almacen.todos().map((d) => d.id)).toEqual(['a']);
  });

  it('repetir el PUT del mismo lote con su mismo nombre no choca consigo mismo', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-a', lote('Uno'));

    await expect(guardar(deps, 'u1', 'lotes', 'lote-a', lote('Uno'))).resolves.toMatchObject({
      nombre: 'Uno',
    });
  });

  it('cambiar el nombre libera el anterior para otro lote', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-a', lote('Uno'));
    await guardar(deps, 'u1', 'lotes', 'lote-a', lote('Dos'));

    await expect(guardar(deps, 'u1', 'lotes', 'lote-b', lote('Uno'))).resolves.toMatchObject({
      nombre: 'Uno',
    });
    await expect(guardar(deps, 'u1', 'lotes', 'lote-c', lote('Dos'))).rejects.toSatisfy(
      esNombreRepetido,
    );
  });

  it('borrar el lote libera su nombre y su reserva', async () => {
    const { deps, almacen } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-a', lote('Uno'));
    expect(almacen.reservas()).toBe(1);

    await borrar(deps, 'u1', 'lotes', 'lote-a');

    expect(almacen.reservas()).toBe(0);
    await expect(guardar(deps, 'u1', 'lotes', 'lote-b', lote('Uno'))).resolves.toBeDefined();
  });

  it('una reserva huérfana (su lote se borró por otro camino) no bloquea el nombre', async () => {
    const { deps, almacen } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-a', lote('Uno'));
    await almacen.marcarBorrado('u1', 'lote', 'lote-a', deps.ahora());
    expect(almacen.reservas()).toBe(1);

    await expect(guardar(deps, 'u1', 'lotes', 'lote-b', lote('Uno'))).resolves.toBeDefined();
  });

  it('cada usuario tiene sus propias claves', async () => {
    const { deps } = crearEntorno();

    await guardar(deps, 'u1', 'lotes', 'lote-a', lote('Uno'));

    await expect(guardar(deps, 'u2', 'lotes', 'lote-a', lote('Uno'))).resolves.toBeDefined();
  });

  it('los lotes anteriores a la regla (sin reserva) se siguen detectando con la comprobación previa', async () => {
    const { deps, almacen } = crearEntorno();
    await almacen.guardar('u1', 'lote', 'viejo', lote('Antiguo'), deps.ahora());

    await expect(guardar(deps, 'u1', 'lotes', 'nuevo', lote('antiguo'))).rejects.toSatisfy(
      esNombreRepetido,
    );
  });

  it('en el envío por lotes, dos lotes con el mismo nombre: uno entra y el otro da 409', async () => {
    const { deps } = crearEntorno();

    const { resultados } = await aplicarCambios(deps, 'u1', {
      cambios: [
        { recurso: 'lotes', id: 'a', cuerpo: lote('Repetido') },
        { recurso: 'lotes', id: 'b', cuerpo: lote('repetido') },
      ],
    });

    expect(resultados.map((r) => r.estado)).toEqual([200, 409]);
  });
});

describe('borrado en cascada de un lote (D99)', () => {
  async function conLoteYCosas() {
    const entorno = crearEntorno();
    const { deps } = entorno;
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote('Uno'));
    await guardar(deps, 'u1', 'lotes', 'lote-2', lote('Dos'));
    await guardar(deps, 'u1', 'labores', 'l1', labor('lote-1'));
    await guardar(deps, 'u1', 'labores', 'l2', labor('lote-1', { fecha: '2026-11-11' }));
    await guardar(deps, 'u1', 'labores', 'otra', labor('lote-2'));
    await guardar(deps, 'u1', 'ciclos', 'c1', ciclo('lote-1'));
    await guardar(deps, 'u2', 'lotes', 'lote-1', lote('Uno'));
    await guardar(deps, 'u2', 'labores', 'l1', labor('lote-1'));
    entorno.avanzar();
    return entorno;
  }

  it('borra también sus labores y sus ciclos, con la misma marca de tiempo', async () => {
    const { deps } = await conLoteYCosas();

    await borrar(deps, 'u1', 'lotes', 'lote-1');

    const ahora = '2026-11-15T10:00:01.000Z';
    for (const recurso of ['lotes', 'labores', 'ciclos'] as const) {
      const { items } = await listar(deps, 'u1', recurso, {});
      for (const item of items.filter((i) => i.lote_id === 'lote-1' || i.id === 'lote-1')) {
        expect(item).toMatchObject({ deleted_at: ahora, updated_at: ahora });
      }
    }
  });

  it('no toca las labores de otros lotes ni las de otro usuario', async () => {
    const { deps } = await conLoteYCosas();

    await borrar(deps, 'u1', 'lotes', 'lote-1');

    const deU1 = (await listar(deps, 'u1', 'labores', {})).items;
    expect(deU1.find((l) => l.id === 'otra')?.deleted_at).toBeNull();
    const deU2 = (await listar(deps, 'u2', 'labores', {})).items;
    expect(deU2.find((l) => l.id === 'l1')?.deleted_at).toBeNull();
    expect((await listar(deps, 'u2', 'lotes', {})).items[0]?.deleted_at).toBeNull();
  });

  it('el resto de teléfonos recibe las bajas en su próxima sincronización (`since`)', async () => {
    const { deps } = await conLoteYCosas();

    await borrar(deps, 'u1', 'lotes', 'lote-1');
    const { items } = await listar(deps, 'u1', 'labores', { since: '2026-11-15T10:00:01.000Z' });

    expect(items.map((i) => i.id).sort()).toEqual(['l1', 'l2']);
    expect(items.every((i) => i.deleted_at !== null)).toBe(true);
  });

  it('repetir el DELETE es inocuo y termina lo que hubiera quedado a medias', async () => {
    const { deps, almacen } = await conLoteYCosas();
    await borrar(deps, 'u1', 'lotes', 'lote-1');
    // Una labor que «reapareció» (p. ej. un PUT tardío de un teléfono): el segundo DELETE la vuelve a bajar.
    await almacen.guardar('u1', 'labor', 'l3', labor('lote-1'), deps.ahora());

    await expect(borrar(deps, 'u1', 'lotes', 'lote-1')).resolves.toEqual({ ok: true });

    const l3 = (await listar(deps, 'u1', 'labores', {})).items.find((i) => i.id === 'l3');
    expect(l3?.deleted_at).not.toBeNull();
  });

  it('borrar una labor suelta NO borra nada más', async () => {
    const { deps } = await conLoteYCosas();

    await borrar(deps, 'u1', 'labores', 'l1');

    const { items } = await listar(deps, 'u1', 'labores', {});
    expect(items.filter((i) => i.deleted_at !== null).map((i) => i.id)).toEqual(['l1']);
  });

  it('un lote que no existe da 404 y no cascada nada', async () => {
    const { deps } = await conLoteYCosas();

    await expect(borrar(deps, 'u1', 'lotes', 'no-existe')).rejects.toMatchObject({ status: 404 });

    const { items } = await listar(deps, 'u1', 'labores', {});
    expect(items.every((i) => i.deleted_at === null)).toBe(true);
  });

  it('también por el envío por lotes', async () => {
    const { deps } = await conLoteYCosas();

    const { resultados } = await aplicarCambios(deps, 'u1', {
      cambios: [{ recurso: 'lotes', id: 'lote-1', borrado: true }],
    });

    expect(resultados[0]?.estado).toBe(200);
    const { items } = await listar(deps, 'u1', 'labores', {});
    expect(items.filter((i) => i.lote_id === 'lote-1').every((i) => i.deleted_at !== null)).toBe(
      true,
    );
  });
});
