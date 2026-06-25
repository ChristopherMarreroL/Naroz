import { normalizeLogoSizePercent, normalizeQrSize } from '../utils/qrUtils'

interface QrOptionsPanelProps {
  content: string
  foregroundColor: string
  backgroundColor: string
  size: number
  logoName: string | null
  logoPreviewUrl: string | null
  logoSizePercent: number
  logoBackgroundEnabled: boolean
  disabled?: boolean
  onContentChange: (value: string) => void
  onForegroundColorChange: (value: string) => void
  onBackgroundColorChange: (value: string) => void
  onSizeChange: (value: number) => void
  onLogoSelect: (file: File | null) => void
  onLogoSizePercentChange: (value: number) => void
  onLogoBackgroundEnabledChange: (value: boolean) => void
  onRemoveLogo: () => void
}

export function QrOptionsPanel({
  content,
  foregroundColor,
  backgroundColor,
  size,
  logoName,
  logoPreviewUrl,
  logoSizePercent,
  logoBackgroundEnabled,
  disabled = false,
  onContentChange,
  onForegroundColorChange,
  onBackgroundColorChange,
  onSizeChange,
  onLogoSelect,
  onLogoSizePercentChange,
  onLogoBackgroundEnabledChange,
  onRemoveLogo,
}: QrOptionsPanelProps) {
  return (
    <div className="grid gap-5">
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-slate-900">Enlace o texto</span>
        <textarea
          className="min-h-36 resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          placeholder="https://ejemplo.com"
          value={content}
          disabled={disabled}
          onChange={(event) => onContentChange(event.target.value)}
        />
      </label>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="panel-subtle grid gap-3 p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Color del QR</span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={foregroundColor}
              disabled={disabled}
              className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 disabled:cursor-not-allowed"
              onChange={(event) => onForegroundColorChange(event.target.value)}
            />
            <span className="font-mono text-sm font-semibold text-slate-900">{foregroundColor}</span>
          </div>
        </label>

        <label className="panel-subtle grid gap-3 p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Color de fondo</span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={backgroundColor}
              disabled={disabled}
              className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 disabled:cursor-not-allowed"
              onChange={(event) => onBackgroundColorChange(event.target.value)}
            />
            <span className="font-mono text-sm font-semibold text-slate-900">{backgroundColor}</span>
          </div>
        </label>

        <label className="panel-subtle grid gap-3 p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Tamano</span>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="128"
              max="1024"
              step="16"
              value={size}
              disabled={disabled}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              onChange={(event) => onSizeChange(normalizeQrSize(Number(event.target.value)))}
            />
            <span className="text-sm font-semibold text-slate-500">px</span>
          </div>
        </label>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-semibold text-slate-900">Ajuste rapido de tamano</span>
        <input
          type="range"
          min="128"
          max="1024"
          step="16"
          value={size}
          disabled={disabled}
          className="w-full cursor-pointer accent-slate-950 disabled:cursor-not-allowed"
          onChange={(event) => onSizeChange(normalizeQrSize(Number(event.target.value)))}
        />
      </label>

      <div className="panel-subtle grid gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Logo opcional</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">PNG, JPG, JPEG, WebP o SVG. Maximo 2 MB.</p>
          </div>
          {logoPreviewUrl ? (
            <button type="button" className="btn-secondary px-4 py-2 text-sm" disabled={disabled} onClick={onRemoveLogo}>
              Quitar logo
            </button>
          ) : null}
        </div>

        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center transition hover:border-slate-400 hover:bg-slate-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          onDragOver={(event) => {
            if (disabled) {
              return
            }

            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(event) => {
            if (disabled) {
              return
            }

            event.preventDefault()
            onLogoSelect(event.dataTransfer.files?.[0] ?? null)
          }}
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
            disabled={disabled}
            className="sr-only"
            onChange={(event) => {
              onLogoSelect(event.target.files?.[0] ?? null)
              event.currentTarget.value = ''
            }}
          />
          {logoPreviewUrl ? (
            <img src={logoPreviewUrl} alt="Logo seleccionado" className="h-16 w-16 rounded-2xl object-contain ring-1 ring-slate-200" />
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 fill-none stroke-current" strokeWidth="1.8">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          )}
          <span className="text-sm font-semibold text-slate-900">{logoName ?? 'Subir logo o arrastrarlo aqui'}</span>
        </label>

        {logoPreviewUrl ? (
          <>
            <label className="grid gap-2">
              <span className="flex items-center justify-between text-sm font-semibold text-slate-900">
                <span>Tamano del logo</span>
                <span>{logoSizePercent}%</span>
              </span>
              <input
                type="range"
                min="10"
                max="25"
                step="1"
                value={logoSizePercent}
                disabled={disabled}
                className="w-full cursor-pointer accent-slate-950 disabled:cursor-not-allowed"
                onChange={(event) => onLogoSizePercentChange(normalizeLogoSizePercent(Number(event.target.value)))}
              />
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
              <input
                type="checkbox"
                checked={logoBackgroundEnabled}
                disabled={disabled}
                className="h-4 w-4 accent-slate-950 disabled:cursor-not-allowed"
                onChange={(event) => onLogoBackgroundEnabledChange(event.target.checked)}
              />
              Fondo detras del logo
            </label>
          </>
        ) : null}

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          Para mejores resultados, usa un logo simple y no demasiado grande. Un logo muy grande puede dificultar el escaneo del QR.
        </div>
      </div>
    </div>
  )
}


