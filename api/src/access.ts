import type { Env } from './env'

/** ¿`viewerId` puede ver los datos de `ownerId`? Es él mismo o es su nutrióloga vinculada. */
export async function canSee(env: Env, viewerId: string, ownerId: string) {
  if (viewerId === ownerId) return true
  const link = await env.DB.prepare('SELECT 1 FROM care_links WHERE patient_id = ? AND nutritionist_id = ?')
    .bind(ownerId, viewerId)
    .first()
  return link !== null
}

/** ¿Están vinculados en cualquier dirección? (para ver el perfil del otro) */
export async function areLinked(env: Env, a: string, b: string) {
  const link = await env.DB.prepare(
    'SELECT 1 FROM care_links WHERE (patient_id = ?1 AND nutritionist_id = ?2) OR (patient_id = ?2 AND nutritionist_id = ?1)',
  )
    .bind(a, b)
    .first()
  return link !== null
}
