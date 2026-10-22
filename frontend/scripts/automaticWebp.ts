import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { Plugin, ResolvedConfig } from 'vite'

const supported = /\.(png|jpe?g)$/i

async function imageFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const results = await Promise.all(entries.map((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? imageFiles(file) : Promise.resolve(supported.test(file) ? [file] : [])
  }))
  return results.flat()
}

export async function convertImage(input: Buffer): Promise<Buffer> {
  // Keep alpha for pop-out artwork, correct camera orientation, and retain animation frames.
  return sharp(input, { animated: true }).rotate().webp({ quality: 82, effort: 6 }).toBuffer()
}

export function replaceImageUrls(code: string, urls: Map<string, string>): string {
  // Match complete local string literals and unquoted CSS url() paths.
  // Query strings/fragments remain attached. External image URLs are not rewritten.
  const replace = (whole: string, start: string, value: string, end: string) => {
    const match = /^(\/[^?#]*)([?#].*)?$/.exec(value)
    if (!match) return whole
    const replacement = urls.get(match[1])
    return replacement ? `${start}${replacement}${match[2] || ''}${end}` : whole
  }
  return code.replace(/(["'`])([^"'`\r\n]*?)\1/g, (whole, quote, value) => replace(whole, quote, value, quote))
    .replace(/(url\()(\/[^()"'\r\n]+)(\))/g, replace)
}

/** Convert public PNG/JPEGs without changing originals or editing application source. */
export function automaticWebp(): Plugin {
  let config: ResolvedConfig
  const urls = new Map<string, string>()
  const assets = new Map<string, Buffer>()
  let queue = Promise.resolve()

  async function refresh() {
    const nextUrls = new Map<string, string>()
    const nextAssets = new Map<string, Buffer>()
    const cache = path.join(config.cacheDir, 'automatic-webp')
    await mkdir(cache, { recursive: true })
    for (const file of await imageFiles(config.publicDir)) {
      const relative = path.relative(config.publicDir, file).split(path.sep).join('/')
      const source = await readFile(file)
      const hash = createHash('sha256').update('webp-quality82-effort6-v1').update(source).digest('hex')
      const cached = path.join(cache, `${hash}.webp`)
      let converted: Buffer
      try { converted = await readFile(cached) } catch {
        converted = await convertImage(source)
        await writeFile(cached, converted)
      }
      const target = `/_webp/${hash}.webp`
      nextUrls.set(`/${relative}`, target)
      nextUrls.set(`/${relative.split('/').map(encodeURIComponent).join('/')}`, target)
      nextAssets.set(target, converted)
    }
    urls.clear()
    assets.clear()
    nextUrls.forEach((value, key) => urls.set(key, value))
    nextAssets.forEach((value, key) => assets.set(key, value))
  }

  return {
    name: 'automatic-public-webp',
    enforce: 'pre',
    configResolved(resolved) { config = resolved },
    async buildStart() { if (config.publicDir) await refresh() },
    transform(code, id) {
      if (id.includes('node_modules') || !/\.(?:[cm]?[jt]sx?|css)(?:\?|$)/.test(id)) return
      const transformed = replaceImageUrls(code, urls)
      if (transformed !== code) return { code: transformed, map: null }
    },
    transformIndexHtml(html) { return replaceImageUrls(html, urls) },
    generateBundle() {
      assets.forEach((source, url) => this.emitFile({ type: 'asset', fileName: url.slice(1), source }))
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const asset = assets.get(url)
        if (!asset) return next()
        res.setHeader('Content-Type', 'image/webp')
        res.end(asset)
      })
      // Vite's watcher picks up new files as well as replacements while npm run dev is running.
      server.watcher.add(config.publicDir)
      const onImage = (file: string) => {
        const relative = path.relative(config.publicDir, file)
        if (relative.startsWith('..') || path.isAbsolute(relative) || !supported.test(file)) return
        queue = queue.then(async () => {
          await refresh()
          server.moduleGraph.invalidateAll()
          server.ws.send({ type: 'full-reload' })
        }).catch((error) => {
          config.logger.error(`WebP conversion failed: ${String(error)}`)
        })
      }
      server.watcher.on('add', onImage).on('change', onImage).on('unlink', onImage)
      server.httpServer?.once('close', () => {
        server.watcher.off('add', onImage).off('change', onImage).off('unlink', onImage)
      })
    },
  }
}
