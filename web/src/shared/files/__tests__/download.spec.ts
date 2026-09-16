import { afterEach, describe, expect, it, vi } from 'vitest'

import { downloadJson, downloadText } from '../download'

describe('shared file downloads', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('文本下载设置文件名、MIME，并释放临时 URL', async () => {
    const anchor = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) })
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    downloadText('mistakes.csv', 'word,chapter', 'text/csv;charset=utf-8')

    expect(anchor).toMatchObject({ href: 'blob:test', download: 'mistakes.csv' })
    expect(anchor.click).toHaveBeenCalledOnce()
    expect(revokeUrl).toHaveBeenCalledWith('blob:test')
    const blob = createUrl.mock.calls[0]?.[0] as Blob
    expect(blob?.type).toBe('text/csv;charset=utf-8')
    expect(await blob?.text()).toBe('word,chapter')
  })

  it('JSON 下载保持两空格缩进和 application/json 类型', async () => {
    const anchor = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) })
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:json')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    downloadJson('backup.json', { version: 2 })

    const blob = createUrl.mock.calls[0]?.[0] as Blob
    expect(blob?.type).toBe('application/json')
    expect(await blob?.text()).toBe('{\n  "version": 2\n}')
  })
})
