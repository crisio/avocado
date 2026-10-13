import { Link, useNavigate } from 'react-router-dom'
import { Button, Card } from '@avocado/ui'
import { formatNumber } from '../lib/format'
import { useCachedApi } from '../lib/useCachedApi'
import type { Budget } from '../lib/types'
import { Mascot } from './Mascot'

export const CHEAT_PROMPT = '¿Qué comida libre (cheat meal) me recomiendas con mi saldo de la semana?'
export const BULK_PROMPT = '¿Qué me recomiendas para completar lo que me falta de mi volumen?'

/**
 * Saldo de los últimos 7 días (sin hoy) contra la meta y, si alcanza, la comida libre de hoy. Con un toque, Avo
 * recomienda qué comer (en el chat). Para la nutrióloga se ve sin el botón.
 */
export default function WeekBudget({ userId, self }: { userId: string; self: boolean }) {
  const navigate = useNavigate()
  const budget = useCachedApi<Budget | null>(`/budget?user_id=${userId}&offset=${new Date().getTimezoneOffset()}`, 120_000).data

  if (budget === undefined) return null
  if (budget === null)
    return self ? (
      <Card padding="lg">
        <h2 className="av-section-title">Tu saldo de los últimos 7 días</h2>
        <p className="av-text-muted" style={{ margin: 0 }}>
          <Link to="/ajustes">Pon tu meta diaria y tu objetivo en Perfil</Link> y Avo te dirá cuándo te alcanza para una comida libre.
        </p>
      </Card>
    ) : null

  const counted = budget.days.filter((d) => d.counted).length
  const you = self ? 'Tu' : 'Su'
  const bulking = budget.goal === 'subir'
  const under = budget.balance >= 0

  return (
    <Card padding="lg" className="budget-card">
      <div className="budget-card__head">
        <div className="app-stack" style={{ gap: 2 }}>
          <span className="week-hero__label">{you} saldo de los últimos 7 días</span>
          {counted ? (
            <span className={`budget-card__value${under ? '' : ' budget-card__value--over'}`}>
              {formatNumber(Math.abs(budget.balance))} <span className="week-hero__unit">kcal</span>
            </span>
          ) : (
            <span className="budget-card__value">—</span>
          )}
          <span className="av-text-muted">
            {counted
              ? `${under ? 'por debajo' : 'por encima'} de ${self ? 'tu' : 'su'} meta en ${counted} ${counted === 1 ? 'día completo' : 'días completos'}`
              : 'Aún no hay días completos en los últimos 7 días'}
          </span>
        </div>
        <Mascot size={64} play={budget.extra ? (bulking ? 'eat' : 'celebrate') : 'think'} pose={3} />
      </div>

      {!budget.goal ? (
        <p style={{ margin: 0 }}>
          {self ? (
            <>
              <Link to="/ajustes">Elige tu objetivo en Perfil</Link> (bajar, mantener o subir) para saber si te toca comida libre.
            </>
          ) : (
            'Aún no elige su objetivo.'
          )}
        </p>
      ) : budget.extra ? (
        <p className="budget-card__extra">
          {bulking ? (
            <>
              Para {self ? 'tu' : 'su'} volumen, hoy {self ? 'te conviene' : 'le conviene'} comer hasta <strong>{formatNumber(budget.extra)} kcal extra</strong>.
            </>
          ) : (
            <>
              🎉 Hoy {self ? 'te alcanza' : 'le alcanza'} para una <strong>comida libre de hasta {formatNumber(budget.extra)} kcal extra</strong>{' '}
              {self ? 'sin salirte de tu meta' : 'sin salirse de su meta'} de la semana.
            </>
          )}
        </p>
      ) : (
        <p style={{ margin: 0 }} className="av-text-muted">
          {bulking
            ? 'Esta semana va bien con la meta de volumen.'
            : under
              ? 'Todavía no alcanza para una comida libre: unos días más por debajo de la meta y listo.'
              : 'Esta semana va por encima de la meta: mejor esperar para la comida libre.'}
        </p>
      )}

      {self && budget.goal && (
        <Button
          variant={budget.extra ? 'primary' : 'secondary'}
          icon="chat"
          fullWidth
          onClick={() => navigate('/avo', { state: { ask: bulking ? BULK_PROMPT : CHEAT_PROMPT } })}
        >
          {bulking ? 'Ideas para mi volumen' : 'Recomiéndame un cheat meal'}
        </Button>
      )}
      <p className="av-nutrition__note">
        Cuentan los últimos 7 días (sin hoy) con al menos 60 % de la meta registrada{budget.skipped ? ` (${budget.skipped} no cuenta${budget.skipped === 1 ? '' : 'n'} por incompleto${budget.skipped === 1 ? '' : 's'})` : ''}. La comida libre
        se topa a media meta diaria. El plan de {self ? 'tu' : 'su'} nutrióloga manda.
      </p>
    </Card>
  )
}
