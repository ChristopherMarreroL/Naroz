declare module 'jszip' {
  export default class JSZip {
    file(name: string, data: Blob | ArrayBuffer | Uint8Array | string): this
    generate(options: { type: 'blob' }): Blob
    generateAsync?(options: { type: 'blob' }): Promise<Blob>
  }
}
