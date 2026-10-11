import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** Error con mensaje para mostrar al usuario (en español). */
export function fail(status: ContentfulStatusCode, message: string): never {
  throw new HTTPException(status, { message })
}
