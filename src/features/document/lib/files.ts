export type DocumentExtension = 'pdf' | 'docx' | 'msg' | 'eml'

export interface DocumentItem {
  id: string
  file: File
  name: string
  size: number
  extension: DocumentExtension
}

export function createDocumentItem(file: File, extension: DocumentExtension): DocumentItem {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
    name: file.name,
    size: file.size,
    extension,
  }
}

export function isSupportedPdf(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  return file.type === 'application/pdf' || lowerName.endsWith('.pdf')
}

export function isSupportedDocx(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  return file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowerName.endsWith('.docx')
}

export function isSupportedMsg(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  return file.type === 'application/vnd.ms-outlook' || lowerName.endsWith('.msg')
}

export function isSupportedEml(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  return file.type === 'message/rfc822' || lowerName.endsWith('.eml')
}

export function isSupportedMailFile(file: File): boolean {
  return isSupportedMsg(file) || isSupportedEml(file)
}

export function moveDocument(items: DocumentItem[], from: number, to: number) {
  if (to < 0 || to >= items.length || from === to) {
    return items
  }

  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function getTotalSize(items: DocumentItem[]) {
  return items.reduce((total, item) => total + item.size, 0)
}
