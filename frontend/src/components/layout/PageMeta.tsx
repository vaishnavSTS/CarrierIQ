import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

import { metaFor } from '../../seo/pages'

/** Sets the tab title and the search-result description for the page being shown (src/seo/pages.ts). */
export function PageMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    const { title, description } = metaFor(pathname)
    document.title = title
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!tag) {
      tag = document.createElement('meta')
      tag.name = 'description'
      document.head.appendChild(tag)
    }
    tag.content = description
  }, [pathname])

  return null
}
