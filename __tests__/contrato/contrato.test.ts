import { describe, expect, it } from 'vitest';
import { cicloSchema } from '@/schemas/ciclo';
import { laborSchema } from '@/schemas/labor';
import { loteSchema } from '@/schemas/lote';
import { aplicarCambios, MAXIMO_CAMBIOS } from '@/services/cambiosService';
import {
  LIMITE_MAXIMO,
  LIMITE_POR_DEFECTO,
  PARAMETROS,
  listarLabores,
} from '@/services/consultaLaboresService';
import { guardar, type Recurso } from '@/services/sincronizacionService';
import { crearEntorno } from '../helpers/dobles';
import { leerContrato } from '../helpers/contrato';
import { conUsuarios, contexto, peticion } from '../helpers/rutas';

/**
 * Prueba de contrato (D101): la API cumple lo que dice `contrato/contrato.json`, el mismo archivo que la app
 * guarda y verifica por su lado. Si la API cambia, esto obliga a actualizar el contrato (y la app, en su CI).
 */
const contrato = leerContrato();
const RECURSOS = ['lotes', 'labores', 'ciclos'] as const;
const ESQUEMAS = { lotes: loteSchema, labores: laborSchema, ciclos: cicloSchema } as const;
const CAMPOS_BASE = ['id', 'created_at', 'updated_at', 'deleted_at'];

/** Un usuario con el lote `lote-1` (de la fecha de siembra del ejemplo) para que las labores y ciclos entren. */
async function entornoConLote() {
  const entorno = crearEntorno();
  await guardar(entorno.deps, 'u1', 'lotes', 'lote-1', contrato.recursos.lotes.ejemplo);
  return entorno;
}

describe.each(RECURSOS)('contrato de %s', (nombre: Recurso) => {
  const { campos, opcionales, ejemplo, documento, invalidos } = contrato.recursos[nombre];
  /** El lote del ejemplo ya existe con este nombre: se reescribe el mismo, no otro con el mismo nombre. */
  const idDe = nombre === 'lotes' ? 'lote-1' : 'recurso-1';

  it('el esquema acepta el ejemplo y guarda exactamente los campos del contrato', () => {
    const analizado = ESQUEMAS[nombre].parse(ejemplo);

    expect(Object.keys(analizado).sort()).toEqual([...campos].sort());
    expect(analizado).toEqual(ejemplo);
  });

  it('un cliente antiguo que no envía los campos opcionales sigue siendo aceptado (quedan en null)', () => {
    const sin = Object.fromEntries(
      Object.entries(ejemplo).filter(([c]) => !opcionales.includes(c)),
    );

    const analizado: Record<string, unknown> = ESQUEMAS[nombre].parse(sin);

    for (const campo of opcionales) expect(analizado[campo]).toBeNull();
  });

  it('el documento que devuelve la API tiene los campos del contrato más los del servidor', async () => {
    const entorno = await entornoConLote();

    const doc = await guardar(entorno.deps, 'u1', nombre, idDe, ejemplo);

    expect(Object.keys(doc).sort()).toEqual([...campos, ...CAMPOS_BASE].sort());
    expect(Object.keys(documento).sort()).toEqual([...campos, ...CAMPOS_BASE].sort());
    for (const campo of campos) expect(doc[campo]).toEqual(ejemplo[campo]);
  });

  it.each(invalidos.filter((i) => i.alcance.includes('api')).map((i) => [i.motivo, i] as const))(
    'rechaza %s con un 400 en el campo que dice el contrato',
    async (_motivo, caso) => {
      const entorno = await entornoConLote();

      const intento = guardar(entorno.deps, 'u1', nombre, idDe, {
        ...ejemplo,
        ...caso.cambios,
      });

      await expect(intento).rejects.toSatisfy((error: unknown) => {
        const detalles =
          error instanceof Error && 'detalles' in error
            ? error.detalles
            : error instanceof Error && 'issues' in error
              ? error.issues
              : [];
        const campoDe = (d: unknown) =>
          typeof d === 'object' && d !== null
            ? 'campo' in d
              ? d.campo
              : 'path' in d && Array.isArray(d.path)
                ? d.path[0]
                : undefined
            : undefined;
        return Array.isArray(detalles) && detalles.some((d: unknown) => campoDe(d) === caso.campo);
      });
    },
  );
});

describe('contrato del control de versión', () => {
  it('un conflicto responde con el estado y el campo del contrato', async () => {
    const { campo, conflicto } = contrato.version_base;
    const entorno = await entornoConLote();
    const primero = await guardar(
      entorno.deps,
      'u1',
      'labores',
      'x',
      contrato.recursos.labores.ejemplo,
    );
    entorno.avanzar();
    await guardar(entorno.deps, 'u1', 'labores', 'x', {
      ...contrato.recursos.labores.ejemplo,
      cantidad: 99,
    });

    const intento = guardar(entorno.deps, 'u1', 'labores', 'x', {
      ...contrato.recursos.labores.ejemplo,
      cantidad: 1,
      [campo]: primero.updated_at,
    });

    await expect(intento).rejects.toMatchObject({
      status: conflicto.estado,
      detalles: [{ campo: conflicto.campo }],
    });
    expect(contrato.version_base.recursos).toEqual(['lotes', 'labores']);
  });
});

describe('contrato del envío por lotes', () => {
  it('el límite es el del contrato', () => {
    expect(MAXIMO_CAMBIOS).toBe(contrato.cambios.limite);
    expect(contrato.cambios.ruta).toBe('/api/sync');
  });

  it('la petición de ejemplo produce EXACTAMENTE la respuesta de ejemplo', async () => {
    const entorno = crearEntorno();

    const respuesta = await aplicarCambios(entorno.deps, 'u1', contrato.cambios.peticion);

    expect(JSON.parse(JSON.stringify(respuesta))).toEqual(contrato.cambios.respuesta);
  });
});

describe('contrato de la consulta de labores', () => {
  it('los parámetros y los límites son los del contrato', () => {
    const c = contrato.consulta_labores;

    expect([...PARAMETROS]).toEqual(c.parametros);
    expect(LIMITE_POR_DEFECTO).toBe(c.limite_por_defecto);
    expect(LIMITE_MAXIMO).toBe(c.limite_maximo);
  });

  it('con filtros responde con las claves del contrato y sin ellos con las de la sincronización', async () => {
    const c = contrato.consulta_labores;
    const entorno = await entornoConLote();

    const con = await listarLabores(entorno.deps, 'u1', { lote_id: 'lote-1' });
    const sin = await listarLabores(entorno.deps, 'u1', {});

    expect(Object.keys(con).sort()).toEqual([...c.respuesta_con_filtros].sort());
    expect(Object.keys(sin).sort()).toEqual([...c.respuesta_sincronizacion].sort());
  });
});

describe('contrato del formato de error', () => {
  it('un 400 de validación tiene exactamente la forma y el texto del ejemplo', async () => {
    const { peticion: origen, ejemplo } = contrato.error;
    const { ana, h } = await conUsuarios();
    const base = contrato.recursos.lotes.ejemplo;

    const respuesta = await h.guardar('lotes')(
      peticion('PUT', '/api/lotes/lote-1', { token: ana, cuerpo: { ...base, ...origen.cambios } }),
      contexto('lote-1'),
    );

    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toEqual(ejemplo);
  });
});
