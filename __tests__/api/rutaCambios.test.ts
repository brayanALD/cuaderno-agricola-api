import { describe, expect, it } from 'vitest';
import { conUsuarios, lote, peticion } from '../helpers/rutas';

describe('POST /api/sync (D95)', () => {
  it('sin token o con token inválido responde 401', async () => {
    const { h } = await conUsuarios();

    const sin = await h.cambios(peticion('POST', '/api/sync', { cuerpo: { cambios: [] } }));
    const malo = await h.cambios(
      peticion('POST', '/api/sync', { token: 'x', cuerpo: { cambios: [] } }),
    );

    expect([sin.status, malo.status]).toEqual([401, 401]);
  });

  it('un cuerpo mal formado es un 400 con detalles', async () => {
    const { h, ana } = await conUsuarios();

    const respuesta = await h.cambios(
      peticion('POST', '/api/sync', { token: ana, cuerpo: { cambios: [] } }),
    );

    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ error: 'Datos inválidos' });
  });

  it('guarda por lotes, los datos son del usuario del token y no se ven desde otra cuenta', async () => {
    const { h, ana, beto } = await conUsuarios();

    const respuesta = await h.cambios(
      peticion('POST', '/api/sync', {
        token: ana,
        cuerpo: { cambios: [{ recurso: 'lotes', id: 'lote-1', cuerpo: lote }] },
      }),
    );
    const deAna = await h.listar('lotes')(peticion('GET', '/api/lotes', { token: ana }));
    const deBeto = await h.listar('lotes')(peticion('GET', '/api/lotes', { token: beto }));

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ resultados: [{ id: 'lote-1', estado: 200 }] });
    expect(((await deAna.json()) as { items: unknown[] }).items).toHaveLength(1);
    expect(((await deBeto.json()) as { items: unknown[] }).items).toHaveLength(0);
  });
});
