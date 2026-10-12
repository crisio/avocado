/** Une nombres de clase CSS ignorando los vacíos. */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}
