import { useState } from 'react'
import { CodeInput } from '@avocado/ui'

export const Empty = () => {
  const [code, setCode] = useState('')
  return (
    <div style={{ width: 340 }}>
      <CodeInput value={code} onChange={setCode} />
    </div>
  )
}

export const Partial = () => {
  const [code, setCode] = useState('482')
  return (
    <div style={{ width: 340 }}>
      <CodeInput value={code} onChange={setCode} />
    </div>
  )
}

export const Complete = () => (
  <div style={{ width: 340 }}>
    <CodeInput value="482915" onChange={() => {}} disabled />
  </div>
)
