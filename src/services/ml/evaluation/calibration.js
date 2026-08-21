// Calibration — do predicted probabilities match observed forgetting rates?
//
// Predictions are bucketed into fixed probability bands; for each band we report
// how many predictions fell in it, their average predicted probability, and the
// actual forgetting rate observed. A well-calibrated model has average predicted
// probability close to the observed rate in every populated band. We also report
// the Expected Calibration Error (ECE). We NEVER assert the model "is calibrated"
// here — that is left to the reader/UI to judge from the real numbers.

const round3 = (n) => (n == null ? null : Math.round(n * 1000) / 1000)

// Fixed bands: 0-20, 20-40, 40-60, 60-80, 80-100 (%).
const BANDS = [
  [0, 0.2],
  [0.2, 0.4],
  [0.4, 0.6],
  [0.6, 0.8],
  [0.8, 1.0001], // upper inclusive of 1.0
]

// Minimum data before showing calibration at all, and per-band before a band's
// observed rate is shown (thin bands are reported as count-only).
export const CAL_MIN = 30
export const CAL_BUCKET_MIN = 5

// Build the calibration view from { p, y } records.
export function calibration(records) {
  if (records.length < CAL_MIN) {
    return { available: false, n: records.length, min: CAL_MIN, buckets: [], ece: null }
  }
  const buckets = BANDS.map(([lo, hi]) => {
    const inBand = records.filter((r) => r.p >= lo && r.p < hi)
    const count = inBand.length
    const avgP = count ? inBand.reduce((s, r) => s + r.p, 0) / count : null
    // Only report an observed rate when the band has enough samples to mean anything.
    const enough = count >= CAL_BUCKET_MIN
    const actualRate = enough ? inBand.reduce((s, r) => s + r.y, 0) / count : null
    return {
      label: `${Math.round(lo * 100)}-${Math.round(Math.min(hi, 1) * 100)}%`,
      lo,
      hi: Math.min(hi, 1),
      count,
      avgPredicted: round3(avgP),
      observedRate: round3(actualRate),
      sufficient: enough,
    }
  })

  // Expected Calibration Error over bands with enough samples.
  let ece = 0
  let used = 0
  for (const b of buckets) {
    if (b.observedRate == null) continue
    ece += (b.count / records.length) * Math.abs(b.avgPredicted - b.observedRate)
    used += b.count
  }
  return {
    available: true,
    n: records.length,
    buckets,
    ece: used ? round3(ece) : null,
  }
}
