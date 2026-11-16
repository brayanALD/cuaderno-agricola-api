import { describe, expect, it } from 'vitest';
import { leerEntorno } from '@/lib/entorno';

const base = {
  FIREBASE_PROJECT_ID: 'demo-cuaderno-agricola',
  FIREBASE_WEB_API_KEY: 'clave-web-falsa',
};

describe('leerEntorno', () => {
  it('con los emuladores no hace falta cuenta de servicio', () => {
    const entorno = leerEntorno({
      ...base,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    });

    expect(entorno).toMatchObject({
      proyecto: 'demo-cuaderno-agricola',
      claveWeb: 'clave-web-falsa',
      hostAuthEmulador: '127.0.0.1:9099',
      credenciales: null,
      tokenBlob: null,
    });
  });

  it('sin emulador exige la cuenta de servicio y convierte los \\n literales de la clave privada', () => {
    const entorno = leerEntorno({
      ...base,
      FIREBASE_CLIENT_EMAIL: 'cuenta@proyecto.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: 'linea1\\nlinea2',
      BLOB_READ_WRITE_TOKEN: 'token-real',
    });

    expect(entorno.credenciales).toEqual({
      clientEmail: 'cuenta@proyecto.iam.gserviceaccount.com',
      privateKey: 'linea1\nlinea2',
    });
    expect(entorno.tokenBlob).toBe('token-real');
  });

  it('si faltan variables, el error nombra cuáles pero nunca muestra valores', () => {
    const intento = () => leerEntorno({ FIREBASE_WEB_API_KEY: 'secreto-123' });

    expect(intento).toThrowError(/FIREBASE_PROJECT_ID/);
    expect(intento).not.toThrowError(/secreto-123/);
  });

  it('sin emulador y sin cuenta de servicio falla', () => {
    expect(() => leerEntorno(base)).toThrowError(/FIREBASE_CLIENT_EMAIL.*FIREBASE_PRIVATE_KEY/);
  });

  it('en Vercel jamás se acepta apuntar a un emulador', () => {
    expect(() =>
      leerEntorno({ ...base, VERCEL: '1', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }),
    ).toThrowError(/emulador/);
  });

  it('un token de Blob de ejemplo (el de env.example) se trata como ausente', () => {
    const entorno = leerEntorno({
      ...base,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      BLOB_READ_WRITE_TOKEN: 'token-blob-falso',
    });

    expect(entorno.tokenBlob).toBeNull();
  });
});
