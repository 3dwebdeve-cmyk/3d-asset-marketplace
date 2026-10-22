// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'
import sharp from 'sharp'
import { automaticWebp, convertImage, replaceImageUrls } from './automaticWebp'

describe('automatic WebP assets', () => {
  it('serves converted files and automatically notices newly added and replaced images', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'webp-test-'))
    const publicDir = path.join(root, 'public')
    await mkdir(publicDir)
    const server = await createServer({ root, configFile: false, plugins: [automaticWebp()], server: { port: 0, host: '127.0.0.1' } })
    try {
      await server.listen()
      const base = server.resolvedUrls!.local[0]
      const makePng = (width: number) => sharp({ create: { width, height: 8, channels: 4, background: '#ff000080' } }).png().toBuffer()
      await writeFile(path.join(root, 'entry.js'), 'export default "/new.png"')
      await writeFile(path.join(publicDir, 'new.png'), await makePng(12))
      let url = ''
      await vi.waitFor(async () => {
        const result = await server.transformRequest('/entry.js')
        url = result!.code.match(/\/_webp\/[a-f0-9]+\.webp/)?.[0] || ''
        expect(url).toMatch(/\.webp$/)
      }, { timeout: 10000 })
      const response = await fetch(new URL(url, base))
      expect(response.headers.get('content-type')).toBe('image/webp')
      expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width).toBe(12)
      const oldUrl = url
      await writeFile(path.join(publicDir, 'new.png'), await makePng(16))
      await vi.waitFor(async () => {
        const result = await server.transformRequest('/entry.js')
        url = result!.code.match(/\/_webp\/[a-f0-9]+\.webp/)?.[0] || ''
        expect(url).not.toBe(oldUrl)
        expect(url).toMatch(/\.webp$/)
      }, { timeout: 10000 })
    } finally {
      await server.close()
      await rm(root, { recursive: true, force: true })
    }
  })
  it('converts PNG and JPEG bytes to WebP and preserves transparent artwork dimensions', async () => {
    const png = await sharp({ create: { width: 12, height: 8, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0 } } }).png().toBuffer()
    const result = await sharp(await convertImage(png)).metadata()
    expect(result).toMatchObject({ format: 'webp', width: 12, height: 8, hasAlpha: true })
    const jpeg = await sharp(png).flatten({ background: '#fff' }).jpeg().toBuffer()
    expect((await sharp(await convertImage(jpeg)).metadata()).format).toBe('webp')
  })

  it('rewrites matching local URLs, including spaces, parentheses, queries and CSS', () => {
    const urls = new Map([
      ['/banner/Dragon (2).png', '/_webp/dragon.webp'],
      ['/banner/Dragon%20(2).png', '/_webp/dragon.webp'],
      ['/image.jpg', '/_webp/image.webp'],
    ])
    expect(replaceImageUrls('"/banner/Dragon (2).png?v=2"', urls)).toBe('"/_webp/dragon.webp?v=2"')
    expect(replaceImageUrls("'/banner/Dragon%20(2).png'", urls)).toBe("'/_webp/dragon.webp'")
    expect(replaceImageUrls('url(/image.jpg)', urls)).toBe('url(/_webp/image.webp)')
    expect(replaceImageUrls('"https://example.com/image.jpg"', urls)).toBe('"https://example.com/image.jpg"')
    expect(replaceImageUrls('"/missing.png"', urls)).toBe('"/missing.png"')
  })
})
