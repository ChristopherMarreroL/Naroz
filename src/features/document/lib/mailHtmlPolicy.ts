export const MAIL_HTML_FORBIDDEN_TAGS = [
  'audio', 'base', 'embed', 'form', 'iframe', 'input', 'link', 'math', 'meta',
  'object', 'script', 'source', 'style', 'svg', 'track', 'video',
]

export const MAIL_HTML_FORBIDDEN_ATTRIBUTES = [
  'background', 'formaction', 'href', 'poster', 'srcdoc', 'srcset', 'style', 'target',
]

export function isAllowedMailImageSource(value: string | null) {
  return /^data:image\/(?:avif|gif|jpe?g|png|webp);base64,/i.test(value?.trim() ?? '')
}
