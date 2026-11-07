import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import * as CANNON from 'cannon-es'
import GUI from 'lil-gui'

/* ============================================================
   0. ПЛЕЙЛИСТ ТА ПАРАМЕТРИ ПУЛЬТА
   (файли лежать у static/sounds/)
   ============================================================ */
const tracks = [
    { title: 'In The End', artist: 'Linkin Park', file: 'in-the-end.m4a' },
    { title: 'Shape of You', artist: 'Ed Sheeran', file: 'shape-of-you.m4a' },
    { title: "What I've Done", artist: 'Linkin Park', file: 'what-ive-done.m4a' },
    { title: 'New Divide', artist: 'Linkin Park', file: 'new-divide.m4a' },
    { title: 'Somebody That I Used To Know', artist: 'Gotye ft. Kimbra', file: 'somebody-that-i-used-to-know.m4a' },
    { title: 'The Way I Are', artist: 'Timbaland ft. Keri Hilson', file: 'the-way-i-are.m4a' }
]
const trackState = { track: 0 }

// Усі регулятори нормалізовані 0..1 (і GUI, і 3D-фейдери/крутилки змінюють саме цей об'єкт)
const ui = { vol: 0.75, bass: 0.5, mid: 0.5, treble: 0.5, pan: 0.5, filter: 1, speed: 0.5, glow: 0.5, hue: 0 }
const params = { beatPower: 1, strobe: false }

/* ============================================================
   1. БАЗА: сцена, камера, рендер
   ============================================================ */
const canvas = document.querySelector('canvas.webgl')
const sizes = { width: window.innerWidth, height: window.innerHeight }
const TOP = 1.55 // висота верхньої панелі пульта

const scene = new THREE.Scene()
scene.background = new THREE.Color('#07030f')
scene.fog = new THREE.FogExp2('#0b0620', 0.011)

const camera = new THREE.PerspectiveCamera(50, sizes.width / sizes.height, 0.1, 400)
const introFrom = new THREE.Vector3(0, 16, 34)
const introTo = new THREE.Vector3(0, 6.6, 13.8)
camera.position.copy(introFrom)
scene.add(camera)

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.28

const controls = new OrbitControls(camera, canvas)
controls.target.set(0, 2, 0)
controls.enableDamping = true
controls.minDistance = 4
controls.maxDistance = 38
controls.maxPolarAngle = Math.PI / 2 - 0.04
controls.enabled = false

/* ============================================================
   2. ПОСТОБРОБКА: MSAA + Bloom + ACES
   ============================================================ */
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(sizes.width, sizes.height, {
    type: THREE.HalfFloatType, samples: 4
}))
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(sizes.width, sizes.height), 1.0, 0.65, 0.8)
composer.addPass(bloom)
composer.addPass(new OutputPass())
let bloomBase = 1.0

/* ============================================================
   3. НЕОНОВА ПАЛІТРА (змінюється крутилкою HUE)
   ============================================================ */
const neon = { a: new THREE.Color(), b: new THREE.Color() }
const neonMats = []
const makeNeon = (which, intensity = 2.5) => {
    const m = new THREE.MeshStandardMaterial({ color: '#050508', emissive: '#ffffff', emissiveIntensity: intensity, roughness: 0.4 })
    neonMats.push({ m, which })
    return m
}

/* ============================================================
   4. ПРОЦЕДУРНІ ТЕКСТУРИ (canvas)
   ============================================================ */
const makeCanvasTexture = (w, h, draw) => {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    draw(c.getContext('2d'), w, h)
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = renderer.capabilities.getMaxAnisotropy()
    return t
}

const brushedTex = makeCanvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#2b2e3d'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 5000; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`
        g.fillRect(Math.random() * w, Math.random() * h, 60 + Math.random() * 380, 1)
    }
})

const vinylTex = makeCanvasTexture(512, 512, (g, w) => {
    g.fillStyle = '#050505'; g.fillRect(0, 0, w, w)
    for (let r = 80; r < 250; r += 2.5) {
        g.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.07})`
        g.beginPath(); g.arc(w / 2, w / 2, r, 0, Math.PI * 2); g.stroke()
    }
    g.fillStyle = '#ff2bd0'; g.beginPath(); g.arc(w / 2, w / 2, 72, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, w / 2, 56, 0, Math.PI * 2); g.stroke()
    g.fillStyle = '#05030c'; g.beginPath(); g.arc(w / 2, w / 2, 8, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText('NEON DECK', w / 2, w / 2 + 34)
})

const windowsTex = makeCanvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#080a14'; g.fillRect(0, 0, w, h)
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const r = Math.random()
        if (r > 0.45) {
            g.fillStyle = r > 0.92 ? '#ff4fd8' : r > 0.84 ? '#4fe9ff' : '#ffd37a'
            g.fillRect(x * 32 + 6, y * 32 + 7, 20, 18)
        }
    }
})
windowsTex.repeat.set(2, 3)

/* ============================================================
   5. ШЕЙДЕРИ (ShaderMaterial)
   ============================================================ */
// Спектр звуку → текстура 64x1 для шейдера екрана
const specData = new Uint8Array(64)
const specTex = new THREE.DataTexture(specData, 64, 1, THREE.RedFormat, THREE.UnsignedByteType)
specTex.minFilter = specTex.magFilter = THREE.LinearFilter
specTex.needsUpdate = true

// 5.1 Екран пульта: LED-еквалайзер + пульсуюче кільце + рухома сітка
const screenMat = new THREE.ShaderMaterial({
    uniforms: {
        uTime: { value: 0 }, uBass: { value: 0 }, uSpec: { value: specTex },
        uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform float uTime; uniform float uBass; uniform sampler2D uSpec;
        uniform vec3 uColA; uniform vec3 uColB;
        void main() {
            vec2 uv = vUv;
            vec3 col = mix(vec3(0.03, 0.0, 0.08), vec3(0.10, 0.0, 0.20), uv.y);

            // рухома сітка
            vec2 gp = vec2(uv.x * 48.0, uv.y * 18.0 + uTime * 0.6);
            vec2 f = abs(fract(gp) - 0.5);
            col += mix(uColA, uColB, uv.x) * smoothstep(0.47, 0.5, max(f.x, f.y)) * (0.10 + uBass * 0.25);

            // пульсуюче кільце
            vec2 c = (uv - vec2(0.5, 0.60)) * vec2(3.1, 1.0);
            float d = length(c);
            float r = 0.17 + uBass * 0.10;
            col += uColB * smoothstep(0.014, 0.0, abs(d - r)) * 1.8;
            col += uColA * smoothstep(0.010, 0.0, abs(d - r * 1.55 - sin(uTime * 2.0) * 0.01)) * 0.9;

            // LED-стовпчики
            float n = 48.0;
            float id = floor(uv.x * n);
            float fx = fract(uv.x * n);
            float v = texture2D(uSpec, vec2((id + 0.5) / n, 0.5)).r;
            float base = 0.10;
            float h = v * 0.75;
            float seg = step(0.22, fract(uv.y * 26.0));
            float bar = step(base, uv.y) * step(uv.y, base + h) * step(fx, 0.78) * seg;
            vec3 barCol = mix(uColA, uColB, clamp((uv.y - base) * 1.7, 0.0, 1.0)) * (1.2 + v * 1.6);
            col += bar * barCol;
            // відображення під лінією
            float refl = step(uv.y, base) * step(base - h * 0.35, uv.y) * step(fx, 0.78) * 0.28;
            col += refl * mix(uColA, uColB, 0.3);

            col *= 0.88 + 0.12 * sin(uv.y * 520.0);
            col *= 1.0 - 0.55 * length(uv - 0.5);
            gl_FragColor = vec4(col, 1.0);
        }
    `
})

// 5.2 Підлога-сітка: імпульс від баса, хвилі, затухання з відстанню
const gridMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBass: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() } },
    vertexShader: /* glsl */`
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */`
        varying vec3 vW; uniform float uTime; uniform float uBass; uniform vec3 uA; uniform vec3 uB;
        float grid(vec2 p, float w) {
            vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
            return 1.0 - min(min(g.x, g.y) / w, 1.0);
        }
        void main() {
            float dist = length(vW.xz);
            float l = grid(vW.xz / 2.0, 1.2);
            vec3 lineCol = mix(uA, uB, smoothstep(15.0, 90.0, dist));
            float wave = smoothstep(0.88, 1.0, sin(dist * 0.35 - uTime * 2.2)) * 0.5;
            vec3 col = vec3(0.012, 0.0, 0.03) + lineCol * (l * (0.6 + uBass * 2.4) + wave * l);
            col *= exp(-dist * 0.013);
            gl_FragColor = vec4(col, 1.0);
        }
    `
})
const gridFloor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), gridMat)
gridFloor.rotation.x = -Math.PI / 2
gridFloor.position.y = -0.45
scene.add(gridFloor)

// 5.3 Небо: градієнт + зірки
const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
        varying vec3 vDir; uniform float uTime;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        void main(){
            vec3 d = normalize(vDir);
            float h = clamp(d.y, 0.0, 1.0);
            vec3 col = mix(vec3(0.35, 0.05, 0.40), vec3(0.015, 0.01, 0.07), pow(h, 0.4));
            vec3 sp = floor(d * 240.0);
            float star = step(0.9968, hash(sp)) * smoothstep(0.08, 0.35, h);
            col += star * (0.5 + 0.5 * sin(uTime * 2.5 + hash(sp) * 30.0));
            gl_FragColor = vec4(col, 1.0);
        }
    `
})
scene.add(new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), skyMat))

/* ============================================================
   6. ОСВІТЛЕННЯ + ТІНІ
   ============================================================ */
scene.add(new THREE.HemisphereLight('#6b5bd6', '#12081f', 0.45))

const dirLight = new THREE.DirectionalLight('#9bb0ff', 1.2)
dirLight.position.set(-8, 14, 9)
dirLight.castShadow = true
dirLight.shadow.mapSize.set(2048, 2048)
Object.assign(dirLight.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 45 })
dirLight.shadow.bias = -0.0004
dirLight.shadow.normalBias = 0.03
scene.add(dirLight)

const spot = new THREE.SpotLight('#fff1ff', 260, 50, Math.PI / 6, 0.6, 1.4)
spot.position.set(0, 13, 8)
spot.target.position.set(0, TOP, 0)
spot.castShadow = true
spot.shadow.mapSize.set(2048, 2048)
spot.shadow.bias = -0.0003
spot.shadow.normalBias = 0.02
scene.add(spot, spot.target)

const lightA = new THREE.PointLight('#ff2bd0', 70, 22, 1.6); lightA.position.set(-8, 4, 5); scene.add(lightA)
const lightB = new THREE.PointLight('#00e5ff', 70, 22, 1.6); lightB.position.set(8, 4, 5); scene.add(lightB)
const flash = new THREE.PointLight('#ffffff', 0, 30, 1.5); flash.position.set(0, 6, 4); scene.add(flash)

const recolor = () => {
    neon.a.setHSL((0.88 + ui.hue) % 1, 1, 0.55)
    neon.b.setHSL((0.52 + ui.hue) % 1, 1, 0.5)
    neonMats.forEach(({ m, which }) => m.emissive.copy(neon[which]))
    lightA.color.copy(neon.a); lightB.color.copy(neon.b)
    screenMat.uniforms.uColA.value.copy(neon.a); screenMat.uniforms.uColB.value.copy(neon.b)
    gridMat.uniforms.uA.value.copy(neon.a); gridMat.uniforms.uB.value.copy(neon.b)
}

/* ============================================================
   7. ФІЗИЧНИЙ СВІТ (cannon-es)
   ============================================================ */
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })
world.broadphase = new CANNON.SAPBroadphase(world)
const physMat = new CANNON.Material('default')
world.addContactMaterial(new CANNON.ContactMaterial(physMat, physMat, { friction: 0.2, restitution: 0.55 }))
const addStaticBox = (hx, hy, hz, x, y, z) => {
    const b = new CANNON.Body({ mass: 0, material: physMat, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) })
    b.position.set(x, y, z); world.addBody(b)
}
addStaticBox(20, 0.5, 20, 0, -0.5, 0) // підлога (верх на y=0)

/* ============================================================
   8. МАТЕРІАЛИ + ПРИМІТИВИ: ПУЛЬТ
   ============================================================ */
const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m }
const metal = new THREE.MeshStandardMaterial({ map: brushedTex, bumpMap: brushedTex, bumpScale: 0.4, color: '#9aa0b8', metalness: 0.92, roughness: 0.34 })
const glossy = new THREE.MeshPhysicalMaterial({ color: '#07070d', metalness: 0.25, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 })
const plate = new THREE.MeshPhysicalMaterial({ color: '#10111b', metalness: 0.4, roughness: 0.22, clearcoat: 0.8 })
const plastic = new THREE.MeshStandardMaterial({ color: '#16161f', metalness: 0.6, roughness: 0.3 })
const chrome = new THREE.MeshStandardMaterial({ color: '#d7dbea', metalness: 1, roughness: 0.15 })

// Підлога-платформа
const floor = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 0.4, 96), new THREE.MeshPhysicalMaterial({
    color: '#0a0a14', metalness: 0.8, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1
})))
floor.position.y = -0.2
scene.add(floor)
const floorRing = new THREE.Mesh(new THREE.TorusGeometry(18, 0.07, 12, 128), makeNeon('a', 3))
floorRing.rotation.x = Math.PI / 2; floorRing.position.y = 0.02
scene.add(floorRing)

// Корпус пульта
const plinth = shadowed(new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.5, 5.2), plastic)); plinth.position.y = 0.25; scene.add(plinth)
const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(12, 1, 6, 6, 0.14), metal)); body.position.y = 1; scene.add(body)
const topPanel = shadowed(new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.05, 5.5), glossy)); topPanel.position.y = 1.525; scene.add(topPanel)
const mixerPlate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.03, 4.9), plate)); mixerPlate.position.set(0, TOP + 0.015, 0.3); scene.add(mixerPlate)

// Неонові смуги
const neonFront = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.06, 0.06), makeNeon('b', 3)); neonFront.position.set(0, 1.12, 3.03); scene.add(neonFront)
const neonBase = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.05, 5.4), makeNeon('a', 2.2)); neonBase.position.y = 0.5; scene.add(neonBase)

// Екран (шейдер) на опорах
const screenGroup = new THREE.Group()
screenGroup.position.set(0, 4.3, -3.3); screenGroup.rotation.x = -0.1
scene.add(screenGroup)
screenGroup.add(shadowed(new THREE.Mesh(new RoundedBoxGeometry(10.6, 3.8, 0.3, 4, 0.08), metal)))
const screen = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.3), screenMat)
screen.position.z = 0.16
screenGroup.add(screen)
;[-5.1, 5.1].forEach((x) => {
    const p = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 20), chrome))
    p.position.set(x, 2.05, -3.3); scene.add(p)
})

// Підписи на панелі (canvas-текстури)
const label = (text, x, z, w = 0.7, h = 0.17, color = '#7fe9ff', parent = scene, y = TOP + 0.036) => {
    const tex = makeCanvasTexture(256, 64, (g, cw, ch) => {
        g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
        g.fillStyle = color; g.fillText(text, cw / 2, ch / 2 + 2)
    })
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }))
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z)
    parent.add(m)
    return m
}

// Дисплей "Now playing" (динамічна canvas-текстура)
const npCanvas = document.createElement('canvas'); npCanvas.width = 512; npCanvas.height = 128
const npTex = new THREE.CanvasTexture(npCanvas); npTex.colorSpace = THREE.SRGBColorSpace
const npMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: npTex, toneMapped: false }))
const npGroup = new THREE.Group()
npGroup.position.set(0, TOP + 0.4, -1.65); npGroup.rotation.x = -0.65
npGroup.add(shadowed(new THREE.Mesh(new RoundedBoxGeometry(3.4, 0.95, 0.12, 3, 0.04), plastic)))
npMesh.position.z = 0.07; npGroup.add(npMesh)
scene.add(npGroup)
const drawNowPlaying = () => {
    const g = npCanvas.getContext('2d')
    g.fillStyle = '#07030f'; g.fillRect(0, 0, 512, 128)
    g.fillStyle = '#' + neon.b.getHexString()
    g.font = 'bold 30px sans-serif'; g.textBaseline = 'top'
    const t = tracks[trackState.track]
    g.fillText(`${trackState.track + 1}. ${t.title}`.slice(0, 30), 14, 12)
    g.fillStyle = '#' + neon.a.getHexString(); g.font = '22px sans-serif'
    g.fillText(t.artist.slice(0, 40), 14, 52)
    const dur = audioEl.duration || 0, cur = audioEl.currentTime || 0
    g.fillStyle = '#2a2040'; g.fillRect(14, 96, 484, 10)
    g.fillStyle = '#' + neon.b.getHexString(); g.fillRect(14, 96, dur ? 484 * (cur / dur) : 0, 10)
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    g.fillStyle = '#ffffff'; g.font = '16px sans-serif'; g.textAlign = 'right'
    g.fillText(`${fmt(cur)} / ${fmt(dur)}`, 498, 76); g.textAlign = 'left'
    g.fillText(audioEl.paused ? '⏸ PAUSE' : '▶ PLAY', 14, 74)
    npTex.needsUpdate = true
}

/* ---------- Інтерактивні елементи ---------- */
const interactives = []
const addCtl = (mesh, ctl) => { mesh.userData.ctl = ctl; mesh.userData.press = 0; interactives.push(mesh); shadowed(mesh); scene.add(mesh); return mesh }
const vis = { ...ui } // згладжені значення для візуалу

// Фейдери (канали): BASS / MID / TREBLE / VOL
const faders = []
;[{ key: 'bass', x: -1.05, name: 'BASS' }, { key: 'mid', x: -0.35, name: 'MID' }, { key: 'treble', x: 0.35, name: 'TREBLE' }, { key: 'vol', x: 1.05, name: 'VOL' }].forEach((f) => {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 1.4), glossy); slot.position.set(f.x, TOP + 0.04, 1.15); scene.add(slot)
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 1.4), makeNeon('b', 1.6)); led.position.set(f.x, TOP + 0.058, 1.15); scene.add(led)
    const cap = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.14, 0.38, 3, 0.03), chrome)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.03), makeNeon('a', 3)); stripe.position.y = 0.075; cap.add(stripe)
    cap.position.set(f.x, TOP + 0.11, 1.8)
    addCtl(cap, { kind: 'fader', axis: 'z', a: 1.8, b: 0.5, key: f.key })
    faders.push({ cap, key: f.key, x: f.x, a: 1.8, b: 0.5, axis: 'z' })
    label(f.name, f.x, 2.12, 0.62, 0.15)
})
// Кросфейдер (PAN)
{
    const slot = new THREE.Mesh(new THREE.BoxGeometry(2, 0.03, 0.08), glossy); slot.position.set(0, TOP + 0.04, 2.45); scene.add(slot)
    const cap = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.14, 0.26, 3, 0.03), chrome)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.2), makeNeon('a', 3)); stripe.position.y = 0.075; cap.add(stripe)
    cap.position.set(0, TOP + 0.11, 2.45)
    addCtl(cap, { kind: 'fader', axis: 'x', a: -0.9, b: 0.9, key: 'pan' })
    faders.push({ cap, key: 'pan', z: 2.45, a: -0.9, b: 0.9, axis: 'x' })
    label('L  ‹ PAN ›  R', 0, 2.65, 1.1, 0.15)
}
// Крутилки
const knobs = []
;[{ key: 'filter', x: -1.05, name: 'FILTER' }, { key: 'speed', x: -0.35, name: 'SPEED' }, { key: 'glow', x: 0.35, name: 'GLOW' }, { key: 'hue', x: 1.05, name: 'HUE' }].forEach((k) => {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.26, 36), plastic)
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.16), makeNeon('b', 4)); ind.position.set(0, 0.14, -0.1); knob.add(ind)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.012, 8, 40), makeNeon('a', 2.5)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.1; knob.add(ring)
    knob.position.set(k.x, TOP + 0.16, -0.2)
    addCtl(knob, { kind: 'knob', key: k.key })
    knobs.push({ knob, key: k.key })
    label(k.name, k.x, 0.2, 0.62, 0.15)
})
// Кнопки транспорту
const buttons = []
;[{ x: -1.05, name: 'PREV', fn: () => nextTrack(-1) }, { x: -0.35, name: 'PLAY', fn: () => togglePlay() }, { x: 0.35, name: 'NEXT', fn: () => nextTrack(1) }, { x: 1.05, name: 'DROP', fn: () => spawnPit(12, true) }].forEach((b) => {
    const mat = makeNeon('a', 0.5)
    const btn = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.16, 0.38, 3, 0.04), mat)
    btn.position.set(b.x, TOP + 0.1, -0.85)
    addCtl(btn, { kind: 'btn', action: b.fn })
    buttons.push({ btn, baseY: TOP + 0.1, mat })
    label(b.name, b.x, -0.85, 0.46, 0.13, '#ffffff', btn, 0.085)
})
// Пади вибору треку (1–6)
const pads = []
tracks.forEach((t, i) => {
    const mat = makeNeon(i < 3 ? 'a' : 'b', 0.4)
    const pad = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.12, 0.42, 3, 0.04), mat)
    const side = i < 3 ? -1 : 1
    pad.position.set(side * 1.95, TOP + 0.08, -0.6 + (i % 3) * 0.7)
    addCtl(pad, { kind: 'pad', action: () => loadTrack(i, true) })
    pads.push({ pad, mat, baseY: TOP + 0.08, index: i })
    label(String(i + 1), 0, 0, 0.26, 0.2, '#ffffff', pad, 0.065)
})

/* ---------- Вертушки (складний об'єкт з примітивів) ---------- */
const vinylSide = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.4 })
const vinylTop = new THREE.MeshStandardMaterial({ map: vinylTex, roughness: 0.22, metalness: 0.45 })
const decks = []
const buildDeck = (cx, s) => {
    const g = new THREE.Group(); g.position.set(cx, TOP, 0.3); scene.add(g)
    const base = shadowed(new THREE.Mesh(new RoundedBoxGeometry(3.5, 0.12, 3.5, 3, 0.05), glossy)); base.position.y = 0.06; g.add(base)
    const platter = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.1, 64), metal)); platter.position.y = 0.17; g.add(platter)
    const vinyl = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.03, 64), [vinylSide, vinylTop, vinylSide])); vinyl.position.y = 0.235; g.add(vinyl)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.56, 0.035, 12, 96), makeNeon(s < 0 ? 'a' : 'b', 3)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; g.add(ring)
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 12), chrome); spindle.position.y = 0.3; g.add(spindle)
    // тонарм
    const arm = new THREE.Group(); arm.position.set(s * 1.65, 0.3, -1.25); g.add(arm)
    const aBase = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.16, 24), chrome)); arm.add(aBase)
    const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 12), chrome)); tube.rotation.z = Math.PI / 2; tube.position.x = -s * 0.7; arm.add(tube)
    const head = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.13), plastic)); head.position.set(-s * 1.4, -0.02, 0); arm.add(head)
    const cw = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 16), chrome)); cw.rotation.z = Math.PI / 2; cw.position.x = s * 0.25; arm.add(cw)
    decks.push({ vinyl, arm, ring, s, angle: -0.35 })
}
buildDeck(-3.9, -1)
buildDeck(3.9, 1)

/* ---------- 32 3D-стовпчики еквалайзера (InstancedMesh) ---------- */
const BARS = 32
const barGeo = new THREE.BoxGeometry(0.26, 1, 0.26); barGeo.translate(0, 0.5, 0)
const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), BARS)
bars.frustumCulled = false
bars.setColorAt(0, new THREE.Color())
scene.add(bars)
const backSlab = shadowed(new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.7, 0.4), glossy)); backSlab.position.set(0, TOP + 0.35, -2.7); scene.add(backSlab)

/* ---------- П'єдестали + складні об'єкти ---------- */
const buildPedestal = (x) => {
    const p = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 1.2, 48), metal)); p.position.set(x, 0.6, -0.5); scene.add(p)
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.04, 12, 64), makeNeon('b', 3)); r.rotation.x = Math.PI / 2; r.position.set(x, 1.21, -0.5); scene.add(r)
}
buildPedestal(-9.5); buildPedestal(9.5)

// Навушники (процедурна деталізована модель)
const headphones = new THREE.Group()
const hpMat = new THREE.MeshStandardMaterial({ color: '#1b1c26', metalness: 0.85, roughness: 0.28 })
const cushionMat = new THREE.MeshStandardMaterial({ color: '#0d0d12', roughness: 0.9 })
const hpGlow = makeNeon('a', 3)
headphones.add(shadowed(new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 16, 64, Math.PI), hpMat)))
;[-1, 1].forEach((s) => {
    const cup = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.34, 40), hpMat)); cup.rotation.z = Math.PI / 2; cup.position.set(s * 1.0, -0.05, 0)
    const cushion = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 16, 36), cushionMat)); cushion.rotation.y = Math.PI / 2; cushion.position.set(s * 0.8, -0.05, 0)
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 12, 48), hpGlow); glow.rotation.y = Math.PI / 2; glow.position.set(s * 1.2, -0.05, 0)
    const yoke = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 12), chrome)); yoke.position.set(s * 1.0, 0.18, 0)
    headphones.add(cup, cushion, glow, yoke)
})
headphones.scale.setScalar(1.5)
headphones.position.set(-9.5, 2.3, -0.5)
scene.add(headphones)

// GLTF шолом (Khronos glTF Sample Assets: DamagedHelmet) — спершу локально, потім CDN
const gltfLoader = new GLTFLoader()
const helmetUrls = [
    './models/DamagedHelmet.glb',
    'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
    'https://threejs.org/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf'
]
let helmet = null
const loadHelmet = async () => {
    for (const url of helmetUrls) {
        try {
            const gltf = await gltfLoader.loadAsync(url)
            helmet = gltf.scene
            helmet.scale.setScalar(1.15)
            helmet.position.set(9.5, 2.55, -0.5)
            helmet.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.material.envMapIntensity = 1.6 } })
            scene.add(helmet)
            return true
        } catch (e) { /* пробуємо наступне джерело */ }
    }
    return false
}

/* ============================================================
   9. МІСТО-ЕКВАЛАЙЗЕР (InstancedMesh): висота будинків = гучність частоти
   ============================================================ */
const CITY = 240
const cityMat = new THREE.MeshStandardMaterial({ map: windowsTex, emissiveMap: windowsTex, emissive: '#ffffff', emissiveIntensity: 1.3, roughness: 0.75, metalness: 0.3 })
const cityGeo = new THREE.BoxGeometry(1, 1, 1); cityGeo.translate(0, 0.5, 0)
const city = new THREE.InstancedMesh(cityGeo, cityMat, CITY)
const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), CITY)
city.frustumCulled = caps.frustumCulled = false
const bd = []
for (let i = 0; i < CITY; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 26 + Math.pow(Math.random(), 1.3) * 62
    const u = Math.abs(a - Math.PI) / Math.PI
    bd.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w: 2 + Math.random() * 3.5, d: 2 + Math.random() * 3.5, h: 6 + Math.random() * 26, bin: Math.min(63, Math.floor(u * 52)) })
    const tint = new THREE.Color().setHSL(0.6 + Math.random() * 0.25, 0.4, 0.55)
    city.setColorAt(i, tint)
}
scene.add(city, caps)

/* ============================================================
   10. BASS PIT: скляний лоток з фізичними кубиками/кулями
   ============================================================ */
const PIT = { x: 0, z: 8.7, hw: 6, hd: 2.1, h: 1.3 }
const glass = new THREE.MeshPhysicalMaterial({ color: '#8fe9ff', transparent: true, opacity: 0.14, roughness: 0.02, metalness: 0, clearcoat: 1, depthWrite: false })
const pitPlateMat = makeNeon('b', 0.6)
const pitPlate = new THREE.Mesh(new THREE.BoxGeometry(PIT.hw * 2, 0.04, PIT.hd * 2), pitPlateMat); pitPlate.position.set(PIT.x, 0.02, PIT.z); scene.add(pitPlate)
;[[PIT.hw * 2 + 0.2, 0.1, 0, PIT.hd], [PIT.hw * 2 + 0.2, 0.1, 0, -PIT.hd], [0.1, PIT.hd * 2, PIT.hw, 0], [0.1, PIT.hd * 2, -PIT.hw, 0]].forEach(([w, d, ox, oz]) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, PIT.h, d), glass); wall.position.set(PIT.x + ox, PIT.h / 2, PIT.z + oz); scene.add(wall)
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.06, d + 0.04), makeNeon('a', 3)); rim.position.set(PIT.x + ox, PIT.h, PIT.z + oz); scene.add(rim)
    addStaticBox(w / 2, PIT.h / 2 + 0.4, d / 2, PIT.x + ox, PIT.h / 2, PIT.z + oz)
})
addStaticBox(PIT.hw, 0.2, PIT.hd, PIT.x, 3.2, PIT.z) // невидима стеля, щоб кубики не вилітали

const pitObjects = []
const pitMeshes = []
const boxGeo = new THREE.BoxGeometry(1, 1, 1)
const sphereGeo = new THREE.SphereGeometry(1, 28, 18)
const pitColors = ['#ff2bd0', '#00e5ff', '#ffb02e', '#7b5cff', '#3dff9a']
const pitMats = pitColors.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.5 }))

const spawnPit = (count = 1, fromAbove = false) => {
    for (let i = 0; i < count; i++) {
        const isBox = Math.random() > 0.5
        const size = 0.22 + Math.random() * 0.18
        const mesh = new THREE.Mesh(isBox ? boxGeo : sphereGeo, pitMats[Math.floor(Math.random() * pitMats.length)])
        mesh.scale.setScalar(isBox ? size * 2 : size)
        shadowed(mesh); scene.add(mesh)
        const shape = isBox ? new CANNON.Box(new CANNON.Vec3(size, size, size)) : new CANNON.Sphere(size)
        const body = new CANNON.Body({ mass: 0.3, shape, material: physMat, linearDamping: 0.05, angularDamping: 0.1 })
        body.position.set(PIT.x + (Math.random() - 0.5) * (PIT.hw * 2 - 1), fromAbove ? 2.4 + Math.random() : 0.4 + Math.random() * 0.8, PIT.z + (Math.random() - 0.5) * (PIT.hd * 2 - 1))
        world.addBody(body)
        pitObjects.push({ mesh, body }); pitMeshes.push(mesh)
        if (pitObjects.length > 90) { const o = pitObjects.shift(); pitMeshes.shift(); scene.remove(o.mesh); world.removeBody(o.body) }
    }
}
const clearPit = () => { pitObjects.splice(0).forEach((o) => { scene.remove(o.mesh); world.removeBody(o.body) }); pitMeshes.length = 0 }
spawnPit(36)

const kickPit = (bass) => {
    const power = params.beatPower
    for (const o of pitObjects) {
        if (o.body.position.y < 1.0) {
            o.body.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * 0.7 * power, (0.9 + Math.random() * 0.8) * (0.6 + bass) * power, (Math.random() - 0.5) * 0.7 * power))
        }
    }
}

/* ============================================================
   11. АУДІО-ДВИЖОК (HTMLAudio + Web Audio: EQ, фільтр, pan, аналізатор)
   ============================================================ */
const audioEl = new Audio()
audioEl.preload = 'auto'
const audio = { ctx: null, analyser: null, low: null, mid: null, high: null, lp: null, pan: null, gain: null }

const toastEl = document.getElementById('toast')
let toastTimer = 0
const toast = (msg, ms = 4500) => {
    toastEl.textContent = msg; toastEl.classList.add('show')
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms)
}

const initAudio = () => {
    if (audio.ctx) return
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const src = ctx.createMediaElementSource(audioEl)
    audio.low = ctx.createBiquadFilter(); audio.low.type = 'lowshelf'; audio.low.frequency.value = 200
    audio.mid = ctx.createBiquadFilter(); audio.mid.type = 'peaking'; audio.mid.frequency.value = 1200; audio.mid.Q.value = 0.9
    audio.high = ctx.createBiquadFilter(); audio.high.type = 'highshelf'; audio.high.frequency.value = 4500
    audio.lp = ctx.createBiquadFilter(); audio.lp.type = 'lowpass'; audio.lp.frequency.value = 20000
    audio.pan = ctx.createStereoPanner()
    audio.analyser = ctx.createAnalyser(); audio.analyser.fftSize = 256; audio.analyser.smoothingTimeConstant = 0.78
    audio.gain = ctx.createGain()
    src.connect(audio.low); audio.low.connect(audio.mid); audio.mid.connect(audio.high); audio.high.connect(audio.lp)
    audio.lp.connect(audio.pan); audio.pan.connect(audio.analyser); audio.analyser.connect(audio.gain); audio.gain.connect(ctx.destination)
    audio.ctx = ctx
    applyUI()
}

let lastHue = -1
const applyUI = () => {
    if (audio.ctx) {
        audio.low.gain.value = (ui.bass - 0.5) * 24
        audio.mid.gain.value = (ui.mid - 0.5) * 20
        audio.high.gain.value = (ui.treble - 0.5) * 24
        audio.lp.frequency.value = 200 * Math.pow(100, ui.filter)
        audio.pan.pan.value = (ui.pan - 0.5) * 2
        audio.gain.gain.value = Math.pow(ui.vol, 1.5)
    }
    const rate = 0.75 + ui.speed * 0.5
    audioEl.defaultPlaybackRate = rate; audioEl.playbackRate = rate
    audioEl.preservesPitch = false; audioEl.mozPreservesPitch = false; audioEl.webkitPreservesPitch = false
    bloomBase = 0.35 + ui.glow * 1.5
    if (ui.hue !== lastHue) { lastHue = ui.hue; recolor() }
}

const playAudio = async () => {
    try {
        initAudio()
        await audio.ctx.resume()
        await audioEl.play()
    } catch (err) {
        console.warn(err)
        toast('Не вдалося відтворити трек. Перевір файли в static/sounds та відкрий консоль (F12).')
    }
}
const togglePlay = () => { if (audioEl.paused) playAudio(); else audioEl.pause() }
const loadTrack = (i, autoplay = true) => {
    trackState.track = (i + tracks.length) % tracks.length
    audioEl.src = `./sounds/${tracks[trackState.track].file}`
    audioEl.load()
    applyUI()
    drawNowPlaying()
    if (autoplay) playAudio()
}
const nextTrack = (d) => loadTrack(trackState.track + d, true)
audioEl.addEventListener('ended', () => nextTrack(1))
audioEl.addEventListener('error', () => toast(`Файл не знайдено: sounds/${tracks[trackState.track].file} — перевір папку static/sounds`))

/* ---------- Аналіз спектра та детектор біту ---------- */
const freq = new Uint8Array(128)
const spec = new Float32Array(64)
const edges = Array.from({ length: 65 }, (_, k) => Math.min(127, Math.floor(Math.pow(k / 64, 2) * 110) + (k > 0 ? 1 : 0)))
let level = 0, bass = 0, avgBass = 0.3, pulse = 0, lastBeat = 0
const updateSpectrum = (dt, now) => {
    if (audio.analyser && !audioEl.paused) audio.analyser.getByteFrequencyData(freq); else freq.fill(0)
    let sum = 0
    for (let k = 0; k < 64; k++) {
        const s0 = edges[k], s1 = Math.max(edges[k + 1], s0 + 1)
        let s = 0
        for (let b = s0; b < s1; b++) s += freq[b]
        const v = Math.pow(s / (s1 - s0) / 255, 1.4) * 1.25
        spec[k] = v > spec[k] ? v : Math.max(0, spec[k] - dt * 1.6)
        specData[k] = Math.min(255, spec[k] * 255)
        sum += spec[k]
    }
    specTex.needsUpdate = true
    level = sum / 64
    bass = (freq[0] + freq[1] + freq[2] + freq[3]) / (4 * 255)
    avgBass += (bass - avgBass) * Math.min(1, dt * 1.5)
    pulse = Math.max(0, pulse - dt * 3.5)
    if (bass > 0.5 && bass > avgBass * 1.15 && now - lastBeat > 0.24) {
        lastBeat = now; pulse = 1; kickPit(bass)
    }
}

/* ============================================================
   12. ВЗАЄМОДІЯ: миша (кнопки, фейдери, крутилки, поштовх кубиків) + клавіатура
   ============================================================ */
const ray = new THREE.Raycaster()
const ptr = new THREE.Vector2()
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP)
const hitPt = new THREE.Vector3()
let drag = null, started = false
const setPtr = (e) => { ptr.set((e.clientX / sizes.width) * 2 - 1, -(e.clientY / sizes.height) * 2 + 1); ray.setFromCamera(ptr, camera) }
const clamp01 = (v) => Math.min(1, Math.max(0, v))

canvas.addEventListener('pointerdown', (e) => {
    if (!started) return
    setPtr(e)
    const hit = ray.intersectObjects(interactives, false)[0]
    if (hit) {
        const ctl = hit.object.userData.ctl
        if (ctl.kind === 'btn' || ctl.kind === 'pad') { hit.object.userData.press = 1; ctl.action() }
        else { drag = { ctl, y: e.clientY }; controls.enabled = false; canvas.setPointerCapture(e.pointerId) }
        return
    }
    const pit = ray.intersectObjects(pitMeshes, false)[0]
    if (pit) {
        const o = pitObjects.find((x) => x.mesh === pit.object)
        if (o) o.body.applyImpulse(new CANNON.Vec3(ray.ray.direction.x * 2, 2.5, ray.ray.direction.z * 2))
    }
})
canvas.addEventListener('pointermove', (e) => {
    setPtr(e)
    if (!drag) { canvas.style.cursor = started && ray.intersectObjects(interactives, false).length ? 'pointer' : 'default'; return }
    const { ctl } = drag
    if (ctl.kind === 'fader') {
        if (ray.ray.intersectPlane(dragPlane, hitPt)) {
            const p = ctl.axis === 'z' ? hitPt.z : hitPt.x
            ui[ctl.key] = clamp01((p - ctl.a) / (ctl.b - ctl.a))
        }
    } else if (ctl.kind === 'knob') {
        ui[ctl.key] = clamp01(ui[ctl.key] - (e.clientY - drag.y) / 180)
        drag.y = e.clientY
    }
    applyUI()
})
const endDrag = () => { if (drag) { drag = null; controls.enabled = introT >= 1 } }
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)

window.addEventListener('keydown', (e) => {
    if (!started || e.repeat) return
    if (e.code === 'Space') { e.preventDefault(); togglePlay() }
    else if (e.code === 'ArrowRight') nextTrack(1)
    else if (e.code === 'ArrowLeft') nextTrack(-1)
    else if (e.code === 'KeyB') spawnPit(12, true)
    else if (/^Digit[1-6]$/.test(e.code)) loadTrack(Number(e.code.slice(5)) - 1, true)
})

/* ============================================================
   13. GUI (lil-gui)
   ============================================================ */
const gui = new GUI({ title: 'DJ Panel' })
const fPlay = gui.addFolder('Плеєр')
fPlay.add(trackState, 'track', Object.fromEntries(tracks.map((t, i) => [`${i + 1}. ${t.title}`, i]))).name('Трек').onChange((v) => loadTrack(Number(v), true)).listen()
fPlay.add({ f: () => togglePlay() }, 'f').name('▶ / ⏸ Play / Pause')
fPlay.add({ f: () => nextTrack(-1) }, 'f').name('⏮ Попередній')
fPlay.add({ f: () => nextTrack(1) }, 'f').name('⏭ Наступний')
const fSound = gui.addFolder('Мікшер')
;[['vol', 'Гучність'], ['bass', 'Bass'], ['mid', 'Mid'], ['treble', 'Treble'], ['pan', 'Баланс L/R'], ['filter', 'Filter (low-pass)'], ['speed', 'Швидкість / pitch']].forEach(([k, n]) => fSound.add(ui, k, 0, 1, 0.01).name(n).onChange(applyUI).listen())
const fRender = gui.addFolder('Рендер')
fRender.add(ui, 'glow', 0, 1, 0.01).name('Bloom (glow)').onChange(applyUI).listen()
fRender.add(renderer, 'toneMappingExposure', 0.3, 2, 0.01).name('Експозиція')
fRender.add(scene.fog, 'density', 0, 0.04, 0.001).name('Туман')
fRender.add(ui, 'hue', 0, 1, 0.01).name('Колір неону (hue)').onChange(applyUI).listen()
const fLight = gui.addFolder('Світло')
fLight.add(dirLight, 'intensity', 0, 4, 0.01).name('Напрямне')
fLight.add(spot, 'intensity', 0, 600, 1).name('Прожектор')
fLight.add(params, 'strobe').name('Стробоскоп на біт')
const fPhys = gui.addFolder('Фізика')
fPhys.add({ f: () => spawnPit(12, true) }, 'f').name('Скинути 12 фігур (DROP)')
fPhys.add({ f: clearPit }, 'f').name('Очистити лоток')
fPhys.add(params, 'beatPower', 0, 2, 0.05).name('Сила удару від баса')
fPhys.add(world.gravity, 'y', -20, 0, 0.1).name('Гравітація')

/* ============================================================
   14. СТАРТ, АНІМАЦІЯ, ГОЛОВНИЙ ЦИКЛ
   ============================================================ */
const overlay = document.getElementById('overlay')
const startBtn = document.getElementById('startBtn')
const statusEl = document.getElementById('status')
let introT = -1

loadHelmet().then((ok) => {
    statusEl.textContent = ok ? 'Готово' : 'Шолом не завантажився (перевір інтернет або поклади DamagedHelmet.glb у static/models) — решта працює'
    startBtn.disabled = false
})
startBtn.addEventListener('click', () => {
    overlay.classList.add('hidden')
    started = true; introT = 0
    initAudio()
    loadTrack(0, true) // клік = жест користувача, тож браузер дозволяє звук
})

const dummy = new THREE.Object3D()
const tmpColor = new THREE.Color()
const clock = new THREE.Clock()
let npTimer = 0

const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05)
    const t = clock.elapsedTime

    updateSpectrum(dt, t)

    // фізика → меші
    world.step(1 / 60, dt, 3)
    for (const o of pitObjects) {
        const p = o.body.position
        if (p.y < -1 || Math.abs(p.x - PIT.x) > PIT.hw + 0.5 || Math.abs(p.z - PIT.z) > PIT.hd + 0.5) { o.body.position.set(PIT.x, 1, PIT.z); o.body.velocity.set(0, 0, 0) }
        o.mesh.position.copy(p); o.mesh.quaternion.copy(o.body.quaternion)
    }

    // згладжені значення регуляторів → 3D
    const k = Math.min(1, dt * 14)
    for (const key in vis) vis[key] += (ui[key] - vis[key]) * k
    for (const f of faders) {
        const v = f.a + (f.b - f.a) * vis[f.key]
        if (f.axis === 'z') f.cap.position.z = v; else f.cap.position.x = v
    }
    for (const kn of knobs) kn.knob.rotation.y = -(-2.36 + vis[kn.key] * 4.71)
    for (const b of buttons) {
        const u = b.btn.userData; u.press = Math.max(0, u.press - dt * 5)
        b.btn.position.y = b.baseY - u.press * 0.07
        b.mat.emissiveIntensity = 0.5 + u.press * 3 + (b.btn === buttons[1].btn && !audioEl.paused ? 1.2 : 0)
    }
    for (const p of pads) {
        const u = p.pad.userData; u.press = Math.max(0, u.press - dt * 5)
        p.pad.position.y = p.baseY - u.press * 0.05
        p.mat.emissiveIntensity = (p.index === trackState.track ? 3.2 + pulse * 2 : 0.4) + u.press * 2
    }

    // вертушки: платівка крутиться зі швидкістю відтворення, тонарм опускається
    const playing = !audioEl.paused
    for (const d of decks) {
        if (playing) d.vinyl.rotation.y -= dt * (3.5 * audioEl.playbackRate + pulse * 1.5)
        d.angle += ((playing ? 0.12 : -0.35) - d.angle) * Math.min(1, dt * 2.5)
        d.arm.rotation.y = d.s * d.angle
        d.ring.material.emissiveIntensity = 2 + pulse * 5
    }

    // 3D-еквалайзер на пульті
    for (let i = 0; i < BARS; i++) {
        const v = (spec[i * 2] + spec[i * 2 + 1]) * 0.5
        dummy.position.set(-5.115 + i * 0.33, TOP, -2.3)
        dummy.scale.set(1, 0.06 + v * 1.9, 1)
        dummy.updateMatrix(); bars.setMatrixAt(i, dummy.matrix)
        tmpColor.copy(neon.a).lerp(neon.b, i / (BARS - 1)).multiplyScalar(0.8 + v * 2.2)
        bars.setColorAt(i, tmpColor)
    }
    bars.instanceMatrix.needsUpdate = true; bars.instanceColor.needsUpdate = true

    // місто-еквалайзер
    for (let i = 0; i < CITY; i++) {
        const b = bd[i]
        const v = spec[b.bin]
        const h = b.h * (0.5 + v * 1.4 + pulse * 0.12)
        dummy.position.set(b.x, -0.45, b.z); dummy.scale.set(b.w, h, b.d); dummy.updateMatrix(); city.setMatrixAt(i, dummy.matrix)
        dummy.position.set(b.x, -0.45 + h + 0.06, b.z); dummy.scale.set(b.w * 1.03, 0.14, b.d * 1.03); dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix)
        tmpColor.copy(neon.a).lerp(neon.b, v).multiplyScalar(0.7 + v * 2.8); caps.setColorAt(i, tmpColor)
    }
    city.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true
    if (city.instanceColor) city.instanceColor.needsUpdate = true
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true

    // об'єкти-герої
    headphones.rotation.y = t * 0.5
    headphones.position.y = 2.3 + Math.sin(t * 1.3) * 0.12
    hpGlow.emissiveIntensity = 2 + pulse * 6
    if (helmet) {
        helmet.rotation.y = -t * 0.45
        helmet.position.y = 2.55 + Math.sin(t * 1.1) * 0.12
        helmet.scale.setScalar(1.15 * (1 + pulse * 0.07))
    }

    // світло й рендер реагують на музику
    lightA.intensity = 55 + level * 120 + pulse * 60
    lightB.intensity = 55 + level * 120 + pulse * 60
    flash.intensity = params.strobe ? pulse * 90 : 0
    bloom.strength = bloomBase + pulse * 0.5 + level * 0.4
    pitPlateMat.emissiveIntensity = 0.5 + pulse * 3 + level * 2

    // шейдери
    screenMat.uniforms.uTime.value = t; screenMat.uniforms.uBass.value = Math.min(1, bass + pulse * 0.4)
    gridMat.uniforms.uTime.value = t; gridMat.uniforms.uBass.value = Math.min(1, bass + pulse * 0.5)
    skyMat.uniforms.uTime.value = t

    // дисплей Now Playing
    npTimer += dt
    if (npTimer > 0.25) { npTimer = 0; drawNowPlaying() }

    // вступний проліт камери
    if (introT >= 0 && introT < 1) {
        introT = Math.min(introT + dt / 5, 1)
        const e = 1 - Math.pow(1 - introT, 3)
        camera.position.lerpVectors(introFrom, introTo, e)
        if (introT >= 1) controls.enabled = true
    }

    controls.update()
    composer.render()
    requestAnimationFrame(tick)
}

recolor()
applyUI()
drawNowPlaying()
tick()

window.addEventListener('resize', () => {
    sizes.width = window.innerWidth; sizes.height = window.innerHeight
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    composer.setSize(sizes.width, sizes.height)
})
