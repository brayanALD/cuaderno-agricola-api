import { describe, expect, it } from 'vitest';
import { GET, dynamic, runtime } from '../../app/api/health/route';

describe('GET /api/health', () => {
  it('responde 200 con el estado ok', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ estado: 'ok' });
  });

  it('corre en el runtime de Node y no se prerenderiza', () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
  });
});
