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

describe('ciclos de cultivo cerrados (D93)', () => {
  const ciclo = {
    lote_id: 'lote-1',
    cultivo: 'Café',
    fecha_inicio: '2026-01-10',
    fecha_fin: '2026-08-15',
    total_kg: 320.5,
  };

  it('se guardan, se listan con ?since= y se borran como los demás recursos', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    const doc = await guardar(deps, 'u1', 'ciclos', 'ciclo-1', ciclo);
    const pagina = await listar(deps, 'u1', 'ciclos', {});

    expect(doc).toMatchObject({ id: 'ciclo-1', ...ciclo, deleted_at: null });
    expect(pagina.items.map((i) => i.id)).toEqual(['ciclo-1']);
    expect(await borrar(deps, 'u1', 'ciclos', 'ciclo-1')).toEqual({ ok: true });
  });

  it('un ciclo de un lote que no existe (o de otro usuario) es un 400', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);

    await expect(guardar(deps, 'u2', 'ciclos', 'ciclo-1', ciclo)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('los ciclos de un usuario no los ve otro', async () => {
    const { deps } = crearEntorno();
    await guardar(deps, 'u1', 'lotes', 'lote-1', lote);
    await guardar(deps, 'u1', 'ciclos', 'ciclo-1', ciclo);

    expect((await listar(deps, 'u2', 'ciclos', {})).items).toEqual([]);
  });

  it('un lote guarda su finca y una labor su producto, carencia y costo', async () => {
    const { deps } = crearEntorno();

    const guardado = await guardar(deps, 'u1', 'lotes', 'lote-1', { ...lote, finca: 'La Aurora' });
    const fumigacion = await guardar(
      deps,
      'u1',
      'labores',
      'f',
      labor({ tipo: 'fumigacion', producto: 'Mancozeb', carencia_dias: 21, costo: 35000 }),
    );

    expect(guardado.finca).toBe('La Aurora');
    expect(fumigacion).toMatchObject({ producto: 'Mancozeb', carencia_dias: 21, costo: 35000 });
  });
});
