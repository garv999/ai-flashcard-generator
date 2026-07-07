import { useState, useRef, useId } from 'react'
import { UploadIcon, FileTextIcon, CloseIcon, SparklesIcon, AlertIcon } from './Icons.jsx'
import {
  validatePdfFile,
  extractPdfText,
  pagesToText,
  formatBytes,
} from '../services/pdfService.js'

// Upload a PDF, extract its text, choose a page range, and generate cards.
// onGenerate(content, meta) should return a Promise<boolean> (true on success).
export default function PdfUpload({ onGenerate, loading }) {
  const [file, setFile] = useState(null)
  const [pages, setPages] = useState(null) // array of per-page text, or null
  const [numPages, setNumPages] = useState(0)
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState(null) // { current, total }
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [rangeMode, setRangeMode] = useState('all') // 'all' | 'range'
  const [fromPage, setFromPage] = useState(1)
  const [toPage, setToPage] = useState(1)

  const inputRef = useRef(null)
  const fromId = useId()
  const toId = useId()

  const busy = extracting || loading

  function reset() {
    setFile(null)
    setPages(null)
    setNumPages(0)
    setProgress(null)
    setError('')
    setRangeMode('all')
    setFromPage(1)
    setToPage(1)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleFile(selected) {
    const validationError = validatePdfFile(selected)
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setFile(selected)
    setPages(null)
    setExtracting(true)
    setProgress({ current: 0, total: 0 })
    try {
      const { numPages: n, pages: extracted } = await extractPdfText(selected, {
        onProgress: (p) => setProgress(p),
      })
      setNumPages(n)
      setPages(extracted)
      setFromPage(1)
      setToPage(n)
    } catch (err) {
      console.error('[Flashcards] PDF extraction failed:', err)
      setError('Could not read that PDF. It may be corrupted or password-protected.')
      setFile(null)
    } finally {
      setExtracting(false)
    }
  }

  function onInputChange(e) {
    const selected = e.target.files?.[0]
    if (selected) handleFile(selected)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (busy) return
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) handleFile(dropped)
  }

  async function handleGenerate() {
    if (!pages || busy) return

    let from = 1
    let to = numPages
    if (rangeMode === 'range') {
      from = Number(fromPage)
      to = Number(toPage)
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > numPages || from > to) {
        setError(`Enter a valid page range between 1 and ${numPages}.`)
        return
      }
    }
    setError('')

    const content = pagesToText(pages, from, to)
    if (content.trim().length < 30) {
      setError('The selected pages have too little text to generate flashcards.')
      return
    }

    const meta = {
      filename: file.name,
      pageCount: numPages,
      uploadDate: new Date().toISOString(),
      source: 'pdf',
      pageRange: rangeMode === 'range' ? { from, to } : null,
    }

    const ok = await onGenerate(content, meta)
    if (ok) reset()
  }

  // ---- Empty state: drop zone -------------------------------------------
  if (!file) {
    return (
      <section className="pdf-panel" aria-labelledby="pdf-heading" data-reveal="right">
        <h2 id="pdf-heading" className="pdf-heading">
          <FileTextIcon className="pdf-heading-icon" />
          Generate from a PDF
        </h2>

        <div
          className={`pdf-dropzone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            if (!busy) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !busy && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !busy) {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          aria-label="Upload a PDF file by clicking or dragging it here"
        >
          <UploadIcon className="pdf-drop-icon" />
          <p className="pdf-drop-title">
            <strong>Drag &amp; drop a PDF</strong> or click to browse
          </p>
          <p className="pdf-drop-sub">PDF only · up to 20 MB</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          onChange={onInputChange}
        />

        {error && (
          <div className="banner error pdf-error" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}
      </section>
    )
  }

  // ---- File selected: extracting / ready --------------------------------
  const pct = progress?.total ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <section className="pdf-panel" aria-labelledby="pdf-heading">
      <h2 id="pdf-heading" className="pdf-heading">
        <FileTextIcon className="pdf-heading-icon" />
        Generate from a PDF
      </h2>

      <div className="pdf-file-card">
        <span className="pdf-file-icon" aria-hidden="true">
          <FileTextIcon />
        </span>
        <div className="pdf-file-meta">
          <span className="pdf-file-name" title={file.name}>
            {file.name}
          </span>
          <span className="pdf-file-sub">
            {formatBytes(file.size)}
            {extracting
              ? ' · reading…'
              : numPages
                ? ` · ${numPages} page${numPages === 1 ? '' : 's'}`
                : ''}
          </span>
        </div>
        <button
          type="button"
          className="pdf-remove"
          onClick={reset}
          disabled={loading}
          aria-label="Remove PDF"
          title="Remove"
        >
          <CloseIcon />
        </button>
      </div>

      {extracting && (
        <div className="pdf-progress" aria-live="polite">
          <div className="pdf-progress-bar">
            <div className="pdf-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="pdf-progress-label">
            Extracting text… page {progress?.current || 0} of {progress?.total || 0}
          </span>
        </div>
      )}

      {pages && !extracting && (
        <>
          <span className="field-label">Pages to use</span>
          <div className="pdf-range" role="radiogroup" aria-label="Pages to use">
            <label className={`pdf-range-opt ${rangeMode === 'all' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="pdf-range"
                checked={rangeMode === 'all'}
                onChange={() => setRangeMode('all')}
                disabled={loading}
              />
              <span>Entire PDF ({numPages} page{numPages === 1 ? '' : 's'})</span>
            </label>
            <label className={`pdf-range-opt ${rangeMode === 'range' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="pdf-range"
                checked={rangeMode === 'range'}
                onChange={() => setRangeMode('range')}
                disabled={loading}
              />
              <span>Page range</span>
            </label>
          </div>

          {rangeMode === 'range' && (
            <div className="pdf-range-inputs">
              <label htmlFor={fromId}>From</label>
              <input
                id={fromId}
                type="number"
                className="text-input pdf-num"
                min={1}
                max={numPages}
                value={fromPage}
                onChange={(e) => setFromPage(e.target.value)}
                disabled={loading}
              />
              <label htmlFor={toId}>To</label>
              <input
                id={toId}
                type="number"
                className="text-input pdf-num"
                min={1}
                max={numPages}
                value={toPage}
                onChange={(e) => setToPage(e.target.value)}
                disabled={loading}
              />
              <span className="pdf-range-hint">of {numPages}</span>
            </div>
          )}

          <button
            type="button"
            className="btn-primary pdf-generate"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner spinner-sm" aria-hidden="true" />
                Generating…
              </>
            ) : (
              <>
                <SparklesIcon />
                Generate flashcards from PDF
              </>
            )}
          </button>
        </>
      )}

      {error && (
        <div className="banner error pdf-error" role="alert">
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}
    </section>
  )
}
