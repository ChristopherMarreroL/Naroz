import { useRef } from 'react'

interface FilePickerProps {
  onSelect: (files: FileList) => void
  disabled?: boolean
}

export function FilePicker({ onSelect, disabled = false }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <section className="panel overflow-hidden p-6 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <span className="badge mb-4">Compatible con MP4 y MKV</span>
          <h2 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">Selecciona, ordena y une tus videos</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
            La herramienta procesa los archivos localmente con ffmpeg.wasm y elige automaticamente la estrategia mas estable para tu lista.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:min-w-72">
          <button type="button" className="btn-primary w-full" onClick={() => inputRef.current?.click()} disabled={disabled}>
            Seleccionar videos
          </button>
          <p className="text-xs leading-5 text-slate-500">Puedes elegir varios archivos a la vez desde tu computadora.</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,.mp4,video/x-matroska,.mkv"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) {
            onSelect(event.target.files)
            event.target.value = ''
          }
        }}
      />
    </section>
  )
}
