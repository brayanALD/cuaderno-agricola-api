// Prueba de humo de la API con los emuladores de Firebase (D2). Verifica lo que las pruebas con dobles
// no pueden: el adaptador de Firestore, la API REST de Firebase Auth y `verifyIdToken` de verdad.
//
//   Terminal 1:  firebase emulators:start --only auth,firestore     (lo corres tú; Java requerido)
//   Terminal 2:  npm run dev                                         (con .env.local copiado de env.example)
//   Terminal 3:  node scripts/humo.mjs                               (API_URL=http://localhost:3000 por defecto)
//
// Sale con código 0 si todos los pasos dan el estado esperado y con 1 si alguno falla.
const base = process.env.API_URL ?? 'http://localhost:3000';
const escribir = (texto) => process.stdout.write(`${texto}\n`);
const correo = `humo-${Date.now()}@correo.com`;
const clave = 'contraseña-de-humo-1';
let fallos = 0;

async function paso(nombre, esperado, ruta, { metodo = 'GET', token, cuerpo } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const json = await respuesta.json().catch(() => null);
  const bien = respuesta.status === esperado;
  if (!bien) fallos += 1;
  escribir(
    `${bien ? 'OK   ' : 'FALLA'} ${String(respuesta.status)} (esperado ${String(esperado)})  ${nombre}`,
  );
  return json;
}

const lote = {
  nombre: 'Lote de humo',
  cultivo: 'Café',
  area_m2: 1000,
  altitud_m: 1500,
  lat: 4.65,
  lng: -75.57,
  fecha_siembra: '2026-08-16',
};
const cosecha = (fecha, cantidad) => ({
  lote_id: 'lote-humo',
  tipo: 'cosecha',
  fecha,
  cantidad,
  unidad: 'kg',
  nota: null,
  foto_url: null,
  luz: null,
});

await paso('health', 200, '/api/health');
await paso('lotes sin token → 401', 401, '/api/lotes');
const registro = await paso('registro', 201, '/api/auth/registro', {
  metodo: 'POST',
  cuerpo: { email: correo, password: clave },
});
await paso('registro repetido → 409', 409, '/api/auth/registro', {
  metodo: 'POST',
  cuerpo: { email: correo, password: clave },
});
await paso('registro con contraseña corta → 400', 400, '/api/auth/registro', {
  metodo: 'POST',
  cuerpo: { email: 'otro@correo.com', password: '123' },
});
await paso('login con contraseña incorrecta → 401', 401, '/api/auth/login', {
  metodo: 'POST',
  cuerpo: { email: correo, password: 'incorrecta-123' },
});
const login = await paso('login', 200, '/api/auth/login', {
  metodo: 'POST',
  cuerpo: { email: correo, password: clave },
});
const token = login?.token;
await paso('yo', 200, '/api/auth/yo', { token });
const renovada = await paso('refresh', 200, '/api/auth/refresh', {
  metodo: 'POST',
  cuerpo: { refreshToken: registro?.refreshToken },
});
await paso('PUT lote', 200, '/api/lotes/lote-humo', {
  metodo: 'PUT',
  token: renovada?.token ?? token,
  cuerpo: lote,
});
await paso('PUT lote con área 0 → 400', 400, '/api/lotes/lote-humo', {
  metodo: 'PUT',
  token,
  cuerpo: { ...lote, area_m2: 0 },
});
await paso('PUT lote con otro id y el mismo nombre → 409', 409, '/api/lotes/lote-otro', {
  metodo: 'PUT',
  token,
  cuerpo: lote,
});
await paso('PUT cosecha 1', 200, '/api/labores/c1', {
  metodo: 'PUT',
  token,
  cuerpo: cosecha('2026-10-05', 12.5),
});
await paso('PUT cosecha 2', 200, '/api/labores/c2', {
  metodo: 'PUT',
  token,
  cuerpo: cosecha('2026-11-02', 8.25),
});
await paso('PUT cosecha con fecha futura → 400 (D96)', 400, '/api/labores/c-futura', {
  metodo: 'PUT',
  token,
  cuerpo: cosecha('2099-01-01', 1),
});
// Consulta de labores (D97). El emulador no exige índices compuestos; el Firestore real sí (firestore.indexes.json).
const primera = await paso(
  'GET labores por lote y tipo, de 1 en 1',
  200,
  '/api/labores?lote_id=lote-humo&tipo=cosecha&limite=1',
  { token },
);
if (primera?.items?.length !== 1 || primera?.items?.[0]?.id !== 'c2' || !primera?.siguiente) {
  fallos += 1;
  escribir('FALLA la primera página debía traer solo c2 (la más reciente) y un cursor');
}
const segunda = await paso(
  'GET labores, página siguiente con cursor',
  200,
  `/api/labores?lote_id=lote-humo&tipo=cosecha&limite=1&cursor=${encodeURIComponent(primera?.siguiente ?? '')}`,
  { token },
);
if (
  segunda?.items?.length !== 1 ||
  segunda?.items?.[0]?.id !== 'c1' ||
  segunda?.siguiente !== null
) {
  fallos += 1;
  escribir('FALLA la segunda página debía traer solo c1 y ningún cursor');
}
await paso('GET labores con limite=0 → 400', 400, '/api/labores?limite=0', { token });
const lista = await paso('GET lotes', 200, '/api/lotes', { token });
escribir(
  `      lotes devueltos: ${String(lista?.items?.length)}, servidor_ahora: ${String(lista?.servidor_ahora)}`,
);
const produccion = await paso('GET producción', 200, '/api/lotes/lote-humo/produccion', { token });
if (produccion?.total_kg !== 20.75) {
  fallos += 1;
  escribir(`FALLA total_kg esperado 20.75, recibido ${String(produccion?.total_kg)}`);
}
await paso('DELETE lote', 200, '/api/lotes/lote-humo', { metodo: 'DELETE', token });
await paso('GET producción de un lote borrado → 404', 404, '/api/lotes/lote-humo/produccion', {
  token,
});
await paso('DELETE de algo inexistente → 404', 404, '/api/lotes/nada', { metodo: 'DELETE', token });
// Borrado en cascada (D99) y nombre liberado (D98).
const tras = await paso(
  'GET labores del lote borrado → ya no hay vivas',
  200,
  '/api/labores?lote_id=lote-humo',
  { token },
);
if (tras?.items?.length !== 0) {
  fallos += 1;
  escribir(
    `FALLA el borrado del lote debía borrar sus labores; quedan ${String(tras?.items?.length)}`,
  );
}
await paso('PUT otro lote con el nombre del borrado → 200', 200, '/api/lotes/lote-otro', {
  metodo: 'PUT',
  token,
  cuerpo: lote,
});
// Unicidad atómica (D98): dos escrituras SIMULTÁNEAS con el mismo nombre; exactamente una debe entrar.
const nombreCarrera = { ...lote, nombre: `Carrera ${String(Date.now())}` };
const carrera = await Promise.all(
  ['carrera-a', 'carrera-b'].map((id) =>
    fetch(`${base}/api/lotes/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(nombreCarrera),
    }).then((r) => r.status),
  ),
);
const gano = carrera.filter((estado) => estado === 200).length;
const perdio = carrera.filter((estado) => estado === 409).length;
if (gano !== 1 || perdio !== 1) fallos += 1;
escribir(
  `${gano === 1 && perdio === 1 ? 'OK   ' : 'FALLA'} carrera por el mismo nombre: ${carrera.join(' y ')} (esperado 200 y 409)`,
);

escribir(fallos === 0 ? '\nTodo en orden.' : `\n${String(fallos)} paso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
