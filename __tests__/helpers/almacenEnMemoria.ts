import type {
  Almacen,
  Coleccion,
  ConsultaOrdenada,
  Documento,
  Filtros,
  OpcionesGuardar,
  Unicidad,
} from '@/lib/puertos';

/** Almacén en memoria con la misma semántica que Firestore bajo `usuarios/{uid}/…`. */
export class AlmacenEnMemoria implements Almacen {
  private readonly documentos = new Map<string, Documento>();

  private clave(uid: string, coleccion: Coleccion, id: string): string {
    return `${uid}/${coleccion}/${id}`;
  }

  private delUsuario(uid: string, coleccion: Coleccion): Documento[] {
    const prefijo = `${uid}/${coleccion}/`;
    return [...this.documentos.entries()].filter(([k]) => k.startsWith(prefijo)).map(([, d]) => d);
  }

  listarDesde(uid: string, coleccion: Coleccion, since: string | null, limite: number) {
    const docs = this.delUsuario(uid, coleccion)
      .filter((d) => since === null || d.updated_at >= since)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id));
    return Promise.resolve(docs.slice(0, limite));
  }

  obtener(uid: string, coleccion: Coleccion, id: string) {
    return Promise.resolve(this.documentos.get(this.clave(uid, coleccion, id)) ?? null);
  }

  buscar(uid: string, coleccion: Coleccion, filtros: Filtros) {
    const docs = this.delUsuario(uid, coleccion).filter((d) =>
      Object.entries(filtros).every(([campo, valor]) => d[campo] === valor),
    );
    return Promise.resolve(docs);
  }

  /** Reservas de claves únicas (D98): `uid/coleccion/clave` → id del documento que la tiene. */
  private readonly unicos = new Map<string, string>();

  private llaveUnica(uid: string, coleccion: Coleccion, clave: string): string {
    return `${uid}/${coleccion}/${clave}`;
  }

  /** Misma regla que el adaptador de Firestore: una reserva de un documento borrado o renombrado no cuenta. */
  private reservar(
    uid: string,
    coleccion: Coleccion,
    id: string,
    previo: Documento | undefined,
    campos: Readonly<Record<string, unknown>>,
    unicidad: Unicidad,
  ): void {
    const clave = unicidad.clave(String(campos[unicidad.campo]));
    const llave = this.llaveUnica(uid, coleccion, clave);
    const duenoId = this.unicos.get(llave);
    if (duenoId !== undefined && duenoId !== id) {
      const dueno = this.documentos.get(this.clave(uid, coleccion, duenoId));
      const vivo =
        dueno !== undefined &&
        dueno.deleted_at === null &&
        unicidad.clave(String(dueno[unicidad.campo])) === clave;
      if (vivo) throw unicidad.conflicto();
    }
    if (previo !== undefined) {
      const llaveVieja = this.llaveUnica(
        uid,
        coleccion,
        unicidad.clave(String(previo[unicidad.campo])),
      );
      if (llaveVieja !== llave && this.unicos.get(llaveVieja) === id)
        this.unicos.delete(llaveVieja);
    }
    this.unicos.set(llave, id);
  }

  /** Cuántas reservas de claves únicas hay (para comprobar que se liberan). */
  reservas(): number {
    return this.unicos.size;
  }

  /** Como Firestore: un fallo dentro de la operación es una promesa rechazada, no una excepción síncrona. */
  guardar(
    uid: string,
    coleccion: Coleccion,
    id: string,
    campos: Record<string, unknown>,
    ahora: string,
    opciones: OpcionesGuardar = {},
  ): Promise<Documento> {
    return new Promise((resolver) => {
      resolver(this.guardarYa(uid, coleccion, id, campos, ahora, opciones));
    });
  }

  private guardarYa(
    uid: string,
    coleccion: Coleccion,
    id: string,
    campos: Record<string, unknown>,
    ahora: string,
    opciones: OpcionesGuardar,
  ): Documento {
    const previo = this.documentos.get(this.clave(uid, coleccion, id));
    opciones.verificar?.(previo ?? null);
    if (opciones.unicidad !== undefined) {
      this.reservar(uid, coleccion, id, previo, campos, opciones.unicidad);
    }
    const documento: Documento = {
      ...campos,
      id,
      created_at: previo?.created_at ?? ahora,
      updated_at: ahora,
      deleted_at: null,
    };
    this.documentos.set(this.clave(uid, coleccion, id), documento);
    return documento;
  }

  marcarBorrado(uid: string, coleccion: Coleccion, id: string, ahora: string, unicidad?: Unicidad) {
    const previo = this.documentos.get(this.clave(uid, coleccion, id));
    if (!previo) return Promise.resolve(false);
    if (unicidad !== undefined) {
      const llave = this.llaveUnica(uid, coleccion, unicidad.clave(String(previo[unicidad.campo])));
      if (this.unicos.get(llave) === id) this.unicos.delete(llave);
    }
    this.documentos.set(this.clave(uid, coleccion, id), {
      ...previo,
      updated_at: ahora,
      deleted_at: ahora,
    });
    return Promise.resolve(true);
  }

  marcarBorradoPorFiltro(uid: string, coleccion: Coleccion, filtros: Filtros, ahora: string) {
    const coinciden = this.delUsuario(uid, coleccion).filter((d) =>
      Object.entries(filtros).every(([campo, valor]) => d[campo] === valor),
    );
    for (const doc of coinciden) {
      this.documentos.set(this.clave(uid, coleccion, doc.id), {
        ...doc,
        updated_at: ahora,
        deleted_at: ahora,
      });
    }
    return Promise.resolve(coinciden.length);
  }

  consultar(uid: string, coleccion: Coleccion, c: ConsultaOrdenada) {
    const texto = (doc: Documento): string => String(doc[c.campoOrden]);
    const docs = this.delUsuario(uid, coleccion)
      .filter((d) => Object.entries(c.filtros).every(([campo, valor]) => d[campo] === valor))
      .filter((d) => c.desde === undefined || texto(d) >= c.desde)
      .filter((d) => c.hasta === undefined || texto(d) <= c.hasta)
      .sort((a, b) => texto(b).localeCompare(texto(a)) || b.id.localeCompare(a.id))
      .filter((d) => {
        const despues = c.despues;
        if (despues === undefined) return true;
        return texto(d) < despues.valor || (texto(d) === despues.valor && d.id < despues.id);
      });
    return Promise.resolve(docs.slice(0, c.limite));
  }

  /** Para que las pruebas lean sin pasar por el puerto. */
  todos(): Documento[] {
    return [...this.documentos.values()];
  }
}
