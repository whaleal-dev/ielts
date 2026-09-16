import { describe, expect, it } from 'vitest'

import { formatEnglishVoiceLabel, isEnglishVoice } from '../voices'

describe('shared speech voice rules', () => {
  it('英文语音匹配不区分语言代码大小写', () => {
    expect(isEnglishVoice({ lang: 'en-GB' })).toBe(true)
    expect(isEnglishVoice({ lang: 'EN-us' })).toBe(true)
    expect(isEnglishVoice({ lang: 'zh-CN' })).toBe(false)
  })

  it('语音标签区分英音、其他英文和非英文', () => {
    expect(formatEnglishVoiceLabel({ name: 'Daniel', lang: 'en-GB' })).toBe('🇬🇧 Daniel (en-GB)')
    expect(formatEnglishVoiceLabel({ name: 'Samantha', lang: 'en-US' })).toBe('🇺🇸 Samantha (en-US)')
    expect(formatEnglishVoiceLabel({ name: 'Tingting', lang: 'zh-CN' })).toBe('Tingting (zh-CN)')
  })
})
