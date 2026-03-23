declare module 'docx-merger' {
  export default class DocxMerger {
    constructor(options: { pageBreak?: boolean; style?: string }, files: string[])
    save(type: 'blob', callback: (data: Blob) => void): void
    save(type: string, callback: (data: Blob) => void): void
  }
}
