import { FileCompatibilityError } from './core'

/** Bounded CFB directory inspection. Never follow arbitrary directory pointers recursively. */
export function compoundStreamNames(buffer: ArrayBuffer): string[] {
  const invalid = () => { throw new FileCompatibilityError('FILE_CORRUPT') }
  const view = new DataView(buffer)
  if (buffer.byteLength < 512) return invalid()
  const major = view.getUint16(26, true)
  const shift = view.getUint16(30, true)
  if (view.getUint16(28, true) !== 0xfffe || !((major === 3 && shift === 9) || (major === 4 && shift === 12))) return invalid()
  const sectorSize = 2 ** shift
  const sectorCount = Math.floor(buffer.byteLength / sectorSize) - 1
  const sectorOffset = (sector: number) => {
    if (sector >= sectorCount) return invalid()
    return (sector + 1) * sectorSize
  }
  const fatCount = view.getUint32(44, true)
  const difatCount = view.getUint32(72, true)
  if (fatCount > 4096 || difatCount > 4096 || fatCount > sectorCount || difatCount > sectorCount) return invalid()
  const fatSectors: number[] = []
  const addFat = (sector: number) => { if (sector !== 0xffffffff) { sectorOffset(sector); fatSectors.push(sector) } }
  for (let offset = 76; offset < 512; offset += 4) addFat(view.getUint32(offset, true))
  let difat = view.getUint32(68, true)
  const visitedDifat = new Set<number>()
  for (let index = 0; index < difatCount; index++) {
    if (visitedDifat.has(difat)) return invalid()
    visitedDifat.add(difat)
    const offset = sectorOffset(difat)
    for (let pos = 0; pos < sectorSize - 4; pos += 4) addFat(view.getUint32(offset + pos, true))
    difat = view.getUint32(offset + sectorSize - 4, true)
  }
  if (fatSectors.length !== fatCount || new Set(fatSectors).size !== fatCount) return invalid()
  const nextSector = (sector: number) => {
    const fatSector = fatSectors[Math.floor(sector * 4 / sectorSize)]
    if (fatSector === undefined) return invalid()
    return view.getUint32(sectorOffset(fatSector) + (sector * 4 % sectorSize), true)
  }
  const entries: { name: string; type: number; links: number[] }[] = []
  const visitedDirectory = new Set<number>()
  let directory = view.getUint32(48, true)
  while (directory !== 0xfffffffe) {
    if (visitedDirectory.has(directory) || entries.length >= 2048) return invalid()
    visitedDirectory.add(directory)
    const offset = sectorOffset(directory)
    for (let pos = 0; pos < sectorSize; pos += 128) {
      const start = offset + pos
      const type = view.getUint8(start + 66)
      const nameLength = view.getUint16(start + 64, true)
      if (type !== 0 && (![1, 2, 5].includes(type) || nameLength < 2 || nameLength > 64 || nameLength % 2 || view.getUint16(start + nameLength - 2, true) !== 0)) return invalid()
      const name = type === 0 ? '' : new TextDecoder('utf-16le').decode(new Uint8Array(buffer, start, nameLength - 2))
      entries.push({ name, type, links: type === 0 ? [] : [68, 72, 76].map((delta) => view.getUint32(start + delta, true)).filter((link) => link !== 0xffffffff) })
    }
    directory = nextSector(directory)
  }
  if (entries[0]?.type !== 5) return invalid()
  // A node with multiple parents or a cycle is never a valid CFB directory tree.
  const visited = new Set<number>()
  const pending = [0]
  while (pending.length) {
    const id = pending.pop()!
    if (visited.has(id) || !entries[id] || entries[id].type === 0) return invalid()
    visited.add(id)
    pending.push(...entries[id].links)
  }
  if (entries.some((entry, id) => entry.type !== 0 && !visited.has(id))) return invalid()
  return entries.filter((entry) => entry.type === 2).map((entry) => entry.name)
}
