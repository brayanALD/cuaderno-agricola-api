import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ConsultaOrdenada } from '@/lib/puertos';
import { listarLabores } from '@/services/consultaLaboresService';
import { crearEntorno } from '../helpers/dobles';
import { conUsuarios, contexto, labor, lote, peticion } from '../helpers/rutas';

async function conLabores() {
  const m = await conUsuarios();
  await m.h.guardar('lotes')(
    peticion('PUT', '/api/lotes/lote-1', { token: m.ana, cuerpo: lote }),
    contexto('lote-1'),
  );
  for (const [id, fecha] of [
    ['a', '2026-10-01'],
    ['b', '2026-10-05'],
    ['c', '2026-10-09'],
  ] as const) {
    await m.h.guardar('labores')(
      peticion('PUT', `/api/labores/${id}`, { token: m.ana, cuerpo: { ...labor, fecha } }),
      contexto(id),
    );
  }
  return m;
}

const pedir = (m: Awaited<ReturnType<typeof conLabores>>, consulta: string, token?: string) =>
  m.h.listar('labores')(peticion('GET', `/api/labores${consulta}`, { token }));

describe('GET /api/labores con filtros y paginación (D97)', () => {
  it('exige sesión', async () => {
    const m = await conLabores();

    expect((await pedir(m, '?lote_id=lote-1')).status).toBe(401);
    expect((await pedir(m, '?lote_id=lote-1', 'tok:nadie')).status).toBe(401);
  });

  it('pagina con ?limite= y ?cursor= y devuelve los más recientes primero', async () => {
    const m = await conLabores();

    const primera = await pedir(m, '?lote_id=lote-1&limite=2', m.ana);
    const cuerpo = (await primera.json()) as { items: { id: string }[]; siguiente: string };
    const segunda = await pedir(
      m,
      `?lote_id=lote-1&limite=2&cursor=${encodeURIComponent(cuerpo.siguiente)}`,
      m.ana,
    );
    const resto = (await segunda.json()) as { items: { id: string }[]; siguiente: string | null };

    expect(primera.status).toBe(200);
    expect(cuerpo.items.map((i) => i.id)).toEqual(['c', 'b']);
    expect(resto.items.map((i) => i.id)).toEqual(['a']);
    expect(resto.siguiente).toBeNull();
  });

  it('un parámetro inválido es un 400 con su detalle', async () => {
    const m = await conLabores();

    const respuesta = await pedir(m, '?limite=0', m.ana);

    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({
      error: 'Datos inválidos',
      detalles: [{ campo: 'limite' }],
    });
  });

  it('otro usuario no ve nada, ni con el id de lote de Ana', async () => {
    const m = await conLabores();

    const respuesta = await pedir(m, '?lote_id=lote-1', m.beto);

    expect(((await respuesta.json()) as { items: unknown[] }).items).toEqual([]);
  });

  it('sin parámetros sigue siendo la sincronización de 9.3', async () => {
    const m = await conLabores();

    const cuerpo = (await (await pedir(m, '', m.ana)).json()) as Record<string, unknown>;

    expect(Object.keys(cuerpo).sort()).toEqual(['items', 'servidor_ahora']);
  });
});

describe('índices de Firestore para la consulta de labores (D97)', () => {
  interface Indice {
    collectionGroup: string;
    queryScope: string;
    fields: { fieldPath: string; order: string }[];
  }

  /** Todas las formas de consulta que puede generar `listarLabores`, vistas desde el puerto. */
  async function consultasPosibles(): Promise<ConsultaOrdenada[]> {
    const { deps, almacen } = crearEntorno();
    const vistas: ConsultaOrdenada[] = [];
    const original = almacen.consultar.bind(almacen);
    almacen.consultar = (uid, coleccion, consulta) => {
      vistas.push(consulta);
      return original(uid, coleccion, consulta);
    };
    const parametros = [
      {},
      { lote_id: 'l' },
      { tipo: 'riego' },
      { lote_id: 'l', tipo: 'riego' },
      { limite: '5' },
      { desde: '2026-01-01', hasta: '2026-12-31' },
    ];
    for (const consulta of parametros) {
      await listarLabores(deps, 'u1', consulta).catch(() => undefined);
    }
    return vistas;
  }

  it('cada combinación de igualdades que se consulta tiene su índice compuesto declarado', async () => {
    const indices = (
      JSON.parse(readFileSync('firestore.indexes.json', 'utf8')) as { indexes: Indice[] }
    ).indexes;
    const consultas = await consultasPosibles();
    expect(consultas.length).toBeGreaterThanOrEqual(5);

    for (const c of consultas) {
      const igualdades = Object.keys(c.filtros).sort();
      const hay = indices.some((indice) => {
        const campos = indice.fields.map((f) => f.fieldPath);
        const ultimo = indice.fields.at(-1);
        return (
          indice.collectionGroup === 'labor' &&
          indice.queryScope === 'COLLECTION' &&
          ultimo?.fieldPath === c.campoOrden &&
          ultimo.order === 'DESCENDING' &&
          [...campos.slice(0, -1)].sort().join() === igualdades.join()
        );
      });
      expect(hay, `falta un índice para ${igualdades.join('+')} ordenado por ${c.campoOrden}`).toBe(
        true,
      );
    }
  });
});
