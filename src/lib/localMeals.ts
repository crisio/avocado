import { useEffect, useMemo } from 'react'
import type { MealJob } from './outbox'
import type { Meal } from './types'

/** Una comida que sigue en la cola, con la forma de una comida del servidor (para pintarla igual). */
export function jobToMeal(job: MealJob, photoUrl: string): Meal {
  return {
    id: job.id,
    user_id: job.userId,
    eaten_at: job.eaten_at,
    photo_url: photoUrl,
    note: job.note,
    cooking: job.cooking ?? null,
    status: 'pending',
    analysis: null,
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    created_at: job.created_at,
    last_comment: null,
  }
}

/** URLs locales (blob:) para las fotos de la cola; se liberan al desmontar. */
export function usePhotoUrls(jobs: MealJob[]) {
  const urls = useMemo(() => new Map(jobs.map((j) => [j.id, URL.createObjectURL(j.photo)])), [jobs])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return urls
}
