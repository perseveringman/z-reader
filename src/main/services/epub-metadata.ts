import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

export interface EpubMetadata {
  title?: string;
  author?: string;
  cover?: string;
  language?: string;
  publisher?: string;
  description?: string;
}

function getTextContent(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<(?:dc:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:dc:)?${tag}>`, 'i');
  const match = xml.match(regex);
  return match?.[1]?.trim() || undefined;
}

function getMetaContent(xml: string, name: string): string | undefined {
  const regex = new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match = xml.match(regex);
  return match?.[1]?.trim() || undefined;
}

function findCoverId(opfXml: string): string | undefined {
  const metaCover = opfXml.match(/<meta[^>]*name=["']cover["'][^>]*content=["']([^"']*)["']/i);
  if (metaCover) return metaCover[1];

  const metaCover2 = opfXml.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']cover["']/i);
  if (metaCover2) return metaCover2[1];

  return undefined;
}

function findCoverHref(opfXml: string, coverId: string): string | undefined {
  const escapedId = coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<item[^>]*id=["']${escapedId}["'][^>]*href=["']([^"']*)["']`, 'i');
  const match = opfXml.match(regex);
  if (match) return match[1];

  const regex2 = new RegExp(`<item[^>]*href=["']([^"']*)["'][^>]*id=["']${escapedId}["']`, 'i');
  const match2 = opfXml.match(regex2);
  return match2?.[1];
}

function findCoverByProperties(opfXml: string): string | undefined {
  const match = opfXml.match(/<item[^>]*properties=["'][^"']*cover-image[^"']*["'][^>]*href=["']([^"']*)["']/i);
  if (match) return match[1];

  const match2 = opfXml.match(/<item[^>]*href=["']([^"']*)["'][^>]*properties=["'][^"']*cover-image[^"']*["']/i);
  return match2?.[1];
}

function resolveRelativePath(basePath: string, relativePath: string): string {
  const baseDir = basePath.substring(0, basePath.lastIndexOf('/') + 1);
  return baseDir + relativePath;
}

export async function extractEpubMetadata(filePath: string): Promise<EpubMetadata> {
  const buffer = await readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) return {};

  const rootFileMatch = containerXml.match(/full-path=["']([^"']*)["']/);
  const opfPath = rootFileMatch?.[1];
  if (!opfPath) return {};

  const opfXml = await zip.file(opfPath)?.async('text');
  if (!opfXml) return {};

  const metadata: EpubMetadata = {
    title: getTextContent(opfXml, 'title'),
    author: getTextContent(opfXml, 'creator'),
    language: getTextContent(opfXml, 'language'),
    publisher: getTextContent(opfXml, 'publisher'),
    description: getTextContent(opfXml, 'description'),
  };

  if (!metadata.author) {
    metadata.author = getMetaContent(opfXml, 'author');
  }

  let coverHref: string | undefined;
  const coverId = findCoverId(opfXml);
  if (coverId) {
    coverHref = findCoverHref(opfXml, coverId);
  }
  if (!coverHref) {
    coverHref = findCoverByProperties(opfXml);
  }

  if (coverHref) {
    const coverPath = resolveRelativePath(opfPath, coverHref);
    const coverFile = zip.file(coverPath) ?? zip.file(decodeURIComponent(coverHref));
    if (coverFile) {
      const coverData = await coverFile.async('base64');
      const ext = coverHref.split('.').pop()?.toLowerCase() ?? 'jpeg';
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      metadata.cover = `data:${mime};base64,${coverData}`;
    }
  }

  return metadata;
}

export async function extractPdfMetadata(filePath: string): Promise<{ title?: string; author?: string }> {
  try {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
    GlobalWorkerOptions.workerSrc = '';
    const doc = await getDocument({ url: `file://${filePath}`, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
    const info = await doc.getMetadata();
    const pdfInfo = info?.info as Record<string, string> | undefined;
    const result: { title?: string; author?: string } = {};
    if (pdfInfo?.Title) result.title = pdfInfo.Title;
    if (pdfInfo?.Author) result.author = pdfInfo.Author;
    doc.destroy();
    return result;
  } catch {
    return {};
  }
}
