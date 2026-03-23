import { useLocale } from '../../../i18n/LocaleProvider'
import { FileDropzone } from '../../../components/shared/FileDropzone'

interface FilePickerProps {
  onSelect: (files: FileList) => void
  disabled?: boolean
}

export function FilePicker({ onSelect, disabled = false }: FilePickerProps) {
  const { t } = useLocale()

  return (
    <FileDropzone
      title={t('mergeVideos')}
      description={t('mergeLocalInfo')}
      buttonLabel={t('selectVideo')}
      accept="video/mp4,.mp4,video/x-matroska,.mkv"
      multiple
      disabled={disabled}
      aside={<span className="badge">MP4 / MKV</span>}
      onSelect={(files) => {
        if (files?.length) {
          onSelect(files)
        }
      }}
    />
  )
}
