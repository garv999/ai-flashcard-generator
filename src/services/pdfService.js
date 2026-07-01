// PDF text extraction using pdf.js (pdfjs-dist).
//
// - validatePdfFile(): enforces "PDF only" + max 20 MB, with friendly errors.
// - extractPdfText(): parses the PDF in the browser and returns the text of
//   each page plus the total page count, reporting per-page progress.

import * as pdfjsLib from 'pdfjs-dist'
// Vite resolves this to a hashed URL and bundles the worker for production.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export const MAX_PDF_BYTES = 20 * 1024 * 1024 // 20 MB

// Human-readable file size, e.g. "3.4 MB".
export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

// Returns an error message string if invalid, or null if the file is OK.
export function validatePdfFile(file) {
  if (!file) return 'No file selected.'
  const isPdf =
    file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
  if (!isPdf) return 'Only PDF files are supported. Please choose a .pdf file.'
  if (file.size > MAX_PDF_BYTES) {
    return `That file is ${formatBytes(file.size)}. The maximum size is 20 MB.`
  }
  if (file.size === 0) return 'That PDF appears to be empty.'
  return null
}

// Extracts text from every page. Returns { numPages, pages } where
// `pages[i]` is the text of page (i + 1). Calls onProgress({current,total}).
export async function extractPdfText(file, { onProgress } = {}) {
  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  try {
    const numPages = pdf.numPages
    const pages = []
    for (let p = 1; p <= numPages; p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => (typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      pages.push(text)
      if (onProgress) onProgress({ current: p, total: numPages })
      // Yield to the event loop so the progress UI can paint.
      await Promise.resolve()
    }
    return { numPages, pages }
  } finally {
    pdf.destroy()
  }
}

// Joins the text for a 1-based inclusive page range into a single string.
export function pagesToText(pages, fromPage, toPage) {
  const from = Math.max(1, fromPage)
  const to = Math.min(pages.length, toPage)
  return pages.slice(from - 1, to).join('\n\n').trim()
}
