import { describe, expect, it } from 'vitest';
import { borrarImagen, subirImagen, TAMANO_MAXIMO_IMAGEN } from '@/services/imagenesService';
import { produccionDeLote } from '@/services/produccionService';
import { guardar } from '@/services/sincronizacionService';
import { crearEntorno } from '../helpers/dobles';

const lote = {
  nombre: 'El Mirador',
  cultivo: 'Café',
  area_m2: 5000,
  altitud_m: null,
  lat: null,
  lng: null,
  fecha_siembra: '2026-08-16',
};

const cosecha = (fecha: string, cantidad: number, cambios = {}) => ({
  lote_id: 'lote-1',
  tipo: 'cosecha',
  fecha,
  cantidad,
  unidad: 'kg',
  nota: null,
  foto_url: null,
  luz: null,
  ...cambios,
});

describe('produccionDeLote (RF-04 en el servidor)', () => {
  it('suma las cosechas en kg por mes y en total, sin errores de coma flotante', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    await guardar(deps, 'u1', 'labores', 'a', cosecha('2026-10-05', 12.5));
    await guardar(deps, 'u1', 'labores', 'b', cosecha('2026-11-02', 0.1));
    await guardar(deps, 'u1', 'labores', 'c', cosecha('2026-11-10', 0.2));

    const produccion = await produccionDeLote(deps, 'u1', 'lote-1');

    expect(produccion).toEqual({
      lote_id: 'lote-1',
      total_kg: 12.8,
      por_mes: [
        { mes: '2026-10', kg: 12.5 },
        { mes: '2026-11', kg: 0.3 },
      ],
      costo_total: 0,
      costo_por_kg: 0,
    });
  });

  it('no cuenta labores que no son cosecha ni cosechas borradas', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    await guardar(deps, 'u1', 'labores', 'a', cosecha('2026-10-05', 10));
    await guardar(deps, 'u1', 'labores', 'b', cosecha('2026-10-06', 99, { tipo: 'riego' }));
    await guardar(deps, 'u1', 'labores', 'c', cosecha('2026-10-07', 50));
    await deps.almacen.marcarBorrado('u1', 'labor', 'c', deps.ahora());

    expect((await produccionDeLote(deps, 'u1', 'lote-1')).total_kg).toBe(10);
  });

  it('suma el costo de TODAS las labores vivas y lo divide por los kilos cosechados (D93)', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    await guardar(deps, 'u1', 'labores', 'a', cosecha('2026-10-05', 40, { costo: 20000 }));
    await guardar(
      deps,
      'u1',
      'labores',
      'b',
      cosecha('2026-10-06', 5, { tipo: 'abono', costo: 30000 }),
    );
    await guardar(deps, 'u1', 'labores', 'c', cosecha('2026-10-07', 5, { tipo: 'riego' }));
    await guardar(
      deps,
      'u1',
      'labores',
      'd',
      cosecha('2026-10-08', 5, { tipo: 'poda', costo: 99 }),
    );
    await deps.almacen.marcarBorrado('u1', 'labor', 'd', deps.ahora());

    const produccion = await produccionDeLote(deps, 'u1', 'lote-1');

    expect(produccion.costo_total).toBe(50000);
    expect(produccion.costo_por_kg).toBe(1250);
  });

  it('con costos pero sin cosecha, el costo por kg es null (no se divide por cero)', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    await guardar(
      deps,
      'u1',
      'labores',
      'a',
      cosecha('2026-10-05', 5, { tipo: 'abono', costo: 8000 }),
    );

    const produccion = await produccionDeLote(deps, 'u1', 'lote-1');

    expect([produccion.costo_total, produccion.costo_por_kg]).toEqual([8000, null]);
  });

  it('un lote sin cosechas tiene total 0', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    expect(await produccionDeLote(deps, 'u1', 'lote-1')).toEqual({
      lote_id: 'lote-1',
      total_kg: 0,
      por_mes: [],
      costo_total: 0,
      costo_por_kg: null,
    });
  });

  it('aislamiento: el lote de otro usuario o inexistente es un 404', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u2', 'lotes', 'lote-1', lote);

    await expect(produccionDeLote(deps, 'u1', 'lote-1')).rejects.toMatchObject({ status: 404 });
    await expect(produccionDeLote(deps, 'u1', 'nada')).rejects.toMatchObject({ status: 404 });
  });
});

describe('subirImagen', () => {
  const bytes = (n: number) => new Uint8Array(n).buffer;

  it('guarda en usuarios/<uid>/<id>.<ext> y devuelve { url, pathname }', async () => {
    const { deps, imagenes } = crearEntorno();

    const respuesta = await subirImagen(deps, 'u1', 'image/jpeg', bytes(2000));

    expect(respuesta.pathname).toMatch(/^usuarios\/u1\/id-1-\d+\.jpg$/);
    expect(respuesta.url).toContain(respuesta.pathname);
    expect(imagenes.subidas.get(respuesta.pathname)).toEqual({
      bytes: 2000,
      contentType: 'image/jpeg',
    });
  });

  it.each([
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('acepta %s', async (tipo, extension) => {
    const { deps } = crearEntorno();

    const respuesta = await subirImagen(deps, 'u1', tipo, bytes(10));

    expect(respuesta.pathname.endsWith(`.${extension}`)).toBe(true);
  });

  it.each(['image/gif', 'application/pdf', 'text/plain', ''])(
    'rechaza «%s» con 415',
    async (tipo) => {
      const { deps, imagenes } = crearEntorno();

      await expect(subirImagen(deps, 'u1', tipo, bytes(10))).rejects.toMatchObject({ status: 415 });
      expect(imagenes.subidas.size).toBe(0);
    },
  );

  it('una imagen de más de ~4 MB es un 413 y una vacía un 400', async () => {
    const { deps } = crearEntorno();

    await expect(
      subirImagen(deps, 'u1', 'image/jpeg', bytes(TAMANO_MAXIMO_IMAGEN + 1)),
    ).rejects.toMatchObject({ status: 413 });
    await expect(subirImagen(deps, 'u1', 'image/jpeg', bytes(0))).rejects.toMatchObject({
      status: 400,
    });
  });

  it('acepta un Content-Type con parámetros (image/jpeg; charset=binary)', async () => {
    const { deps } = crearEntorno();

    await expect(
      subirImagen(deps, 'u1', 'image/jpeg; charset=binary', bytes(10)),
    ).resolves.toBeTruthy();
  });
});

describe('borrarImagen', () => {
  const propia = 'https://tienda.public.blob.vercel-storage.com/usuarios/u1/id-1-abc.jpg';

  it('borra una imagen propia', async () => {
    const { deps, imagenes } = crearEntorno();

    await expect(borrarImagen(deps, 'u1', propia)).resolves.toEqual({ ok: true });
    expect(imagenes.borradas).toEqual([propia]);
  });

  it('una imagen de otro usuario es un 403 y no se borra', async () => {
    const { deps, imagenes } = crearEntorno();

    await expect(
      borrarImagen(deps, 'u1', 'https://tienda.public.blob.vercel-storage.com/usuarios/u2/x.jpg'),
    ).rejects.toMatchObject({ status: 403 });
    expect(imagenes.borradas).toEqual([]);
  });

  it('un prefijo parecido (usuarios/u10/ para el usuario u1) tampoco vale', async () => {
    const { deps } = crearEntorno();

    await expect(
      borrarImagen(deps, 'u1', 'https://tienda.public.blob.vercel-storage.com/usuarios/u10/x.jpg'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('una URL inválida o ausente es un 400', async () => {
    const { deps } = crearEntorno();

    await expect(borrarImagen(deps, 'u1', 'no-es-url')).rejects.toMatchObject({ status: 400 });
    await expect(borrarImagen(deps, 'u1', null)).rejects.toMatchObject({ status: 400 });
  });

  it('la ruta con «..» codificado no se cuela', async () => {
    const { deps } = crearEntorno();

    await expect(
      borrarImagen(
        deps,
        'u1',
        'https://t.public.blob.vercel-storage.com/usuarios/u1/%2e%2e/u2/x.jpg',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
