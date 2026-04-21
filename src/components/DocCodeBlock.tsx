import { useState } from 'react'

type Props = {
  /** Raw text to display and copy (trimmed for clipboard). */
  code: string
  /** Short label in the toolbar (e.g. bash, curl). */
  label?: string
}

/**
 * High-contrast CLI snippet with copy — used on /nhs/http-pay and similar doc pages.
 */
export function DocCodeBlock({ code, label = 'bash' }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.trimEnd())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="doc-code-block">
      <div className="doc-code-block__bar">
        <span className="doc-code-block__label">{label}</span>
        <button
          type="button"
          className="doc-code-block__copy"
          aria-label={copied ? 'Copied' : 'Copy code to clipboard'}
          onClick={copy}
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </div>
      <pre className="doc-code-block__pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

type NavLink = { href: string; label: string; hint?: string }

export function DocPageNav({ links }: { links: NavLink[] }) {
  return (
    <nav className="doc-nav" aria-label="Page">
      {links.map(({ href, label, hint }) => (
        <a key={href} className="doc-nav__link" href={href}>
          <span className="doc-nav__text">{label}</span>
          {hint ? <span className="doc-nav__hint">{hint}</span> : null}
        </a>
      ))}
    </nav>
  )
}
