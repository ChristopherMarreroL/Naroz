declare module 'jszip' {
  interface JSZipObject {
    async(type: 'text'): Promise<string>
    async(type: 'uint8array'): Promise<Uint8Array>
  }

  export default class JSZip {
    files: Record<string, JSZipObject>
    file(name: string): JSZipObject | null
    file(name: string, data: Blob | ArrayBuffer | Uint8Array | string): this
    loadAsync(data: Blob | ArrayBuffer | Uint8Array): Promise<JSZip>
    generate(options: { type: 'blob' }): Blob
    generateAsync?(options: { type: 'blob' }): Promise<Blob>
  }
}