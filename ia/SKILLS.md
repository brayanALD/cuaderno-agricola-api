# Skills de proyecto · revisadas antes de instalar

Una skill es una instrucción que la IA obedece, así que su `SKILL.md` se **leyó completo** antes de instalarla y se buscó código
sospechoso en el resto de sus archivos. Se instalan **por proyecto** (sin `-g`; el sandbox bloquea leer `~/`), con `--copy` y
desde un clon fijado a un commit, de modo que se instala exactamente lo revisado.

## Instalada en este repositorio (api)

| Skill | Origen y commit revisado | Hash de integridad (`computedHash`) | Para qué |
|---|---|---|---|
| `vitest` | `antfu/skills` @ `d524ed287eef22757297827ce42e3cad88abd20c` | `bd95e41d66d76da9008893c9bc48c30f0a68f352cd2b00017767f5e4c129501d` | Pruebas, mocks (`vi.mock`) y cobertura con Vitest |

Nota: la skill está generada sobre Vitest 5.1 beta; la versión que se instale en el proyecto puede diferir. Ante duda, manda la
documentación de la versión instalada.

## Skills del plugin de Vercel (a nivel de usuario, no del repo)

Útiles: `vercel:nextjs`, `vercel:vercel-storage` (Blob), `vercel:vercel-functions`, `vercel:vercel-firewall` (límite de login).
**Evitar** `vercel:bootstrap` (provisiona recursos reales en la nube) y `vercel:env` (incluye `pull`, prohibido por la configuración de IA).

## Revisadas y rechazadas

| Skill | Motivo |
|---|---|
| `firebase-auth-basics`, `firebase-firestore` | Empujan al SDK de cliente, `firebase deploy` (efecto en la nube) y crear bases Enterprise; contradicen Admin-SDK-solo, las reglas que niegan todo y el desarrollo solo con emulador. Usar la documentación oficial del Admin SDK |

## Reproducir la instalación

```bash
git clone https://github.com/antfu/skills && git -C skills checkout d524ed287eef22757297827ce42e3cad88abd20c
DISABLE_TELEMETRY=1 npx skills add ./skills -s vitest -a claude-code --copy -y
```
