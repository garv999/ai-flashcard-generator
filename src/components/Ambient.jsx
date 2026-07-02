// Purely decorative cinematic backdrop that sits behind the whole app:
// drifting aurora light, a perspective "horizon" grid receding to a glowing
// vanishing point, and a spotlight vignette. No interactivity, no state.
export default function Ambient() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene-aurora" />
      <div className="scene-grid" />
      <div className="scene-glow" />
      <div className="scene-vignette" />
    </div>
  )
}
