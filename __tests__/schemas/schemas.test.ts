import { describe, expect, it } from 'vitest';
import { credencialesSchema, refreshSchema } from '@/schemas/auth';
import { consultaSchema, idSchema } from '@/schemas/consulta';
import { laborSchema } from '@/schemas/labor';
import { loteSchema } from '@/schemas/lote';

const campos = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.success ? [] : (r.error?.issues.map((i) => String(i.path[0])) ?? []);

describe('credencialesSchema', () => {
  it('acepta un correo y una contraseña de 8 o más; el correo se normaliza a minúsculas', () => {
    const r = credencialesSchema.safeParse({ email: '  Ana@Correo.COM ', password: '12345678' });

    expect(r.success && r.data).toEqual({ email: 'ana@correo.com', password: '12345678' });
  });

  it('rechaza correo inválido y contraseña corta, con mensajes en español', () => {
    const r = credencialesSchema.safeParse({ email: 'no-es-correo', password: '1234567' });

    expect(campos(r).sort()).toEqual(['email', 'password']);
    expect(!r.success && r.error.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        'Escribe un correo válido.',
        'La contraseña debe tener al menos 8 caracteres.',
      ]),
    );
  });

  it('descarta campos no declarados', () => {
    const r = credencialesSchema.safeParse({ email: 'a@b.co', password: '12345678', rol: 'admin' });

    expect(r.success && Object.keys(r.data)).toEqual(['email', 'password']);
  });
});

describe('refreshSchema', () => {
  it('exige un refreshToken no vacío', () => {
    expect(refreshSchema.safeParse({ refreshToken: 'abc' }).success).toBe(true);
    expect(refreshSchema.safeParse({ refreshToken: '' }).success).toBe(false);
    expect(refreshSchema.safeParse({}).success).toBe(false);
  });
});

describe('consultaSchema e idSchema', () => {
  it('since es opcional y debe ser una fecha ISO 8601 UTC', () => {
    expect(consultaSchema.safeParse({}).success).toBe(true);
    expect(consultaSchema.safeParse({ since: '2026-11-01T15:04:05.000Z' }).success).toBe(true);
    expect(consultaSchema.safeParse({ since: 'ayer' }).success).toBe(false);
  });

  it('el id solo admite letras, números, guion y guion bajo (no se cuela una ruta)', () => {
    expect(idSchema.safeParse('3f2a-9c1b_X').success).toBe(true);
    for (const malo of ['', 'a/b', '../x', 'a b', 'x'.repeat(65)]) {
      expect(idSchema.safeParse(malo).success).toBe(false);
    }
  });
});

const lote = {
  nombre: 'El Mirador',
  cultivo: 'Café',
  area_m2: 5000,
  altitud_m: 1650,
  lat: 4.65,
  lng: -75.57,
  fecha_siembra: '2026-08-16',
};

describe('loteSchema (secciones 7 y 9.4)', () => {
  it('acepta un lote válido y recorta el nombre', () => {
    const r = loteSchema.safeParse({ ...lote, nombre: '  La Loma  ' });

    expect(r.success && r.data.nombre).toBe('La Loma');
  });

  it.each([
    ['área 0', { area_m2: 0 }, 'area_m2'],
    ['área decimal', { area_m2: 10.5 }, 'area_m2'],
    ['altitud 6001', { altitud_m: 6001 }, 'altitud_m'],
    ['altitud negativa', { altitud_m: -1 }, 'altitud_m'],
    ['latitud 91', { lat: 91 }, 'lat'],
    ['fecha inexistente', { fecha_siembra: '2026-02-30' }, 'fecha_siembra'],
    ['nombre vacío', { nombre: '   ' }, 'nombre'],
  ])('rechaza %s', (_nombre, cambios, campo) => {
    expect(campos(loteSchema.safeParse({ ...lote, ...cambios }))).toEqual([campo]);
  });

  it('permite altitud y coordenadas null; no acepta undefined (la regla es «null, no undefined»)', () => {
    expect(loteSchema.safeParse({ ...lote, altitud_m: null, lat: null, lng: null }).success).toBe(
      true,
    );
    const sinLat = Object.fromEntries(Object.entries(lote).filter(([campo]) => campo !== 'lat'));
    expect(campos(loteSchema.safeParse(sinLat))).toEqual(['lat']);
  });

  it('solo conserva los campos declarados (no se guarda el uid ni otros)', () => {
    const r = loteSchema.safeParse({ ...lote, uid: 'otro', created_at: 'x', pending: 1 });

    expect(r.success && Object.keys(r.data).sort()).toEqual([
      'altitud_m',
      'area_m2',
      'cultivo',
      'fecha_siembra',
      'lat',
      'lng',
      'nombre',
    ]);
  });
});

const labor = {
  lote_id: 'lote-1',
  tipo: 'riego',
  fecha: '2026-11-10',
  cantidad: 20,
  unidad: 'L',
  nota: null,
  foto_url: null,
  luz: null,
};

describe('laborSchema (sección 9.4)', () => {
  it('acepta una labor válida', () => {
    expect(laborSchema.safeParse(labor).success).toBe(true);
  });

  it.each([
    ['tipo inválido', { tipo: 'cosechar' }, 'tipo'],
    ['cantidad negativa', { cantidad: -1 }, 'cantidad'],
    ['luz inválida', { luz: 'lluvia' }, 'luz'],
    ['fecha inexistente', { fecha: '2026-13-01' }, 'fecha'],
    ['lote_id con barra', { lote_id: 'a/b' }, 'lote_id'],
    ['foto_url que no es URL', { foto_url: 'no-es-url' }, 'foto_url'],
    ['nota muy larga', { nota: 'x'.repeat(501) }, 'nota'],
  ])('rechaza %s', (_nombre, cambios, campo) => {
    expect(campos(laborSchema.safeParse({ ...labor, ...cambios }))).toEqual([campo]);
  });

  it('acepta una URL https de imagen y descarta campos extra', () => {
    const r = laborSchema.safeParse({
      ...labor,
      foto_url: 'https://tienda.public.blob.vercel-storage.com/usuarios/u1/a.jpg',
      uid: 'otro',
    });

    expect(r.success && r.data.foto_url).toContain('https://');
    expect(r.success && 'uid' in r.data).toBe(false);
  });
});
