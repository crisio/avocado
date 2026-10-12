import type { ReactNode } from 'react'
import { Avatar } from './Avatar'
import { cx } from './cx'

export interface CommentBubbleProps {
  /** Nombre de quien escribe. */
  author: string
  /** nutritionist: burbuja verde (indicación). patient: burbuja blanca. */
  role?: 'nutritionist' | 'patient'
  /** Hora o tiempo relativo ("hace 20 min"). */
  time?: string
  /** El texto del comentario. */
  children: ReactNode
}

/** Comentario en forma de burbuja con avatar. Las indicaciones de la nutrióloga van en verde claro. */
export function CommentBubble({ author, role = 'patient', time, children }: CommentBubbleProps) {
  return (
    <div className={cx('av-comment', `av-comment--${role}`)}>
      <Avatar name={author} size={32} tone={role === 'nutritionist' ? 'accent' : 'soft'} />
      <p className="av-comment__bubble">
        <span className="av-comment__meta">
          <strong>{author}</strong>
          {time ? ` · ${time}` : ''}
        </span>
        {children}
      </p>
    </div>
  )
}
