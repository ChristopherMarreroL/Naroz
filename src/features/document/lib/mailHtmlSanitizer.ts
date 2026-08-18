import DOMPurify from 'dompurify'

import { isSafeMailImageSource, MAIL_HTML_FORBIDDEN_ATTRIBUTES, MAIL_HTML_FORBIDDEN_TAGS } from './mailHtmlPolicy'

const MAIL_HTML_MAX_NODES = 10_000

interface SanitizerDependencies {
  sanitize: (html: string, config: object) => string
  parse: (html: string) => Document
}

export function sanitizeMailHtml(html: string, dependencies?: SanitizerDependencies) {
  const config = {
    USE_PROFILES: { html: true },
    FORBID_TAGS: MAIL_HTML_FORBIDDEN_TAGS,
    FORBID_ATTR: MAIL_HTML_FORBIDDEN_ATTRIBUTES,
  }
  const normalized = html.replace(/oklch\([^)]*\)/gi, '#1f2937')
  const sanitized = dependencies
    ? dependencies.sanitize(normalized, config)
    : DOMPurify.sanitize(normalized, config)
  const document = dependencies
    ? dependencies.parse(sanitized)
    : new DOMParser().parseFromString(sanitized, 'text/html')

  if (document.body.querySelectorAll('*').length > MAIL_HTML_MAX_NODES) {
    return ''
  }

  document.querySelectorAll<HTMLElement>('[src]').forEach((element) => {
    if (!isSafeMailImageSource(element.getAttribute('src'))) {
      element.removeAttribute('src')
    }
  })

  document.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => {
    link.removeAttribute('href')
    link.removeAttribute('target')
    link.removeAttribute('rel')
  })

  return document.body.innerHTML
}
