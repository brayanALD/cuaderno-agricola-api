import { responderError, ErrorHttp } from './errores';
import { leerJson, tokenBearer } from './peticion';
import type { Dependencias, Identidad } from './puertos';
import {
  iniciarSesion,
  miPerfil,
  recuperarPassword,
  refrescar,
  registrar,
} from '@/services/authService';
import { borrarImagen, subirImagen, TAMANO_MAXIMO_IMAGEN } from '@/services/imagenesService';
import { produccionDeLote } from '@/services/produccionService';
import { borrar, guardar, listar, type Recurso } from '@/services/sincronizacionService';

export type ObtenerDependencias = () => Dependencias;
export type Manejador<P = Record<string, never>> = (
  request: Request,
  contexto?: { params: Promise<P> },
) => Promise<Response>;

interface Entrada<P> {
  readonly deps: Dependencias;
  readonly request: Request;
  readonly identidad: Identidad;
  readonly params: P;
}

/** Ruta pública: cualquier error se convierte en la respuesta de error de la API. */
function publica(
  obtener: ObtenerDependencias,
  accion: (deps: Dependencias, request: Request) => Promise<Response>,
): Manejador {
  return async (request) => {
    try {
      return await accion(obtener(), request);
    } catch (error) {
      return responderError(error);
    }
  };
}

/** Ruta privada: exige `Authorization: Bearer`, verifica el ID token y entrega el `uid` verificado. */
function privada<P = Record<string, never>>(
  obtener: ObtenerDependencias,
  accion: (entrada: Entrada<P>) => Promise<Response>,
): Manejador<P> {
  return async (request, contexto) => {
    try {
      const deps = obtener();
      const identidad = await deps.auth.verificar(tokenBearer(request));
      const params = (contexto ? await contexto.params : undefined) as P;
      return await accion({ deps, request, identidad, params });
    } catch (error) {
      return responderError(error);
    }
  };
}

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status });

/** Todos los manejadores de la API; cada `route.ts` exporta el que le toca. */
export function crearManejadores(obtener: ObtenerDependencias) {
  return {
    registro: publica(obtener, async (deps, request) =>
      json(await registrar(deps, await leerJson(request)), 201),
    ),
    login: publica(obtener, async (deps, request) =>
      json(await iniciarSesion(deps, await leerJson(request))),
    ),
    refresh: publica(obtener, async (deps, request) =>
      json(await refrescar(deps, await leerJson(request))),
    ),
    recuperar: publica(obtener, async (deps, request) =>
      json(await recuperarPassword(deps, await leerJson(request))),
    ),
    yo: privada(obtener, ({ identidad }) => Promise.resolve(json(miPerfil(identidad)))),

    listar: (recurso: Recurso) =>
      privada(obtener, async ({ deps, request, identidad }) => {
        const consulta = Object.fromEntries(new URL(request.url).searchParams);
        return json(await listar(deps, identidad.uid, recurso, consulta));
      }),
    guardar: (recurso: Recurso) =>
      privada<{ id: string }>(obtener, async ({ deps, request, identidad, params }) =>
        json(await guardar(deps, identidad.uid, recurso, params.id, await leerJson(request))),
      ),
    borrar: (recurso: Recurso) =>
      privada<{ id: string }>(obtener, async ({ deps, identidad, params }) =>
        json(await borrar(deps, identidad.uid, recurso, params.id)),
      ),
    produccion: privada<{ id: string }>(obtener, async ({ deps, identidad, params }) =>
      json(await produccionDeLote(deps, identidad.uid, params.id)),
    ),

    subirImagen: privada(obtener, async ({ deps, request, identidad }) => {
      const declarado = Number(request.headers.get('content-length') ?? 0);
      if (declarado > TAMANO_MAXIMO_IMAGEN) throw new ErrorHttp(413, 'La imagen pesa más de 4 MB');
      const tipo = request.headers.get('content-type') ?? '';
      return json(await subirImagen(deps, identidad.uid, tipo, await request.arrayBuffer()), 201);
    }),
    borrarImagen: privada(obtener, async ({ deps, request, identidad }) =>
      json(await borrarImagen(deps, identidad.uid, new URL(request.url).searchParams.get('url'))),
    ),
  };
}
