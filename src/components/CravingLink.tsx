import { Link } from 'react-router-dom'
import { Icon } from '@avocado/ui'
import { Mascot } from './Mascot'

/** Invitación a "¿Me lo como?" (en Mi día y al registrar una comida). */
export default function CravingLink({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/antojo" className={`craving-link${compact ? ' craving-link--compact' : ''}`}>
      <Mascot size={compact ? 44 : 56} play="eat" pose={0} />
      <span className="craving-link__text">
        <strong>¿Tienes un antojo?</strong>
        <span>{compact ? 'Pregúntale a Avo sin registrarlo.' : 'Tómale foto y Avo te dice si te conviene y cuánto.'}</span>
      </span>
      <Icon name="chevron-right" className="craving-link__chevron" />
    </Link>
  )
}
