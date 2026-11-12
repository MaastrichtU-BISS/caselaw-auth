// Legal documents belong to the product, not to this package: each project
// passes its own addresses and gets back links ready to render.

export interface LegalLink {
  label: string
  href: string
}

export interface LegalConfig {
  termsUrl?: string
  privacyUrl?: string
  cookiesUrl?: string
  /** Further documents, such as an imprint or a data-processing notice. */
  extra?: LegalLink[]
  /** Override the default English labels, e.g. for a translated product. */
  labels?: {
    terms?: string
    privacy?: string
    cookies?: string
  }
}

// Only web addresses and same-site paths, so a configured value can never
// become a javascript: link.
function isSafeHref(href: string | undefined): href is string {
  if (!href) return false
  return /^https?:\/\//i.test(href) || (href.startsWith('/') && !href.startsWith('//'))
}

/** The configured legal links, in display order, with empty or unsafe entries left out. */
export function legalLinks(legal?: LegalConfig | null): LegalLink[] {
  if (!legal) return []
  const labels = legal.labels || {}
  const links: Array<LegalLink | { label: string; href: string | undefined }> = [
    { label: labels.terms || 'Terms of Service', href: legal.termsUrl },
    { label: labels.privacy || 'Privacy Policy', href: legal.privacyUrl },
    { label: labels.cookies || 'Cookie Policy', href: legal.cookiesUrl },
    ...(legal.extra || []),
  ]
  return links.filter((link): link is LegalLink => Boolean(link.label) && isSafeHref(link.href))
}
