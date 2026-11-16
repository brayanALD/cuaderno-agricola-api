import type { App } from 'firebase-admin/app';
import {
  getFirestore,
  type CollectionReference,
  type DocumentData,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import { z } from 'zod';
import type { Almacen, Coleccion, Documento, Filtros } from '../puertos';

/** Los campos base que pone el servidor; un documento sin ellos está corrupto y falla (500), no se propaga. */
const camposBase = z.looseObject({
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

const aDocumento = (id: string, datos: DocumentData): Documento => ({
  ...camposBase.parse(datos),
  id,
});

type ColeccionDe = (uid: string, coleccion: Coleccion) => CollectionReference;

function lecturas(coleccionDe: ColeccionDe): Pick<Almacen, 'listarDesde' | 'obtener' | 'buscar'> {
  return {
    async listarDesde(uid, coleccion, since, limite) {
      let consulta: Query = coleccionDe(uid, coleccion).orderBy('updated_at');
      if (since !== null) consulta = consulta.where('updated_at', '>=', since);
      const instantanea = await consulta.limit(limite).get();
      return instantanea.docs.map((doc) => aDocumento(doc.id, doc.data()));
    },
    async obtener(uid, coleccion, id) {
      const doc = await coleccionDe(uid, coleccion).doc(id).get();
      return doc.exists ? aDocumento(doc.id, doc.data() ?? {}) : null;
    },
    async buscar(uid, coleccion, filtros: Filtros) {
      let consulta: Query = coleccionDe(uid, coleccion);
      for (const [campo, valor] of Object.entries(filtros)) {
        consulta = consulta.where(campo, '==', valor);
      }
      const instantanea = await consulta.get();
      return instantanea.docs.map((doc) => aDocumento(doc.id, doc.data()));
    },
  };
}

function escrituras(
  db: Firestore,
  coleccionDe: ColeccionDe,
): Pick<Almacen, 'guardar' | 'marcarBorrado'> {
  return {
    guardar(uid, coleccion, id, campos, ahora, verificar) {
      const referencia = coleccionDe(uid, coleccion).doc(id);
      return db.runTransaction(async (transaccion) => {
        const previo = await transaccion.get(referencia);
        verificar?.(previo.exists ? aDocumento(id, previo.data() ?? {}) : null);
        const creado: unknown = previo.exists ? previo.get('created_at') : undefined;
        const documento = aDocumento(id, {
          ...campos,
          created_at: typeof creado === 'string' ? creado : ahora,
          updated_at: ahora,
          deleted_at: null,
        });
        transaccion.set(referencia, documento);
        return documento;
      });
    },
    marcarBorrado(uid, coleccion, id, ahora) {
      const referencia = coleccionDe(uid, coleccion).doc(id);
      return db.runTransaction(async (transaccion) => {
        const previo = await transaccion.get(referencia);
        if (!previo.exists) return false;
        transaccion.update(referencia, { deleted_at: ahora, updated_at: ahora });
        return true;
      });
    },
  };
}

/**
 * Firestore solo vía Admin SDK (reglas `allow read, write: if false`), con los datos privados en
 * `usuarios/{uid}/<coleccion>/{id}`: el aislamiento entre usuarios lo da la ruta. Todas las consultas
 * usan igualdad o un solo campo ordenado, así que no necesitan índices compuestos.
 * Adaptador delgado: solo se puede probar con el emulador o desplegado (D58).
 */
export function crearAlmacenFirestore(app: App): Almacen {
  const db = getFirestore(app);
  const coleccionDe: ColeccionDe = (uid, coleccion) =>
    db.collection('usuarios').doc(uid).collection(coleccion);
  return { ...lecturas(coleccionDe), ...escrituras(db, coleccionDe) };
}
