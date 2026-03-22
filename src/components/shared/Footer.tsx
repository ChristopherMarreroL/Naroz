import { useLocale } from '../../i18n/LocaleProvider'

export function Footer() {
  const { locale } = useLocale()

  return (
    <footer className="panel flex flex-col gap-4 overflow-hidden px-5 py-5 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <p>{locale === 'es' ? '© 2026 - Todos los derechos reservados.' : '© 2026 - All rights reserved.'}</p>
      <a
        href="https://github.com/ChristopherMarreroL/Naroz"
        target="_blank"
        rel="noreferrer"
        className="inline-flex max-w-full items-center gap-2 break-all font-semibold text-slate-900 transition hover:text-sky-700 sm:break-normal">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5 fill-current">
          <path d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.3 9.4 7.87 10.92.58.11.79-.25.79-.56 0-.28-.01-1.2-.02-2.18-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.69-1.28-1.69-1.05-.71.08-.69.08-.69 1.16.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.97.1-.75.4-1.26.73-1.54-2.56-.29-5.25-1.29-5.25-5.74 0-1.27.45-2.31 1.19-3.13-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.19 1.2a11.1 11.1 0 0 1 5.8 0c2.22-1.51 3.18-1.2 3.18-1.2.64 1.58.24 2.75.12 3.04.74.82 1.19 1.86 1.19 3.13 0 4.46-2.69 5.44-5.26 5.73.41.36.78 1.08.78 2.18 0 1.58-.02 2.86-.02 3.25 0 .31.21.68.8.56a11.53 11.53 0 0 0 7.86-10.92C23.5 5.66 18.34.5 12 .5Z" />
        </svg>
        GitHub
      </a>
    </footer>
  );
}
