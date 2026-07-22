import axios from 'axios'
import dayjs from 'dayjs'
import { promises as fs } from 'fs'
import path from 'path'
import sharp from 'sharp'
import { withRetry } from './retry'
import type { ImageSource } from '../providers/types'

export interface SavedImageResult {
  url: string
  filename: string
  saved_path: string
}

export interface ImageGenMetadata {
  prompt: string
  steps: number
  sampler: string
  cfg_scale: number
  seed: number
  size: string
  model: string
  model_hash: string
  version: string
  custom_metadata: Record<string, any>
}

export interface SaveImagesMeta {
  prompt: string
  model: string
  size: string
  resolution: string
}

// Resolve an accessible URL (/images/<category>/<filename>) from an absolute save path
export function imageUrlFromPath(saveDirRoot: string, filepath: string): string {
  const rel = path.relative(saveDirRoot, filepath).replace(/\\/g, '/')
  return `/images/${rel}`
}

// Build an EXIF APP1 segment carrying metadata text in UserComment
// (big-endian TIFF, IFD0 -> ExifIFD -> UserComment, raw UTF-8)
export function buildExifApp1(text: string): Buffer {
  const textBytes = Buffer.from(text, 'utf8')
  const textLen = textBytes.length

  // TIFF layout (big endian):
  //   [0-7]    TIFF header (8 bytes)
  //   [8-23]   IFD0: count(2) + ExifIFD pointer entry(12) + next IFD(4) = 18 bytes
  //   [24-41]  ExifIFD: count(2) + UserComment entry(12) + next IFD(4) = 18 bytes
  //   [42..]   UserComment raw data (textLen bytes)
  const exifIfdOffset = 8 + 18 // 26
  const dataOffset = exifIfdOffset + 18 // 44

  const tiffLen = dataOffset + textLen
  const tiff = Buffer.alloc(tiffLen)

  // TIFF header - big endian (MM)
  tiff[0] = 0x4d; tiff[1] = 0x4d
  tiff.writeUInt16BE(42, 2) // magic number
  tiff.writeUInt32BE(8, 4) // IFD0 offset

  // IFD0 (1 entry: ExifIFD pointer)
  let pos = 8
  tiff.writeUInt16BE(1, pos); pos += 2
  tiff.writeUInt16BE(0x8769, pos); pos += 2 // Tag: ExifIFD pointer
  tiff.writeUInt16BE(4, pos); pos += 2 // Type: LONG
  tiff.writeUInt32BE(1, pos); pos += 4 // Count
  tiff.writeUInt32BE(exifIfdOffset, pos); pos += 4
  tiff.writeUInt32BE(0, pos); pos += 4 // Next IFD offset = 0

  // ExifIFD (1 entry: UserComment)
  pos = exifIfdOffset
  tiff.writeUInt16BE(1, pos); pos += 2
  tiff.writeUInt16BE(0x9286, pos); pos += 2 // Tag: UserComment
  tiff.writeUInt16BE(7, pos); pos += 2 // Type: UNDEFINED
  tiff.writeUInt32BE(textLen, pos); pos += 4
  tiff.writeUInt32BE(dataOffset, pos); pos += 4
  tiff.writeUInt32BE(0, pos); pos += 4

  // UserComment raw UTF-8 data (no charset prefix)
  textBytes.copy(tiff, dataOffset)

  // APP1 segment: FFE1(2) + length(2) + "Exif\0\0"(6) + TIFF data
  const segLen = 2 + 6 + tiffLen
  const app1 = Buffer.alloc(2 + 2 + 6 + tiffLen)
  app1[0] = 0xff; app1[1] = 0xe1
  app1.writeUInt16BE(segLen, 2)
  app1.write('Exif\0\0', 4, 'ascii')
  tiff.copy(app1, 10)

  return app1
}

// Download/decode each source image, re-encode to JPEG, embed EXIF metadata and
// persist under generated-images/[category]/. Shared by all provider adapters.
export async function saveGeneratedImages(
  saveDirRoot: string,
  sources: ImageSource[],
  meta: SaveImagesMeta,
  imageCategory: string,
  taskId: string,
): Promise<{ results: SavedImageResult[]; metadata: ImageGenMetadata }> {
  const { prompt, model, size, resolution } = meta

  // SD WebUI compatible metadata text
  const metadataParts = [prompt]
  const metadataParams = [
    `Steps: 0`,
    `Sampler: api`,
    `CFG scale: 0`,
    `Seed: 0`,
    `Size: ${size}_${resolution}`,
    `Model: ${model}`,
    `Version: v1.0`,
  ]
  metadataParts.push(metadataParams.join(', '))
  metadataParts.push(`extraJsonMetaInfo: ${JSON.stringify({ source: 'api', task_id: taskId })}`)
  const metadataText = metadataParts.join('\n')

  let saveDir = saveDirRoot
  if (imageCategory) {
    saveDir = path.join(saveDirRoot, imageCategory)
    await fs.mkdir(saveDir, { recursive: true })
  }

  const metadata: ImageGenMetadata = {
    prompt,
    steps: 0,
    sampler: 'api',
    cfg_scale: 0,
    seed: 0,
    size: `${size}_${resolution}`,
    model,
    model_hash: '',
    version: 'v1.0',
    custom_metadata: { source: 'api', task_id: taskId },
  }

  const results: SavedImageResult[] = []
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]
    let imageBuffer: Buffer
    if (src.base64) {
      // Accept both raw base64 and data URLs
      const raw = src.base64.startsWith('data:') ? src.base64.split(',').pop()! : src.base64
      imageBuffer = Buffer.from(raw, 'base64')
    } else if (src.url) {
      const imgResp = await withRetry(
        () => axios.get(src.url!, { responseType: 'arraybuffer', timeout: 60000 }),
        `image download [${taskId}]`,
      )
      imageBuffer = Buffer.from(imgResp.data)
    } else {
      continue
    }

    const timestamp = dayjs().format('YYYYMMDD_HHmmss')
    const filename = `gen_${timestamp}_${taskId.slice(-6)}_${i}.jpg`
    const filepath = path.join(saveDir, filename)

    // Re-encode as JPEG (drops any original EXIF) then embed our metadata
    const jpegBuffer = await sharp(imageBuffer).jpeg({ quality: 95 }).toBuffer()
    const exifApp1 = buildExifApp1(metadataText)
    const finalBuffer = Buffer.concat([jpegBuffer.slice(0, 2), exifApp1, jpegBuffer.slice(2)])

    await fs.writeFile(filepath, finalBuffer)
    console.log(`image saved [${i + 1}/${sources.length}]: ${imageCategory ? `[${imageCategory}] ` : ''}${filename}`)

    results.push({
      url: imageUrlFromPath(saveDirRoot, filepath),
      filename,
      saved_path: filepath,
    })
  }
  return { results, metadata }
}
