export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || Number.isNaN(seconds)) {
    return '--'
  }

  const totalSeconds = Math.round(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return [hours, minutes, remainingSeconds]
      .map((value) => value.toString().padStart(2, '0'))
      .join(':')
  }

  return [minutes, remainingSeconds].map((value) => value.toString().padStart(2, '0')).join(':')
}

export function formatResolution(width: number | null, height: number | null): string {
  if (!width || !height) {
    return '--'
  }

  return `${width}x${height}`
}
