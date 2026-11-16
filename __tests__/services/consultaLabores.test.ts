import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { ErrorHttp } from '@/lib/errores';
import {
  LIMITE_MAXIMO,
  LIMITE_POR_DEFECTO,
  listarLabores,
  type PaginaDeLabores,
} from '@/services/consultaLaboresService';
import { borrar, guardar } from '@/services/sincronizacionService';
import { crearEntorno } from '../helpers/dobles';

const lote = {
  nombre: 'El Mirador',
  cultivo: 'Café',
  area_m2: 5000,
  altitud_m: 1650,
  lat: 4.65,
  lng: -75.57,
  fecha_siembra: '2026-01-01',
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

/** Un usuario con un lote y estas labores: [id, tipo, fecha]. */
async function sembrar(filas: readonly (readonly [string, string, string])[] = []) {
  const entorno = crearEntorno();
  await guardar(entorno.deps, 'u1', 'lotes', 'lote-1', lote);
  for (const [id, tipo, fecha] of filas) {
    await guardar(entorno.deps, 'u1', 'labores', id, labor({ tipo, fecha }));
  }
  return entorno;
}

const pagina = async (
  entorno: Awaited<ReturnType<typeof sembrar>>,
  consulta: Record<string, string>,
  uid = 'u1',
) => (await listarLabores(entorno.deps, uid, consulta)) as PaginaDeLabores;

const ids = (p: PaginaDeLabores) => p.items.map((d) => d.id);

async function rechazo(promesa: Promise<unknown>) {
  try {
    await promesa;
    return null;
  } catch (error) {
    if (error instanceof ZodError) return { status: 400, campo: error.issues[0]?.path[0] };
    if (error instanceof ErrorHttp)
      return { status: error.status, campo: error.detalles?.[0]?.campo };
    return 'otro';
  }
}

const FILAS = [
  ['a', 'riego', '2026-11-01'],
  ['b', 'cosecha', '2026-11-05'],
  ['c', 'riego', '2026-11-05'],
  ['d', 'abono', '2026-11-09'],
  ['e', 'riego', '2026-11-12'],
] as const;

describe('GET /api/labores sin filtros (sincronización, sección 9.3)', () => {
  it('sigue devolviendo { items, servidor_ahora } con los borrados lógicos incluidos y sin cursor', async () => {
    const e = await sembrar(FILAS);
    await borrar(e.deps, 'u1', 'labores', 'a');

    const respuesta = await listarLabores(e.deps, 'u1', {});

    expect(Object.keys(respuesta).sort()).toEqual(['items', 'servidor_ahora']);
    expect(respuesta.items).toHaveLength(5);
  });

  it('`since` sigue funcionando igual que antes', async () => {
    const e = await sembrar(FILAS);
    e.avanzar();
    await guardar(e.deps, 'u1', 'labores', 'f', labor({ fecha: '2026-11-13' }));

    const respuesta = await listarLabores(e.deps, 'u1', { since: '2026-11-15T10:00:01.000Z' });

    expect(respuesta.items.map((d) => d.id)).toEqual(['f']);
  });
});

describe('GET /api/labores con filtros (D97)', () => {
  it('devuelve solo las vivas, de la más reciente a la más antigua, con desempate por id', async () => {
    const e = await sembrar(FILAS);
    await borrar(e.deps, 'u1', 'labores', 'd');

    const p = await pagina(e, { lote_id: 'lote-1' });

    expect(ids(p)).toEqual(['e', 'c', 'b', 'a']);
    expect(p.siguiente).toBeNull();
    expect(p.servidor_ahora).toBe('2026-11-15T10:00:00.000Z');
  });

  it('filtra por tipo', async () => {
    const e = await sembrar(FILAS);

    expect(ids(await pagina(e, { tipo: 'riego' }))).toEqual(['e', 'c', 'a']);
    expect(ids(await pagina(e, { tipo: 'cosecha' }))).toEqual(['b']);
  });

  it('filtra por lote: solo las de ese lote', async () => {
    const e = await sembrar(FILAS);
    await guardar(e.deps, 'u1', 'lotes', 'lote-2', { ...lote, nombre: 'Otro' });
    await guardar(e.deps, 'u1', 'labores', 'z', labor({ lote_id: 'lote-2' }));

    expect(ids(await pagina(e, { lote_id: 'lote-2' }))).toEqual(['z']);
    expect(ids(await pagina(e, { lote_id: 'lote-1' }))).toHaveLength(5);
  });

  it('el rango desde/hasta incluye los extremos y se puede abrir por un lado', async () => {
    const e = await sembrar(FILAS);

    expect(ids(await pagina(e, { desde: '2026-11-05', hasta: '2026-11-09' }))).toEqual([
      'd',
      'c',
      'b',
    ]);
    expect(ids(await pagina(e, { desde: '2026-11-09' }))).toEqual(['e', 'd']);
    expect(ids(await pagina(e, { hasta: '2026-11-01' }))).toEqual(['a']);
  });

  it('combina todos los filtros', async () => {
    const e = await sembrar(FILAS);

    const p = await pagina(e, {
      lote_id: 'lote-1',
      tipo: 'riego',
      desde: '2026-11-02',
      hasta: '2026-11-30',
    });

    expect(ids(p)).toEqual(['e', 'c']);
  });

  it('un lote que no existe da una lista vacía, no un error', async () => {
    const e = await sembrar(FILAS);

    expect(ids(await pagina(e, { lote_id: 'no-existe' }))).toEqual([]);
  });

  it('no deja ver las labores de otro usuario, ni filtrando por su lote', async () => {
    const e = await sembrar(FILAS);

    expect(ids(await pagina(e, { lote_id: 'lote-1' }, 'u2'))).toEqual([]);
    expect(ids(await pagina(e, { tipo: 'riego' }, 'u2'))).toEqual([]);
  });
});

describe('paginación con cursor (D97)', () => {
  it('recorre todas las páginas sin repetir ni perder ninguna, también con fechas iguales', async () => {
    const e = await sembrar(FILAS);
    const vistas: string[] = [];
    let cursor: string | undefined;

    for (let paso = 0; paso < 10; paso += 1) {
      const p = await pagina(e, { limite: '2', ...(cursor === undefined ? {} : { cursor }) });
      vistas.push(...ids(p));
      if (p.siguiente === null) break;
      cursor = p.siguiente;
    }

    expect(vistas).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it('la última página no trae cursor; si el total es justo el límite tampoco', async () => {
    const e = await sembrar(FILAS);

    expect((await pagina(e, { limite: '5' })).siguiente).toBeNull();
    expect((await pagina(e, { limite: '4' })).siguiente).not.toBeNull();
    expect(ids(await pagina(e, { limite: '10' }))).toHaveLength(5);
  });

  it('el cursor sigue valiendo aunque en medio se borre o se añada algo', async () => {
    const e = await sembrar(FILAS);
    const primera = await pagina(e, { limite: '2' });
    await borrar(e.deps, 'u1', 'labores', 'c');
    await guardar(e.deps, 'u1', 'labores', 'nueva', labor({ fecha: '2026-11-14' }));

    const segunda = await pagina(e, { limite: '2', cursor: primera.siguiente ?? '' });

    expect(ids(segunda)).toEqual(['b', 'a']);
  });

  it('el límite por defecto es 100 y el máximo 500', async () => {
    const e = await sembrar();
    for (let i = 0; i < LIMITE_POR_DEFECTO + 1; i += 1) {
      await e.almacen.guardar(
        'u1',
        'labor',
        `x${String(i).padStart(3, '0')}`,
        labor(),
        '2026-11-15T10:00:00.000Z',
      );
    }

    const p = await pagina(e, { lote_id: 'lote-1' });

    expect(p.items).toHaveLength(LIMITE_POR_DEFECTO);
    expect(p.siguiente).not.toBeNull();
    expect(LIMITE_MAXIMO).toBe(500);
  });
});

describe('validación de la consulta (400)', () => {
  it.each([
    ['limite 0', { limite: '0' }, 'limite'],
    ['limite mayor que el máximo', { limite: '501' }, 'limite'],
    ['limite que no es número', { limite: 'muchos' }, 'limite'],
    ['limite decimal', { limite: '1.5' }, 'limite'],
    ['tipo inventado', { tipo: 'baile' }, 'tipo'],
    ['fecha inexistente', { desde: '2026-02-30' }, 'desde'],
    ['fecha mal escrita', { hasta: 'ayer' }, 'hasta'],
    ['desde posterior a hasta', { desde: '2026-11-10', hasta: '2026-11-01' }, 'desde'],
    ['lote_id con caracteres raros', { lote_id: '../otro' }, 'lote_id'],
    ['since combinado con filtros', { since: '2026-11-01T00:00:00.000Z', tipo: 'riego' }, 'since'],
  ])('rechaza %s', async (_nombre, consulta, campo) => {
    const e = await sembrar(FILAS);

    expect(await rechazo(listarLabores(e.deps, 'u1', consulta))).toEqual({ status: 400, campo });
  });

  it.each([
    ['que no es base64 de un JSON', '%%%'],
    ['de un JSON con otra forma', Buffer.from('{"a":1}').toString('base64url')],
    ['con un id peligroso', Buffer.from('{"f":"2026-11-01","i":"../x"}').toString('base64url')],
    ['con una fecha inválida', Buffer.from('{"f":"ayer","i":"a"}').toString('base64url')],
    ['demasiado largo', 'a'.repeat(301)],
  ])('rechaza un cursor %s', async (_nombre, cursor) => {
    const e = await sembrar(FILAS);

    expect(await rechazo(listarLabores(e.deps, 'u1', { cursor }))).toEqual({
      status: 400,
      campo: 'cursor',
    });
  });
});
