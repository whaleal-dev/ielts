export interface ObserveSpeechVoicesOptions {
  filter?: (voice: SpeechSynthesisVoice) => boolean
  maxAttempts?: number
  retryDelayMs?: number
}

export function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis ?? null
}

export function cancelSpeech(): void {
  getSpeechSynthesis()?.cancel()
}

export function isEnglishVoice(voice: Pick<SpeechSynthesisVoice, 'lang'>): boolean {
  return voice.lang.toLowerCase().startsWith('en')
}

export function formatEnglishVoiceLabel(voice: Pick<SpeechSynthesisVoice, 'lang' | 'name'>): string {
  const mark = voice.lang.toLowerCase() === 'en-gb' ? '🇬🇧 ' : isEnglishVoice(voice) ? '🇺🇸 ' : ''
  return `${mark}${voice.name} (${voice.lang})`
}

export function observeSpeechVoices(
  onChange: (voices: SpeechSynthesisVoice[]) => void,
  options: ObserveSpeechVoicesOptions = {},
): () => void {
  const synthesis = getSpeechSynthesis()
  if (!synthesis) {
    onChange([])
    return () => undefined
  }

  const filter = options.filter ?? (() => true)
  const maxAttempts = options.maxAttempts ?? 12
  const retryDelayMs = options.retryDelayMs ?? 150
  let attempts = 0
  let stopped = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const clearRetry = () => {
    if (!retryTimer) return
    clearTimeout(retryTimer)
    retryTimer = null
  }

  const read = () => synthesis.getVoices().filter(filter)
  const update = () => {
    if (stopped) return
    clearRetry()
    const voices = read()
    if (voices.length || attempts >= maxAttempts) {
      onChange(voices)
      return
    }
    attempts += 1
    retryTimer = setTimeout(update, retryDelayMs)
  }
  const handleVoicesChanged = () => {
    attempts = 0
    update()
  }

  synthesis.addEventListener('voiceschanged', handleVoicesChanged)
  update()

  return () => {
    stopped = true
    clearRetry()
    synthesis.removeEventListener('voiceschanged', handleVoicesChanged)
  }
}
