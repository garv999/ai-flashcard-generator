import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SparklesIcon, ChevronRightIcon } from './Icons.jsx'

gsap.registerPlugin(ScrollTrigger)

// Colour "scenes" the background morphs between as you scroll (top, bottom, star tint).
const SCENES = [
  { top: [10, 12, 34], bottom: [26, 17, 64], star: [190, 190, 255] }, // indigo night
  { top: [8, 16, 40], bottom: [10, 40, 66], star: [150, 210, 255] }, // deep blue
  { top: [20, 12, 44], bottom: [46, 18, 60], star: [210, 170, 255] }, // violet
  { top: [10, 20, 40], bottom: [16, 44, 58], star: [160, 230, 240] }, // teal dawn
]

const lerp = (a, b, t) => a + (b - a) * t
function lerpRGB(a, b, t) {
  return `rgb(${Math.round(lerp(a[0], b[0], t))}, ${Math.round(lerp(a[1], b[1], t))}, ${Math.round(
    lerp(a[2], b[2], t),
  )})`
}
function sceneAt(p) {
  const n = SCENES.length - 1
  const x = Math.max(0, Math.min(1, p)) * n
  const i = Math.min(n - 1, Math.floor(x))
  const t = x - i
  const a = SCENES[i]
  const b = SCENES[i + 1]
  return {
    top: lerpRGB(a.top, b.top, t),
    bottom: lerpRGB(a.bottom, b.bottom, t),
    star: [
      Math.round(lerp(a.star[0], b.star[0], t)),
      Math.round(lerp(a.star[1], b.star[1], t)),
      Math.round(lerp(a.star[2], b.star[2], t)),
    ],
  }
}

// A tall hero whose fixed (sticky) stage renders a "flying through space" warp
// field on canvas. Scroll position scrubs the flight forward/backward and morphs
// the colour scene. GSAP/ScrollTrigger drive the progress + overlay hand-off.
export default function CinematicHero({ onGetStarted }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    let W = 0
    let H = 0
    let dpr = 1
    let cx = 0
    let cy = 0
    let focal = 700
    let stars = []
    let raf = 0
    let visible = true

    // Flight state: target set by scroll, current eased toward it for momentum.
    let target = reduced ? 0.28 : 0
    let cur = target
    const LOOPS = 7 // how many "depths" of stars we fly through across the hero

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cx = W / 2
      cy = H / 2
      focal = Math.min(W, H) * 0.9
      const count = W < 640 ? 320 : W < 1100 ? 520 : 800
      const aspect = W / H
      stars = Array.from({ length: count }, () => ({
        x: (Math.random() * 2 - 1) * aspect,
        y: Math.random() * 2 - 1,
        z: Math.random(), // 0..1 base depth
        s: Math.random() * 0.6 + 0.4, // size factor
      }))
    }

    const render = (velocity) => {
      const p = Math.max(0, Math.min(1, cur))
      const scene = sceneAt(p)

      // Morphing sky gradient
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, scene.top)
      g.addColorStop(1, scene.bottom)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)

      // Drifting nebula glow (shifts with progress)
      const nx = cx + Math.cos(p * 6.283) * W * 0.28
      const ny = cy + Math.sin(p * 6.283) * H * 0.22
      const neb = ctx.createRadialGradient(nx, ny, 0, nx, ny, Math.max(W, H) * 0.6)
      neb.addColorStop(0, `rgba(${scene.star[0]}, ${scene.star[1]}, ${scene.star[2]}, 0.1)`)
      neb.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = neb
      ctx.fillRect(0, 0, W, H)

      // Warp stars
      const depth = cur * LOOPS
      const streak = Math.min(0.09, Math.abs(velocity) * LOOPS * 0.9) // motion blur length
      const [sr, sg, sb] = scene.star

      for (const st of stars) {
        // effective depth wrapped into (0,1]
        let ez = (st.z - depth) % 1
        if (ez <= 0) ez += 1
        if (ez < 0.02) ez = 0.02

        const k = focal / ez
        const sx = cx + st.x * k
        const sy = cy + st.y * k
        if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue

        const near = 1 - ez // 0 (far) .. 1 (near)
        const alpha = Math.min(1, near * 1.2) * (reduced ? 0.6 : 1)
        const size = Math.max(0.4, near * near * 2.6 * st.s)

        if (streak > 0.004) {
          // draw a trail from a slightly deeper position → sense of speed
          let ez2 = ez + streak
          const k2 = focal / ez2
          const px = cx + st.x * k2
          const py = cy + st.y * k2
          ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${alpha})`
          ctx.lineWidth = size
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(sx, sy)
          ctx.stroke()
        } else {
          ctx.fillStyle = `rgba(${sr}, ${sg}, ${sb}, ${alpha})`
          ctx.beginPath()
          ctx.arc(sx, sy, size, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    const loop = () => {
      const prev = cur
      cur += (target - cur) * 0.09
      if (visible) render(cur - prev)
      raf = requestAnimationFrame(loop)
    }

    resize()

    // Entrance is handled with CSS (idempotent). GSAP/ScrollTrigger drive only
    // the scroll-based work; a gsap.context makes teardown revert cleanly.
    let gsapCtx
    if (reduced) {
      // Single static frame — no flight, fully legible, no rAF loop.
      render(0)
    } else {
      loop()
      gsapCtx = gsap.context(() => {
        // Scrub the flight progress from the scroll position.
        ScrollTrigger.create({
          trigger: wrapRef.current,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => {
            target = self.progress
          },
        })

        // Hand the overlay off as the flight ends (fully legible until then).
        gsap.to(overlayRef.current, {
          opacity: 0,
          y: -50,
          ease: 'none',
          scrollTrigger: {
            trigger: wrapRef.current,
            start: '62% top',
            end: 'bottom bottom',
            scrub: true,
          },
        })
      }, wrapRef)
    }

    const onVisibility = () => {
      visible = !document.hidden
    }
    // Pause the loop when the hero is fully scrolled away (perf).
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting && !document.hidden
      },
      { threshold: 0 },
    )
    io.observe(canvas)

    window.addEventListener('resize', resize, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      io.disconnect()
      gsapCtx?.revert()
    }
  }, [])

  return (
    <section ref={wrapRef} className="cine" aria-label="Introduction">
      <div className="cine-stage">
        <canvas ref={canvasRef} className="cine-canvas" aria-hidden="true" />
        <div className="cine-scrim" aria-hidden="true" />

        <div className="cine-overlay" ref={overlayRef}>
          <p className="cine-eyebrow" data-hero-in>
            AI-Powered Study Workspace
          </p>
          <h1 className="cine-title" data-hero-in>
            Learn anything,
            <br />
            <em>remember</em> everything.
          </h1>
          <p className="cine-sub" data-hero-in>
            Turn any topic or PDF into a smart flashcard deck with spaced repetition built in —
            so knowledge actually sticks.
          </p>
          <button type="button" className="cine-cta" onClick={onGetStarted} data-hero-in>
            <SparklesIcon />
            Start studying
          </button>
        </div>

        <button
          type="button"
          className="cine-scroll-hint"
          onClick={onGetStarted}
          aria-label="Scroll to the workspace"
        >
          <span>Scroll to explore</span>
          <ChevronRightIcon />
        </button>
      </div>
    </section>
  )
}
