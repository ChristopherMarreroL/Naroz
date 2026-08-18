import type JSZip from 'jszip'

export const ZIP_GENERATION_CANCELLED = 'ZIP_GENERATION_CANCELLED'

type ZipArchive = InstanceType<typeof JSZip>

interface ZipGenerationStream {
  on(event: 'data', handler: (chunk: Uint8Array) => void): ZipGenerationStream
  on(event: 'error', handler: (error: Error) => void): ZipGenerationStream
  on(event: 'end', handler: () => void): ZipGenerationStream
  pause(): ZipGenerationStream
  resume(): ZipGenerationStream
}

interface ZipGenerationApi {
  generateInternalStream?: (options: { type: 'uint8array' }) => ZipGenerationStream
  generateAsync?: (options: { type: 'blob' }, onUpdate?: () => void) => Promise<Blob>
  generate?: (options: { type: 'blob' }) => Blob
}

function throwIfZipGenerationAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error(ZIP_GENERATION_CANCELLED)
}

export async function generateCancellableZipBlob(zip: ZipArchive, signal?: AbortSignal): Promise<Blob> {
  throwIfZipGenerationAborted(signal)
  const generator = zip as unknown as ZipGenerationApi

  if (typeof generator.generateInternalStream === 'function') {
    return new Promise<Blob>((resolve, reject) => {
      const stream = generator.generateInternalStream?.({ type: 'uint8array' })
      if (!stream) {
        reject(new Error('ZIP_GENERATOR_UNAVAILABLE'))
        return
      }
      const chunks: ArrayBuffer[] = []
      let settled = false
      const cleanup = () => signal?.removeEventListener('abort', cancel)
      const cancel = () => {
        if (settled) return
        settled = true
        stream.pause()
        cleanup()
        reject(new Error(ZIP_GENERATION_CANCELLED))
      }
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }

      signal?.addEventListener('abort', cancel, { once: true })
      stream
        .on('data', (chunk) => {
          if (settled) return
          if (signal?.aborted) {
            cancel()
            return
          }
          const copy = new Uint8Array(chunk.byteLength)
          copy.set(chunk)
          chunks.push(copy.buffer)
        })
        .on('error', (error) => {
          fail(error)
        })
        .on('end', () => {
          if (settled) return
          try {
            throwIfZipGenerationAborted(signal)
            settled = true
            cleanup()
            resolve(new Blob(chunks, { type: 'application/zip' }))
          } catch (error) {
            fail(error)
          }
        })

      if (!settled) stream.resume()
    })
  }

  if (typeof generator.generateAsync === 'function') {
    const blob = await generator.generateAsync({ type: 'blob' }, () => {
      throwIfZipGenerationAborted(signal)
    })
    throwIfZipGenerationAborted(signal)
    return blob
  }

  const legacyGenerate = generator.generate
  if (typeof legacyGenerate !== 'function') throw new Error('ZIP_GENERATOR_UNAVAILABLE')
  const blob = legacyGenerate.call(zip, { type: 'blob' })
  throwIfZipGenerationAborted(signal)
  return blob
}
