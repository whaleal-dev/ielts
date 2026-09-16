/**
 * 单词音频引擎（模块级单例）——对应 legacy playAudio(3918)、stopActiveAudio(3952)
 * 与 playbackToken 竞态防护。仅播放 mp3，不使用 TTS。
 */
let activeAudio: HTMLAudioElement | null = null
let activeAudioResolver: (() => void) | null = null
let playbackToken = 0

export function getPlaybackToken(): number {
  return playbackToken
}

/** 使所有在途播放失效并返回新 token */
export function invalidatePlayback(): number {
  playbackToken += 1
  stopActiveAudio()
  return playbackToken
}

/** 停止当前音频并让挂起的 playAudio 立即按“已停止”结束 */
export function stopActiveAudio(): void {
  if (activeAudio) {
    try {
      activeAudio.pause()
      activeAudio.currentTime = 0
    } catch {
      /* ignore */
    }
  }
  const resolver = activeAudioResolver
  activeAudio = null
  activeAudioResolver = null
  resolver?.()
}

export function playAudio(url: string, rate: number, token: number): Promise<void> {
  return new Promise((resolve, reject) => {
    stopActiveAudio()
    let settled = false
    const audio = new Audio(url)
    audio.preload = 'auto'
    try {
      audio.playbackRate = rate
    } catch {
      /* ignore */
    }
    const cleanup = () => {
      audio.onended = null
      audio.onerror = null
      if (activeAudio === audio) {
        activeAudio = null
        activeAudioResolver = null
      }
    }
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      cleanup()
      if (ok) resolve()
      else reject(new Error('audio_playback_failed'))
    }
    audio.onended = () => done(true)
    audio.onerror = () => done(false)
    activeAudio = audio
    activeAudioResolver = () => done(true)
    audio.play().catch((error: unknown) => {
      // 因被停止而导致的 play() 拒绝按“已停止/正常结束”处理
      if (token !== playbackToken) done(true)
      else done(false)
      void error
    })
  })
}
