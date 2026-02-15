export function normalizeExternalHttpUrl(href: string, baseUrl: string): string | null {
  const trimmedHref = href.trim();
  if (!trimmedHref || trimmedHref.startsWith('#')) {
    return null;
  }

  try {
    const resolved = new URL(trimmedHref, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

export function findAnchorExternalUrl(target: EventTarget | null, baseUrl: string): string | null {
  let element: Element | null = null;

  if (target instanceof Element) {
    element = target;
  } else if (target instanceof Node) {
    element = target.parentElement;
  }

  if (!element) {
    return null;
  }

  const anchor = element.closest('a[href]');
  if (!anchor) {
    return null;
  }

  return normalizeExternalHttpUrl(anchor.getAttribute('href') ?? '', baseUrl);
}
