import { useMemo, useRef, useState, useEffect, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, Environment, Lightformer, ContactShadows } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'

useGLTF.preload('/iphone.glb')

const MODEL_URL = '/iphone.glb'

// ---- Tunables ----
const MODEL_ROT = [0, Math.PI, 0] // bring the screen to the front at rest
const SCREEN_MATERIAL = 'qfUvsPEhJGFIbDJ_001' // the emissive display mesh's material
const FIT_HEIGHT = 3.2 // target on-screen height in world units

const lerp = THREE.MathUtils.lerp

// ---------------------------------------------------------------------------
// Screen texture — the phone shows different parts of the Flashcard app.
// ---------------------------------------------------------------------------
function drawScreen(x, w, h, screen) {
  const rr = (a, b, ww, hh, r) => {
    x.beginPath()
    x.roundRect(a, b, ww, hh, r)
  }
  x.clearRect(0, 0, w, h)
  x.save()
  rr(0, 0, w, h, 60)
  x.clip()

  const bg = x.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#171a30')
  bg.addColorStop(1, '#0a0b16')
  x.fillStyle = bg
  x.fillRect(0, 0, w, h)

  // Dynamic Island
  x.fillStyle = '#000'
  rr(w / 2 - 72, 34, 144, 40, 20)
  x.fill()

  // Header
  const dg = x.createLinearGradient(40, 0, 60, 20)
  dg.addColorStop(0, '#8b7cff')
  dg.addColorStop(1, '#38bdf8')
  x.fillStyle = dg
  x.beginPath()
  x.arc(48, 118, 8, 0, Math.PI * 2)
  x.fill()
  x.fillStyle = 'rgba(255,255,255,0.96)'
  x.font = '600 26px Inter, system-ui, sans-serif'
  x.textBaseline = 'middle'
  x.fillText('AI Flashcards', 66, 120)

  const label = screen === 'stats' ? 'Stats' : screen === 'answer' ? '2 / 10' : '1 / 10'
  x.fillStyle = 'rgba(255,255,255,0.5)'
  x.font = '500 21px Inter, system-ui, sans-serif'
  x.textAlign = 'right'
  x.fillText(label, w - 34, 120)
  x.textAlign = 'left'

  const cx = 34
  const cw = w - 68

  if (screen === 'stats') {
    // Progress bar
    const tiles = [
      ['7', 'Day streak', '#f0a34a'],
      ['128', 'Reviews', '#8b7cff'],
      ['86%', 'Retention', '#34d399'],
      ['24', 'Mastered', '#38bdf8'],
    ]
    let ty = 200
    for (let i = 0; i < tiles.length; i++) {
      const [val, cap, col] = tiles[i]
      const tw = (cw - 20) / 2
      const tx = cx + (i % 2) * (tw + 20)
      if (i % 2 === 0 && i > 0) ty += 190
      const yy = ty + (i >= 2 ? 0 : 0)
      const row = Math.floor(i / 2)
      const py = 200 + row * 200
      x.fillStyle = 'rgba(255,255,255,0.04)'
      rr(tx, py, tw, 172, 24)
      x.fill()
      x.strokeStyle = 'rgba(255,255,255,0.08)'
      x.lineWidth = 2
      rr(tx, py, tw, 172, 24)
      x.stroke()
      x.fillStyle = col
      x.font = '700 56px Inter, system-ui, sans-serif'
      x.fillText(val, tx + 24, py + 70)
      x.fillStyle = 'rgba(255,255,255,0.55)'
      x.font = '600 20px Inter, system-ui, sans-serif'
      x.fillText(cap, tx + 24, py + 120)
    }
    x.restore()
    return
  }

  // Progress track
  x.fillStyle = 'rgba(255,255,255,0.1)'
  rr(cx, 152, cw, 8, 4)
  x.fill()
  const frac = screen === 'answer' ? 0.2 : 0.1
  const pg = x.createLinearGradient(cx, 0, cx + cw * frac, 0)
  pg.addColorStop(0, '#8b7cff')
  pg.addColorStop(1, '#38bdf8')
  x.fillStyle = pg
  rr(cx, 152, cw * frac, 8, 4)
  x.fill()

  // Card
  const cy = 200
  const ch = 560
  const cardg = x.createLinearGradient(0, cy, 0, cy + ch)
  if (screen === 'answer') {
    cardg.addColorStop(0, '#241f52')
    cardg.addColorStop(1, '#14152f')
  } else {
    cardg.addColorStop(0, '#212648')
    cardg.addColorStop(1, '#12142a')
  }
  x.fillStyle = cardg
  rr(cx, cy, cw, ch, 30)
  x.fill()
  x.strokeStyle = 'rgba(255,255,255,0.09)'
  x.lineWidth = 2
  rr(cx, cy, cw, ch, 30)
  x.stroke()

  x.fillStyle = screen === 'answer' ? '#7cc7ff' : 'rgba(255,255,255,0.42)'
  x.font = '700 18px Inter, system-ui, sans-serif'
  x.fillText(screen === 'answer' ? 'A N S W E R' : 'Q U E S T I O N', cx + 28, cy + 40)

  x.fillStyle = '#fff'
  x.textAlign = 'center'
  if (screen === 'answer') {
    x.font = '600 30px Inter, system-ui, sans-serif'
    const lines = ['Reviewing material at', 'increasing intervals so', 'it moves into long-term', 'memory.']
    lines.forEach((ln, i) => x.fillText(ln, w / 2, cy + 180 + i * 46))
  } else {
    x.font = '600 42px Inter, system-ui, sans-serif'
    ;['What is spaced', 'repetition?'].forEach((ln, i) =>
      x.fillText(ln, w / 2, cy + ch / 2 - 26 + i * 54),
    )
    x.font = '500 21px Inter, system-ui, sans-serif'
    x.fillStyle = 'rgba(255,255,255,0.4)'
    x.fillText('Tap to reveal answer', w / 2, cy + ch - 42)
  }
  x.textAlign = 'left'

  // Rating buttons
  const btns = [
    ['Again', '#ff6b8a'],
    ['Hard', '#f0a34a'],
    ['Good', '#7c6cff'],
    ['Easy', '#34d399'],
  ]
  const by = cy + ch + 26
  const gap = 15
  const bw = (cw - gap * 3) / 4
  const bh = 76
  btns.forEach(([labelB, col], i) => {
    const bx = cx + i * (bw + gap)
    x.fillStyle = col
    rr(bx, by, bw, bh, 20)
    x.fill()
    x.fillStyle = '#fff'
    x.font = '700 21px Inter, system-ui, sans-serif'
    x.textAlign = 'center'
    x.fillText(labelB, bx + bw / 2, by + bh / 2 + 2)
    x.textAlign = 'left'
  })

  x.restore()
}

function useScreenTexture() {
  return useMemo(() => {
    const w = 460
    const h = 1000
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    drawScreen(ctx, w, h, 'question')
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.flipY = false // match glTF UV convention
    tex.anisotropy = 8
    const set = (screen) => {
      drawScreen(ctx, w, h, screen)
      tex.needsUpdate = true
    }
    return { tex, set, w, h }
  }, [])
}

// ---------------------------------------------------------------------------
// Model + overlay screen
// ---------------------------------------------------------------------------
function PhoneModel({ screenTex }) {
  const { scene } = useGLTF(MODEL_URL)

  const { obj, fit } = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((o) => {
      if (!o.isMesh || !o.material) return
      o.castShadow = true
      o.receiveShadow = true
      const mat = o.material
      // Turn the phone's real display mesh into our live app screen.
      if (mat.name === SCREEN_MATERIAL) {
        // The original screen texture is an atlas, so re-project clean planar
        // UVs onto the flat display so our app UI maps edge-to-edge.
        const geo = o.geometry.clone()
        geo.computeBoundingBox()
        const bb = geo.boundingBox
        const size = new THREE.Vector3()
        bb.getSize(size)
        const comp = ['x', 'y', 'z']
        const dims = [size.x, size.y, size.z]
        const thin = dims.indexOf(Math.min(...dims))
        const rest = [0, 1, 2].filter((a) => a !== thin)
        const aV = dims[rest[0]] >= dims[rest[1]] ? rest[0] : rest[1] // long axis → V
        const aU = aV === rest[0] ? rest[1] : rest[0]
        const pos = geo.attributes.position
        const uv = new Float32Array(pos.count * 2)
        for (let i = 0; i < pos.count; i++) {
          const P = [pos.getX(i), pos.getY(i), pos.getZ(i)]
          const u = (P[aU] - bb.min[comp[aU]]) / (dims[aU] || 1)
          const v = (P[aV] - bb.min[comp[aV]]) / (dims[aV] || 1)
          uv[i * 2] = u
          uv[i * 2 + 1] = 1 - v
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
        o.geometry = geo
        o.material = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })
        o.renderOrder = 2
      } else {
        mat.envMapIntensity = 1.5
      }
    })
    const box = new THREE.Box3().setFromObject(clone)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)
    const scale = FIT_HEIGHT / (size.y || 1)
    return { obj: clone, fit: { scale, center, size } }
  }, [scene, screenTex])

  return (
    <group scale={fit.scale} rotation={MODEL_ROT}>
      <group position={[-fit.center.x, -fit.center.y, -fit.center.z]}>
        <primitive object={obj} />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Rig — idle float + rotate, mouse parallax, scroll-driven angle/zoom
// ---------------------------------------------------------------------------
function Rig({ progressRef, reduced, screen }) {
  const group = useRef()
  const screen0 = screen

  // Scroll keyframes for a natural multi-angle path (radians).
  const RY = [-0.55, 0.15, 2.4, 6.1] // front → 3/4 → back → full spin to front
  const RX = [0.16, -0.05, -0.16, 0.1]
  const SCL = [1, 1.08, 0.92, 1.04]

  const kf = (arr, p) => {
    const n = arr.length - 1
    const t = Math.max(0, Math.min(0.999, p)) * n
    const i = Math.floor(t)
    return lerp(arr[i], arr[i + 1], t - i)
  }

  useFrame((state) => {
    if (!group.current) return
    const g = group.current
    const p = reduced ? 0.08 : progressRef.current || 0
    const t = state.clock.elapsedTime
    const mx = reduced ? 0 : state.pointer.x
    const my = reduced ? 0 : state.pointer.y

    const ty = kf(RY, p) + (reduced ? 0 : mx * 0.28 + Math.sin(t * 0.35) * 0.05)
    const tx = kf(RX, p) + (reduced ? 0 : -my * 0.16 + Math.sin(t * 0.5) * 0.03)
    const ts = kf(SCL, p)

    if (reduced) {
      g.rotation.set(tx, ty, 0)
      g.scale.setScalar(ts)
      return
    }
    g.rotation.y += (ty - g.rotation.y) * 0.08
    g.rotation.x += (tx - g.rotation.x) * 0.08
    g.scale.setScalar(g.scale.x + (ts - g.scale.x) * 0.08)
    g.position.y = Math.sin(t * 0.6) * 0.06
    // gentle x drift for parallax depth
    g.position.x += (mx * 0.15 - g.position.x) * 0.05
  })

  return (
    <group ref={group}>
      <Suspense fallback={null}>
        <PhoneModel screenTex={screen0} />
      </Suspense>
    </group>
  )
}

export default function Iphone3D({ progressRef, reduced = false }) {
  const { tex, set } = useScreenTexture()
  const stageRef = useRef('question')
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const [paused, setPaused] = useState(false)
  const canvasElRef = useRef(null)

  // Swap the on-screen app view as you scroll through the hero.
  useEffect(() => {
    if (reduced) return
    let raf
    const tick = () => {
      const p = progressRef.current || 0
      const next = p < 0.34 ? 'question' : p < 0.64 ? 'answer' : 'stats'
      if (next !== stageRef.current) {
        stageRef.current = next
        set(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [progressRef, reduced, set])

  // Pause rendering when the hero is scrolled out of view (perf).
  useEffect(() => {
    const el = canvasElRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setPaused(!e.isIntersecting), {
      threshold: 0,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const usePost = !isMobile && !reduced

  return (
    <Canvas
      className="phone3d-canvas"
      dpr={isMobile ? [1, 1.5] : [1, 2]}
      shadows
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 7.2], fov: 30 }}
      frameloop={reduced || paused ? 'demand' : 'always'}
      onCreated={({ gl }) => {
        canvasElRef.current = gl.domElement
      }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[4, 6, 5]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-5, 2, -3]} intensity={0.6} color="#aab6ff" />
      <spotLight position={[0, 3, 6]} angle={0.5} penumbra={1} intensity={0.6} />

      <Rig progressRef={progressRef} reduced={reduced} screen={tex} />

      <ContactShadows position={[0, -2, 0]} opacity={0.5} scale={9} blur={3} far={4} color="#000000" />

      <Environment resolution={256}>
        <Lightformer intensity={2.6} position={[0, 3, 6]} scale={[9, 9, 1]} color="#ffffff" />
        <Lightformer intensity={1.3} position={[-6, 1, 3]} scale={[5, 6, 1]} color="#cfd4ff" />
        <Lightformer intensity={1.1} position={[6, -1, 3]} scale={[5, 6, 1]} color="#bfe6ff" />
        <Lightformer intensity={0.8} position={[0, -4, 2]} scale={[8, 4, 1]} color="#8a8d95" />
      </Environment>

      {usePost && (
        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={0.7} luminanceSmoothing={0.3} intensity={0.5} mipmapBlur />
          <Vignette eskil={false} offset={0.25} darkness={0.6} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
