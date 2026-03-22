/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Locale = 'es' | 'en'

const STORAGE_KEY = 'naroz-locale'

function detectLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'en'
  }

  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'es' || saved === 'en') {
    return saved
  }

  return window.navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
}

type Messages = Record<string, string>

const messages: Record<Locale, Messages> = {
  es: {
    brandTagline: 'Una plataforma modular para editar y convertir contenido multimedia desde el navegador.',
    general: 'General',
    video: 'Video',
    image: 'Imagen',
    active: 'Activa',
    section: 'Seccion',
    soon: 'Pronto',
    tools: 'Herramientas',
    web: 'Web',
    today: 'Disponible',
    homeTitle: 'Video e imagen, en un solo lugar',
    homeDescription: 'Elige una herramienta y empieza desde el navegador.',
    homeAvailable: 'Herramientas disponibles',
    homeUpcoming: 'Proximamente',
    activeCount: 'activas',
    openTool: 'Abrir herramienta',
    mergeVideos: 'Unir videos',
    convertVideo: 'Convertir formato',
    trimVideo: 'Recortar video',
    extractAudio: 'Extraer audio',
    resizeVideo: 'Cambiar resolucion',
    convertImage: 'Convertir formato',
    loadImage: 'Cargar imagen',
    selectImage: 'Seleccionar imagen',
    unsupportedImage: 'Formato no soportado',
    imageLoaded: 'Imagen cargada',
    imageMissing: 'Falta una imagen',
    imageHeroTitle: 'Convierte imagenes entre JPG, PNG, WebP, AVIF, GIF e ICO',
    imageHeroDesc: 'Sube una imagen, elige el formato de salida y descarga el archivo realmente convertido desde la misma suite.',
    formatsAvailable: 'Formatos disponibles',
    realConversion: 'Conversion real, no solo renombrado',
    imageConvertDesc: 'Esta herramienta esta pensada para conversiones directas y realistas en frontend.',
    imageStatus: 'Estado de conversion',
    imageStatusDesc: 'La conversion de imagen usa APIs del navegador, por lo que es inmediata en casos sencillos.',
    outputReady: 'Archivo listo',
    compatibility: 'Compatibilidad',
    processingLocal: 'Procesamiento local',
    mergeLocalInfo: 'La herramienta decide automaticamente la ruta mas rapida o mas compatible segun los archivos que subas y el formato final elegido.',
    mergeHeroTitle: 'Une varios videos desde una herramienta modular y lista para crecer',
    mergeHeroDesc: 'Sube tus archivos, ordenalos, revisa la estrategia automatica elegida y descarga un unico video final sin salir del navegador.',
    autoRoute: 'Ruta automatica',
    noMergeError: 'No se pudo completar la union',
    videoAdded: 'Videos agregados',
    emptyVideoDesc: 'Empieza seleccionando uno o varios archivos MP4 o MKV. Luego podras cambiar el orden, revisar la compatibilidad tecnica y generar el video final.',
    mergeComplete: 'Union completada',
    mergeActions: 'Acciones',
    mergeActionsDesc: 'La herramienta decide sola la mejor estrategia para tu lista actual.',
    finalFormat: 'Formato final',
    likelyRouteFast: 'Ruta automatica: rapida',
    likelyRouteCompatible: 'Ruta automatica: compatible',
    waitMerge: 'Si todos los videos ya coinciden con el formato final elegido, la ruta rapida evita conversiones innecesarias.',
    mergeVideosBtn: 'Unir videos',
    sidebarFooter: 'Base lista para sumar conversion, recorte, compresion y mas herramientas.',
    noImage: 'Sin imagen',
    noVideo: 'Sin videos',
    noVideoSelected: 'Sin video seleccionado',
    emptyImageTitle: 'Todavia no has cargado una imagen',
    emptyVideoTitle: 'Todavia no hay videos en la lista',
    emptyConvertVideoTitle: 'Selecciona un video para comenzar',
    videoLoaded: 'Video cargado',
    unsupportedFile: 'Archivo no soportado',
    conversionCompleted: 'Conversion completada',
    conversionError: 'Error de conversion',
    localConversion: 'Conversion local',
    convertVideoTitle: 'Convierte un video a MP4 o MKV',
    convertVideoDesc: 'Usa esta herramienta para cambiar el contenedor de salida de un solo video directamente en el navegador.',
    currentScope: 'Alcance actual',
    input: 'Entrada',
    output: 'Salida',
    convertVideoCardTitle: 'Convertir video',
    convertVideoCardDesc: 'Selecciona un archivo, elige un formato final y descarga el resultado convertido.',
    selectVideo: 'Seleccionar video',
    name: 'Nombre',
    size: 'Tamano',
    format: 'Formato',
    resolution: 'Resolucion',
    outputFormat: 'Formato de salida',
    converting: 'Convirtiendo...',
    convertVideoBtn: 'Convertir video',
    downloadConvertedVideo: 'Descargar video convertido',
    conversionStatus: 'Estado de conversion',
    conversionStatusDesc: 'El progreso refleja la preparacion y la conversion real del video.',
    targetOutput: 'Salida final',
    progressDetail: 'Detalle del progreso',
    waitingFile: 'Esperando un archivo.',
    convertedFileReady: 'Archivo convertido listo',
    duration: 'Duracion',
    stableFocus: 'En esta version, Naroz se enfoca en conversion estable entre MP4 y MKV antes de sumar herramientas de video mas avanzadas.',
    language: 'Idioma',
    english: 'Ingles',
    spanish: 'Espanol',
  },
  en: {
    brandTagline: 'A modular platform to edit and convert multimedia content directly in the browser.',
    general: 'General',
    video: 'Video',
    image: 'Image',
    active: 'Active',
    section: 'Section',
    soon: 'Soon',
    tools: 'Tools',
    web: 'Web',
    today: 'Today',
    homeTitle: 'Video and image, in one place',
    homeDescription: 'Pick a tool and start right in the browser.',
    homeAvailable: 'Available tools',
    homeUpcoming: 'Coming next',
    activeCount: 'active',
    openTool: 'Open tool',
    mergeVideos: 'Merge videos',
    convertVideo: 'Convert format',
    trimVideo: 'Trim video',
    extractAudio: 'Extract audio',
    resizeVideo: 'Change resolution',
    convertImage: 'Convert format',
    loadImage: 'Load image',
    selectImage: 'Select image',
    unsupportedImage: 'Unsupported format',
    imageLoaded: 'Image loaded',
    imageMissing: 'Missing image',
    imageHeroTitle: 'Convert images between JPG, PNG, WebP, AVIF, GIF, and ICO',
    imageHeroDesc: 'Upload one image, pick the output format, and download the truly converted file from the same suite.',
    formatsAvailable: 'Formats available',
    realConversion: 'Real conversion, not just renaming',
    imageConvertDesc: 'This tool is designed for direct and realistic frontend conversions.',
    imageStatus: 'Conversion status',
    imageStatusDesc: 'Image conversion uses browser APIs, so it is immediate in simple cases.',
    outputReady: 'File ready',
    compatibility: 'Compatibility',
    processingLocal: 'Local processing',
    mergeLocalInfo: 'The tool automatically decides the fastest or most compatible route based on your files and selected output format.',
    mergeHeroTitle: 'Merge several videos from a modular tool built to grow',
    mergeHeroDesc: 'Upload your files, reorder them, review the automatic strategy, and download one final video without leaving the browser.',
    autoRoute: 'Automatic route',
    noMergeError: 'The merge could not be completed',
    videoAdded: 'Videos added',
    emptyVideoDesc: 'Start by selecting one or more MP4 or MKV files. Then you can reorder them, review technical compatibility, and generate the final video.',
    mergeComplete: 'Merge completed',
    mergeActions: 'Actions',
    mergeActionsDesc: 'Naroz automatically picks the best strategy for your current list.',
    finalFormat: 'Final format',
    likelyRouteFast: 'Automatic route: fast',
    likelyRouteCompatible: 'Automatic route: compatible',
    waitMerge: 'If every video already matches the selected output format, the fast route avoids unnecessary conversions.',
    mergeVideosBtn: 'Merge videos',
    sidebarFooter: 'A flexible base ready for conversion, trimming, compression, and more tools.',
    noImage: 'No image',
    noVideo: 'No videos',
    noVideoSelected: 'No video selected',
    emptyImageTitle: 'You have not uploaded an image yet',
    emptyVideoTitle: 'There are no videos in the list yet',
    emptyConvertVideoTitle: 'Pick a video to start converting',
    videoLoaded: 'Video loaded',
    unsupportedFile: 'Unsupported file',
    conversionCompleted: 'Conversion completed',
    conversionError: 'Conversion error',
    localConversion: 'Local conversion',
    convertVideoTitle: 'Convert one video into MP4 or MKV',
    convertVideoDesc: 'Use this tool to change the output container of a single video directly in the browser.',
    currentScope: 'Current scope',
    input: 'Input',
    output: 'Output',
    convertVideoCardTitle: 'Convert video',
    convertVideoCardDesc: 'Pick one file, choose a target format, and download the converted result.',
    selectVideo: 'Select video',
    name: 'Name',
    size: 'Size',
    format: 'Format',
    resolution: 'Resolution',
    outputFormat: 'Output format',
    converting: 'Converting...',
    convertVideoBtn: 'Convert video',
    downloadConvertedVideo: 'Download converted video',
    conversionStatus: 'Conversion status',
    conversionStatusDesc: 'Progress reflects preparation and the actual video conversion process.',
    targetOutput: 'Target output',
    progressDetail: 'Progress detail',
    waitingFile: 'Waiting for a file.',
    convertedFileReady: 'Converted file ready',
    duration: 'Duration',
    stableFocus: 'For the current version, Naroz focuses on stable MP4/MKV conversion before adding more advanced video tools.',
    language: 'Language',
    english: 'English',
    spanish: 'Spanish',
  },
}

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale)
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      t: (key: string) => messages[locale][key] ?? key,
    }),
    [locale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider')
  }

  return context
}
