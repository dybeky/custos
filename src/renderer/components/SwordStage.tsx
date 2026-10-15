import { useEffect, useRef } from 'react'

type Three = typeof import('three')

/**
 * The Custos sword, extruded and lit, turning inside three gyroscope rings with
 * orbiting shards — the same scene as the home page of 97437.dev. It takes its
 * colour from the active theme (`--scan-rgb`: lime in Custos, violet in Custos Pro),
 * follows the pointer, and stops drawing when it is off screen, the window is
 * hidden or the user asked for reduced motion. three.js loads on demand.
 */
function build(THREE: Three, host: HTMLElement): () => void {
  let renderer: InstanceType<Three['WebGLRenderer']>
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power'
    })
  } catch {
    return () => {}
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  host.appendChild(renderer.domElement)

  const channels = getComputedStyle(document.documentElement)
    .getPropertyValue('--scan-rgb')
    .trim()
    .split(/\s+/)
  const accent = new THREE.Color(
    `rgb(${channels[0] ?? 200}, ${channels[1] ?? 255}, ${channels[2] ?? 46})`
  )
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
  camera.position.set(0, 0, 10.5)

  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const key = new THREE.DirectionalLight(0xffffff, 2.4)
  key.position.set(3, 4, 6)
  scene.add(key)
  const rim = new THREE.PointLight(accent, 90, 0, 2)
  rim.position.set(-4, 1, 3)
  scene.add(rim)

  const disposables: Array<{ dispose(): void }> = []
  const track = <T extends { dispose(): void }>(thing: T): T => {
    disposables.push(thing)
    return thing
  }

  // ---- the sword: the same silhouette as the Custos mark ----
  const sword = new THREE.Group()
  const bodyMaterial = track(
    new THREE.MeshStandardMaterial({
      color: 0x101010,
      metalness: 0.95,
      roughness: 0.22,
      emissive: accent,
      emissiveIntensity: 0.07
    })
  )
  const edgeMaterial = track(
    new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.95 })
  )
  const extrude = (shape: InstanceType<Three['Shape']>, depth: number): void => {
    const geometry = track(
      new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.05,
        bevelSegments: 2
      })
    )
    geometry.translate(0, 0, -depth / 2)
    const mesh = new THREE.Mesh(geometry, bodyMaterial)
    mesh.add(new THREE.LineSegments(track(new THREE.EdgesGeometry(geometry, 28)), edgeMaterial))
    sword.add(mesh)
  }

  const blade = new THREE.Shape()
  blade.moveTo(0, 3.3)
  blade.lineTo(0.46, 2.35)
  blade.lineTo(0.46, 0)
  blade.lineTo(-0.46, 0)
  blade.lineTo(-0.46, 2.35)
  blade.closePath()
  extrude(blade, 0.22)

  const guard = new THREE.Shape()
  guard.moveTo(-1.45, 0)
  guard.lineTo(1.45, 0)
  guard.lineTo(1.3, -0.34)
  guard.lineTo(-1.3, -0.34)
  guard.closePath()
  extrude(guard, 0.34)

  const grip = new THREE.Shape()
  grip.moveTo(-0.17, -0.34)
  grip.lineTo(0.17, -0.34)
  grip.lineTo(0.17, -1.6)
  grip.lineTo(-0.17, -1.6)
  grip.closePath()
  extrude(grip, 0.26)

  const pommel = new THREE.Shape()
  pommel.absarc(0, -1.98, 0.36, 0, Math.PI * 2, false)
  extrude(pommel, 0.3)

  sword.position.y = -0.55
  const stage = new THREE.Group()
  stage.add(sword)
  scene.add(stage)

  // ---- gyroscope rings ----
  const rings: Array<InstanceType<Three['Mesh']>> = []
  ;[3.0, 3.7, 4.4].forEach((radius, i) => {
    const geometry = track(new THREE.TorusGeometry(radius, 0.012 + i * 0.004, 8, 180))
    const material = track(
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55 - i * 0.12 })
    )
    const ring = new THREE.Mesh(geometry, material)
    ring.rotation.set(i * 1.1, i * 0.7, i * 0.4)
    stage.add(ring)
    rings.push(ring)
  })

  // ---- shards in orbit ----
  const shardGeometry = track(new THREE.IcosahedronGeometry(0.2, 0))
  const shardMaterial = track(new THREE.MeshBasicMaterial({ color: accent, wireframe: true }))
  const shards = Array.from({ length: 7 }, (_, i) => {
    const mesh = new THREE.Mesh(shardGeometry, shardMaterial)
    stage.add(mesh)
    return {
      mesh,
      radius: 2.4 + (i % 4) * 0.55,
      speed: 0.35 + i * 0.07,
      phase: i * 0.9,
      tilt: i * 0.6
    }
  })

  const resize = (): void => {
    const w = host.clientWidth || 1
    const h = host.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // Keep the whole scene (rings reach ±4.4) inside a narrow, tall host.
    stage.scale.setScalar(Math.min(1, camera.aspect * 1.15) * 0.82)
    camera.updateProjectionMatrix()
  }
  resize()
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)

  const pointer = { x: 0, y: 0 }
  const onMove = (e: PointerEvent): void => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1
  }
  window.addEventListener('pointermove', onMove, { passive: true })

  let onScreen = true
  const intersection = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting
    schedule()
  })
  intersection.observe(host)
  const onVisibility = (): void => schedule()
  document.addEventListener('visibilitychange', onVisibility)

  let frame = 0
  let last = performance.now()
  let spin = 0
  const draw = (now: number): void => {
    frame = 0
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    spin += dt

    stage.rotation.y += (pointer.x * 0.55 - stage.rotation.y) * 0.05
    stage.rotation.x += (pointer.y * 0.28 - stage.rotation.x) * 0.05
    sword.rotation.y = spin * 0.6
    sword.position.y = -0.55 + Math.sin(spin * 1.2) * 0.12
    rings.forEach((ring, i) => {
      ring.rotation.x += dt * (0.25 + i * 0.12)
      ring.rotation.y += dt * (0.18 - i * 0.05)
    })
    shards.forEach((s) => {
      const a = spin * s.speed + s.phase
      s.mesh.position.set(
        Math.cos(a) * s.radius,
        Math.sin(a * 1.3 + s.tilt) * 1.4,
        Math.sin(a) * s.radius
      )
      s.mesh.rotation.x += dt * 1.4
      s.mesh.rotation.y += dt * 1.1
    })

    renderer.render(scene, camera)
    schedule()
  }
  function schedule(): void {
    if (!frame && onScreen && !document.hidden) frame = requestAnimationFrame(draw)
  }
  schedule()

  return () => {
    cancelAnimationFrame(frame)
    frame = -1
    resizeObserver.disconnect()
    intersection.disconnect()
    window.removeEventListener('pointermove', onMove)
    document.removeEventListener('visibilitychange', onVisibility)
    disposables.forEach((d) => d.dispose())
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  }
}

/** A square-ish transparent canvas host; size it from the outside. */
export function SwordStage({ className = '' }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let stop = (): void => {}
    let cancelled = false
    void import('three').then((THREE) => {
      if (!cancelled) stop = build(THREE, el)
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  return <div ref={host} className={className} aria-hidden />
}
