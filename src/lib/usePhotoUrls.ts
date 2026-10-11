import { useEffect, useState } from 'react'
import { PHOTO_BUCKET, supabase } from './supabase'

/** URLs firmadas (1 h) para fotos del bucket privado. */
export function usePhotoUrls(paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = paths.join('|')

  useEffect(() => {
    if (paths.length === 0) return
    let cancelled = false
    supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        if (cancelled || !data) return
        const next: Record<string, string> = {}
        for (const item of data) if (item.path && item.signedUrl) next[item.path] = item.signedUrl
        setUrls((prev) => ({ ...prev, ...next }))
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return urls
}
