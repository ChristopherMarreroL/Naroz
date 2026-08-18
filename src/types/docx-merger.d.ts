declare module 'docx-merger' {
  export default class DocxMerger {
    constructor(options: { pageBreak?: boolean; style?: string }, files: Array<string | ArrayBuffer>)
    save(type: 'blob', callback: (data: Blob) => void): void
    save(type: 'arraybuffer', callback: (data: ArrayBuffer) => void): void
  }
}
