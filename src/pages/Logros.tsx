import { useState } from 'react'
import { Card, Notice, PageHeader, Screen } from '@avocado/ui'
import { useAuth } from '../auth'
import { Bar } from '../components/AchievementsCard'
import { Mascot } from '../components/Mascot'
import TopBar from '../components/TopBar'
import { GROUP_LABELS, GROUP_ORDER, useAchievements, useEquip, type Accessory } from '../lib/achievements'
import { useNavigate } from 'react-router-dom'

const dateFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })

export default function Logros() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data, error } = useAchievements()
  const equip = useEquip()
  const [error2, setError] = useState<string | null>(null)
  // Lo que se ve en la vista previa: lo equipado, o lo último que tocó.
  const equipped = user?.avo_accessory ?? null
  const worn = data?.accessories.find((a) => a.key === equipped) ?? null

  async function choose(a: Accessory) {
    setError(null)
    try {
      await equip(equipped === a.key ? null : a.key)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Screen withTabBar>
      <TopBar onBack={() => navigate(-1)} />
      <PageHeader eyebrow="Logros" title="Tus logros y tu Avo" compact />
      {!data && error && <Notice tone="error">No se pudieron cargar tus logros.</Notice>}
      {data && (
        <>
          <Card padding="lg" className="logros-hero">
            <Mascot size={96} base="idle" accessory={worn ?? null} interactive />
            <div className="logros-hero__text">
              <strong>🔥 Racha: {data.streak.current} {data.streak.current === 1 ? 'día' : 'días'}</strong>
              <span className="av-text-muted">récord {data.streak.best} · 🏅 {data.summary.unlocked} de {data.summary.total} medallas</span>
            </div>
          </Card>

          {data.challenges.length > 0 && (
            <section className="logros-section" aria-label="Retos de la semana">
              <h2 className="logros-section__title">Retos de la semana</h2>
              {data.challenges.map((c) => (
                <Card key={c.key} padding="md" className="logro-challenge">
                  <span className="logro-challenge__emoji" aria-hidden="true">{c.emoji}</span>
                  <div className="logro-challenge__body">
                    <strong>{c.title}</strong>
                    <span className="av-text-muted">{c.description}</span>
                    <Bar value={c.progress} max={c.target} done={c.done} />
                    <span className="logro-challenge__foot">
                      {c.done ? '✅ ¡Cumplido!' : `${Math.min(c.progress, c.target)}/${c.target} · Termina el domingo`}
                    </span>
                  </div>
                </Card>
              ))}
            </section>
          )}

          <section className="logros-section" aria-label="Medallas">
            <h2 className="logros-section__title">Medallas</h2>
            {GROUP_ORDER.map((g) => {
              const medals = data.medals.filter((m) => m.group === g)
              if (!medals.length) return null
              return (
                <div key={g} className="logros-group">
                  <h3 className="logros-group__title">{GROUP_LABELS[g]}</h3>
                  <ul className="medal-grid">
                    {medals.map((m) => {
                      const on = !!m.unlocked_at
                      return (
                        <li key={m.key} className={`medal${on ? '' : ' medal--locked'}`} title={m.description}>
                          <span className="medal__emoji" aria-hidden="true">{m.emoji}</span>
                          <strong className="medal__title">{m.title}</strong>
                          {on ? (
                            <span className="medal__sub">{dateFmt.format(new Date(m.unlocked_at!))}</span>
                          ) : (
                            <>
                              <span className="medal__sub">{Math.min(m.progress, m.target)}/{m.target}</span>
                              <Bar value={m.progress} max={m.target} thin />
                            </>
                          )}
                          <span className="sr-only">{on ? `Desbloqueada. ${m.description}` : `Bloqueada. ${m.description}`}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </section>

          <section className="logros-section" aria-label="Tu Avo">
            <h2 className="logros-section__title">Tu Avo</h2>
            <Card padding="md" className="logros-preview">
              <Mascot size={120} base="idle" accessory={worn ?? null} />
              <span className="av-text-muted">{worn ? `Lleva: ${worn.emoji} ${worn.name}` : 'Toca un accesorio para ponérselo'}</span>
            </Card>
            {error2 && <Notice tone="error">{error2}</Notice>}
            <ul className="acc-grid">
              {data.accessories.map((a) => {
                const on = a.key === equipped
                return (
                  <li key={a.key}>
                    <button
                      type="button"
                      className={`acc${on ? ' acc--on' : ''}${a.unlocked ? '' : ' acc--locked'}`}
                      disabled={!a.unlocked}
                      aria-pressed={a.unlocked ? on : undefined}
                      onClick={() => void choose(a)}
                    >
                      <span className="acc__circle" aria-hidden="true">
                        {a.emoji}
                        {on && <span className="acc__check">✓</span>}
                        {!a.unlocked && <span className="acc__lock">🔒</span>}
                      </span>
                      <span className="acc__name">{a.name}</span>
                      {!a.unlocked && <span className="acc__req">Se gana con: {a.requirement}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}
    </Screen>
  )
}
