import { WorkerMailer } from 'worker-mailer'
import type { Env } from './env'

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

/** Correos "enviados" en modo log (desarrollo y pruebas). */
export const devOutbox: Mail[] = []

export async function sendMail(env: Env, mail: Mail) {
  if (env.EMAIL_MODE === 'log') {
    devOutbox.push(mail)
    console.log(`[correo a ${mail.to}] ${mail.subject}\n${mail.text}`)
    return
  }
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) throw new Error('Faltan los secretos GMAIL_USER / GMAIL_APP_PASSWORD')

  await WorkerMailer.send(
    {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      credentials: { username: env.GMAIL_USER, password: env.GMAIL_APP_PASSWORD },
      authType: 'plain',
    },
    { from: { name: 'Avocado', email: env.GMAIL_USER }, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html },
  )
}

export function loginCodeMail(to: string, code: string, appUrl: string): Mail {
  return {
    to,
    subject: `${code} es tu código de Avocado`,
    text: `Tu código para entrar a Avocado es: ${code}\n\nVence en 10 minutos. Si no lo pediste, ignora este correo.\n\n${appUrl}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1c1f1d">
  <h2 style="margin:0 0 8px">🥑 Avocado</h2>
  <p>Tu código para entrar es:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
  <p style="color:#6b726d">Vence en 10 minutos. Si no lo pediste, ignora este correo.</p>
</div>`,
  }
}
