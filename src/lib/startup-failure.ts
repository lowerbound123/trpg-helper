import { translate } from '@/i18n'

export type StartupErrorDetails = {
  name: string
  message: string
  stack?: string
}

export function normalizeStartupError(error: unknown): StartupErrorDetails {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    }
  }
  return { name: 'Error', message: String(error) }
}

function renderStartupFailure(details: StartupErrorDetails) {
  const root = document.querySelector<HTMLElement>('#app')
  if (!root) return
  root.style.cssText = 'min-height:100vh;display:grid;place-items:center;padding:32px;background:#fff;color:#171717;font:14px/1.5 system-ui,sans-serif'
  const panel = document.createElement('section')
  panel.style.cssText = 'width:min(640px,100%);border:1px solid #d4d4d4;border-radius:8px;padding:20px'
  const heading = document.createElement('h1')
  heading.style.cssText = 'margin:0 0 8px;font-size:18px'
  heading.textContent = translate('APP_STARTUP_FAILED')
  const message = document.createElement('p')
  message.style.cssText = 'margin:0;color:#525252;white-space:pre-wrap;overflow-wrap:anywhere'
  message.textContent = details.message
  panel.append(heading, message)
  root.replaceChildren(panel)
}

export async function reportStartupFailure(error: unknown) {
  const details = normalizeStartupError(error)
  renderStartupFailure(details)
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    scope: 'app',
    message: 'startup-failed',
    data: details,
  })
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('append_debug_log', { scope: 'app', line })
  }
  catch {
    console.error(line)
  }
}
