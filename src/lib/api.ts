import { dependencias } from './dependencias';
import { crearManejadores } from './manejadores';

/** Manejadores con las dependencias reales; cada `route.ts` exporta el que le toca. */
export const manejadores = crearManejadores(dependencias);
