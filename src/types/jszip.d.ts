declare module 'jszip' {
  export default class JSZip {
    file(name: string, data: Blob | ArrayBuffer | Uint8Array | string): this
    generateAsync(options: { type: 'blob' }): Promise<Blob>
  }
}
