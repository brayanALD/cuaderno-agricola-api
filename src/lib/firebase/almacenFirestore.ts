import { createHash } from 'node:crypto';
import type { App } from 'firebase-admin/app';
import {
  FieldPath,
  getFirestore,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Query,
  type Transaction,
} from 'firebase-admin/firestore';
import { z } from 'zod';
import type {
  Almacen,
  Coleccion,
  ConsultaOrdenada,
  Documento,
  Filtros,
  Unicidad,
} from '../puertos';

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
type UnicoDe = (uid: string, coleccion: Coleccion, clave: string) => DocumentReference;

/** Borrados por tanda: Firestore admite 500 escrituras por lote; se deja margen. */
const TANDA_DE_BORRADOS = 400;

function lecturas(
  coleccionDe: ColeccionDe,
): Pick<Almacen, 'listarDesde' | 'obtener' | 'buscar' | 'consultar'> {
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
    /**
     * Igualdades + rango y orden descendente sobre un mismo campo + id: necesita un índice compuesto por cada
     * combinación de igualdades que se use (`firestore.indexes.json`, D97).
     */
    async consultar(uid, coleccion, c: ConsultaOrdenada) {
      let consulta: Query = coleccionDe(uid, coleccion);
      for (const [campo, valor] of Object.entries(c.filtros)) {
        consulta = consulta.where(campo, '==', valor);
      }
      if (c.desde !== undefined) consulta = consulta.where(c.campoOrden, '>=', c.desde);
      if (c.hasta !== undefined) consulta = consulta.where(c.campoOrden, '<=', c.hasta);
      consulta = consulta.orderBy(c.campoOrden, 'desc').orderBy(FieldPath.documentId(), 'desc');
      if (c.despues !== undefined) consulta = consulta.startAfter(c.despues.valor, c.despues.id);
      const instantanea = await consulta.limit(c.limite).get();
      return instantanea.docs.map((doc) => aDocumento(doc.id, doc.data()));
    },
  };
}

interface Reserva {
  readonly nueva: DocumentReference;
  /** La reserva del valor anterior, si este documento la tenía y cambia: se libera al escribir. */
  readonly vieja: DocumentReference | null;
}

interface ContextoDeReserva {
  readonly transaccion: Transaction;
  readonly uid: string;
  readonly coleccion: Coleccion;
  readonly id: string;
  readonly coleccionDe: ColeccionDe;
  readonly unicoDe: UnicoDe;
}

const valorDe = (doc: DocumentSnapshot, unicidad: Unicidad): string =>
  unicidad.clave(String(doc.get(unicidad.campo)));

/** Falla si otro documento VIVO tiene la clave; una reserva huérfana (borrado o renombrado) no cuenta. */
async function exigirClaveLibre(
  c: ContextoDeReserva,
  nueva: DocumentReference,
  clave: string,
  unicidad: Unicidad,
): Promise<void> {
  const ocupada = await c.transaccion.get(nueva);
  const duenoId: unknown = ocupada.exists ? ocupada.get('documento_id') : undefined;
  if (typeof duenoId !== 'string' || duenoId === c.id) return;
  const dueno = await c.transaccion.get(c.coleccionDe(c.uid, c.coleccion).doc(duenoId));
  const vivo =
    dueno.exists && dueno.get('deleted_at') === null && valorDe(dueno, unicidad) === clave;
  if (vivo) throw unicidad.conflicto();
}

/** La reserva del valor anterior de ESTE documento, si cambia de clave y era suya. */
async function reservaAnterior(
  c: ContextoDeReserva,
  previo: DocumentSnapshot,
  clave: string,
  unicidad: Unicidad,
): Promise<DocumentReference | null> {
  if (!previo.exists || valorDe(previo, unicidad) === clave) return null;
  const referencia = c.unicoDe(c.uid, c.coleccion, valorDe(previo, unicidad));
  const reserva = await c.transaccion.get(referencia);
  return reserva.exists && reserva.get('documento_id') === c.id ? referencia : null;
}

/**
 * Reserva la clave dentro de la transacción (D98). TODAS las lecturas van antes de las escrituras (regla de
 * Firestore): primero quién tiene la clave y luego la reserva anterior de este documento.
 */
async function reservar(
  c: ContextoDeReserva,
  previo: DocumentSnapshot,
  campos: Readonly<Record<string, unknown>>,
  unicidad: Unicidad,
): Promise<Reserva> {
  const clave = unicidad.clave(String(campos[unicidad.campo]));
  const nueva = c.unicoDe(c.uid, c.coleccion, clave);
  await exigirClaveLibre(c, nueva, clave, unicidad);
  return { nueva, vieja: await reservaAnterior(c, previo, clave, unicidad) };
}

function guardarDocumento(
  db: Firestore,
  coleccionDe: ColeccionDe,
  unicoDe: UnicoDe,
): Almacen['guardar'] {
  return (uid, coleccion, id, campos, ahora, { verificar, unicidad } = {}) => {
    const referencia = coleccionDe(uid, coleccion).doc(id);
    return db.runTransaction(async (transaccion) => {
      const previo = await transaccion.get(referencia);
      verificar?.(previo.exists ? aDocumento(id, previo.data() ?? {}) : null);
      const contexto = { transaccion, uid, coleccion, id, coleccionDe, unicoDe };
      const reserva =
        unicidad === undefined ? null : await reservar(contexto, previo, campos, unicidad);
      const creado: unknown = previo.exists ? previo.get('created_at') : undefined;
      const documento = aDocumento(id, {
        ...campos,
        created_at: typeof creado === 'string' ? creado : ahora,
        updated_at: ahora,
        deleted_at: null,
      });
      transaccion.set(referencia, documento);
      if (reserva !== null) {
        transaccion.set(reserva.nueva, { documento_id: id });
        if (reserva.vieja !== null) transaccion.delete(reserva.vieja);
      }
      return documento;
    });
  };
}

function marcarDocumentoBorrado(
  db: Firestore,
  coleccionDe: ColeccionDe,
  unicoDe: UnicoDe,
): Almacen['marcarBorrado'] {
  return (uid, coleccion, id, ahora, unicidad) => {
    const referencia = coleccionDe(uid, coleccion).doc(id);
    return db.runTransaction(async (transaccion) => {
      const previo = await transaccion.get(referencia);
      if (!previo.exists) return false;
      const reservaRef =
        unicidad === undefined ? null : unicoDe(uid, coleccion, valorDe(previo, unicidad));
      const reserva = reservaRef === null ? null : await transaccion.get(reservaRef);
      transaccion.update(referencia, { deleted_at: ahora, updated_at: ahora });
      if (reservaRef !== null && reserva?.exists === true && reserva.get('documento_id') === id) {
        transaccion.delete(reservaRef);
      }
      return true;
    });
  };
}

function marcarVariosBorrados(
  db: Firestore,
  coleccionDe: ColeccionDe,
): Almacen['marcarBorradoPorFiltro'] {
  return async (uid, coleccion, filtros, ahora) => {
    let consulta: Query = coleccionDe(uid, coleccion);
    for (const [campo, valor] of Object.entries(filtros)) {
      consulta = consulta.where(campo, '==', valor);
    }
    const docs = (await consulta.get()).docs;
    for (let i = 0; i < docs.length; i += TANDA_DE_BORRADOS) {
      const tanda = db.batch();
      for (const doc of docs.slice(i, i + TANDA_DE_BORRADOS)) {
        tanda.update(doc.ref, { deleted_at: ahora, updated_at: ahora });
      }
      await tanda.commit();
    }
    return docs.length;
  };
}

/**
 * Firestore solo vía Admin SDK (reglas `allow read, write: if false`), con los datos privados en
 * `usuarios/{uid}/<coleccion>/{id}`: el aislamiento entre usuarios lo da la ruta. Las reservas de claves únicas
 * (D98) viven en `usuarios/{uid}/unicos/{sha256(coleccion:clave)}`. Las consultas de sincronización usan
 * igualdad o un solo campo ordenado, así que no necesitan índices; la consulta de labores (D97) sí.
 * Adaptador delgado: solo se puede probar con el emulador o desplegado (D58).
 */
export function crearAlmacenFirestore(app: App): Almacen {
  const db = getFirestore(app);
  const usuario = (uid: string) => db.collection('usuarios').doc(uid);
  const coleccionDe: ColeccionDe = (uid, coleccion) => usuario(uid).collection(coleccion);
  const unicoDe: UnicoDe = (uid, coleccion, clave) =>
    usuario(uid)
      .collection('unicos')
      .doc(createHash('sha256').update(`${coleccion}:${clave}`).digest('hex'));
  return {
    ...lecturas(coleccionDe),
    guardar: guardarDocumento(db, coleccionDe, unicoDe),
    marcarBorrado: marcarDocumentoBorrado(db, coleccionDe, unicoDe),
    marcarBorradoPorFiltro: marcarVariosBorrados(db, coleccionDe),
  };
}
