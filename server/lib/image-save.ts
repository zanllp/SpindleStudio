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
  provider: string
  model: string
  model_hash: string
  version: string
  size: string // actual pixel dimensions, e.g. "1024x1536"
  aspect_ratio: string
  resolution: string
  width: number
  height: number
  created_at: number
  sampler: string
  steps: number
  cfg_scale: number
  seed: number
  custom_metadata: Record<string, any>
}

export interface SaveImagesMeta {
  prompt: string
  model: string
  providerId: string
  size: string // aspect ratio ('auto', '1:1', ...)
  resolution: string // '1k' | '2k' | '4k'
  createdAt: number
  referenceImagePaths?: string[]
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
  const { prompt, model, providerId, size, resolution, createdAt, referenceImagePaths } = meta

  let saveDir = saveDirRoot
  if (imageCategory) {
    saveDir = path.join(saveDirRoot, imageCategory)
    await fs.mkdir(saveDir, { recursive: true })
  }

  const results: SavedImageResult[] = []
  let metadata: ImageGenMetadata | undefined

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

    // Re-encode as JPEG (drops any original EXIF)
    const jpegBuffer = await sharp(imageBuffer).jpeg({ quality: 95 }).toBuffer()

    // Read actual pixel dimensions from the re-encoded JPEG
    const { width = 0, height = 0 } = await sharp(jpegBuffer).metadata()
    const pixelSize = width && height ? `${width}x${height}` : `${size}_${resolution}`
    const isImg2Img = !!referenceImagePaths && referenceImagePaths.length > 0

    // Build extra JSON metadata for fields that don't fit the simple key:value format
    // or are meant to be machine-readable (arrays, long numeric IDs, timestamps).
    const extraJsonMetaInfo: Record<string, any> = {
      task_id: taskId,
      created_at: createdAt,
      reference_images: referenceImagePaths || [],
    }

    // SD WebUI compatible metadata text.
    // Keep the last parameter line with >=3 key:value pairs so IIB parses it correctly.
    const metadataParams = [
      `Steps: 0`,
      `Sampler: api`,
      `Model: ${model}`,
      `Size: ${pixelSize}`,
      `Provider: ${providerId}`,
      `Quality: ${resolution}`,
      ...(isImg2Img ? [`Img2img: true`] : []),
      `Version: v1.0`,
      `Source Identifier: ChatImgHub`,
    ]
    const metadataText = [
      prompt,
      metadataParams.join(', '),
      `extraJsonMetaInfo: ${JSON.stringify(extraJsonMetaInfo)}`,
    ].join('\n')

    // Embed EXIF metadata
    const exifApp1 = buildExifApp1(metadataText)
    const finalBuffer = Buffer.concat([jpegBuffer.slice(0, 2), exifApp1, jpegBuffer.slice(2)])

    await fs.writeFile(filepath, finalBuffer)
    console.log(`image saved [${i + 1}/${sources.length}]: ${imageCategory ? `[${imageCategory}] ` : ''}${filename}`)

    results.push({
      url: imageUrlFromPath(saveDirRoot, filepath),
      filename,
      saved_path: filepath,
    })

    // Metadata is the same for all images in one task; compute once from the first image
    if (!metadata) {
      metadata = {
        prompt,
        provider: providerId,
        model,
        model_hash: '',
        version: 'v1.0',
        size: pixelSize,
        aspect_ratio: size,
        resolution,
        width,
        height,
        created_at: createdAt,
        sampler: 'gpt-image-2',
        steps: 0,
        cfg_scale: 0,
        seed: 0,
        custom_metadata: extraJsonMetaInfo,
      }
    }
  }

  if (!metadata) {
    throw new Error('No images were saved')
  }

  return { results, metadata }
}
