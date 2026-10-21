import { useEffect, useRef, useState } from 'react'

// Bennis Profilbild: schwebende Kugel wie bei den Feleo-Agenten, in den Olivtönen der Beautylounge.
// Gezeichnet per WebGL (24 Bilder/s, nur sichtbar und ohne „Bewegung reduzieren“), sonst ein ruhiger Verlauf.
const vertex = `attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`
const fragment = `
precision highp float;
varying vec2 uv;
uniform float time;
const float seed=.37;
const vec3 ice=vec3(.95,.957,.915); const vec3 deep=vec3(.32,.42,.22); const vec3 mid=vec3(.52,.63,.37); const vec3 light=vec3(.75,.815,.62);
const vec3 fres=vec3(.70,.76,.60); const vec3 brass=vec3(.30,.24,.14);
float hash(vec3 p){p=fract(p*.3183099+vec3(.17,.31,.47));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float cloud(vec3 p){float v=0.;float a=.55;for(int i=0;i<4;i++){v+=noise(p)*a;p=p*2.04+vec3(1.7,3.1,2.4);a*=.48;}return v;}
void main(){
 vec2 p=(uv-.5)*2.; float r=length(p); if(r>1.){gl_FragColor=vec4(0.);return;}
 float z=sqrt(max(0.,1.-r*r)); vec3 n=normalize(vec3(p,z)); float t=time*.14;
 float angle=(seed-.5)*1.45; mat2 rot=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
 vec2 q=rot*p; q+=vec2(sin(q.y*3.+t)*.09,cos(q.x*3.-t)*.08)*z;
 float volume=cloud(vec3(q*3.4,z*1.8+t+seed*12.));
 float drift=cloud(vec3(q*2.7+vec2(t*.3,-t*.17),z+seed*19.));
 float center=.25*sin(q.x*3.1+t+seed*6.)+.10*cos(q.x*6.-t*.6);
 float ribbon=exp(-pow((q.y-center)/(.19+.09*volume),2.))*(1.-smoothstep(.67,1.1,abs(q.x)));
 float lower=exp(-pow((q.y+center*.8+.28)/.26,2.));
 float pigment=smoothstep(.23,.78,volume*.7+ribbon*.62+lower*.15-q.y*.12);
 vec3 ink=mix(deep,mid,clamp(drift*1.4,0.,1.)); ink=mix(ink,light,smoothstep(.45,.9,q.x*.3+drift)*.7);
 vec3 col=mix(ice,ink,pigment*.94);
 float fold=exp(-pow((q.y-center-.12)/.053,2.))*ribbon;
 col=mix(col,mix(ice,vec3(1.),.4),fold*.57);
 float pearl=pow(max(0.,1.-abs(q.y+.23*sin(q.x*4.-t)))*volume,4.);
 col+=pearl*.24;
 float fresnel=pow(1.-z,3.);
 col=mix(col,fres,fresnel*.4);
 float rim=exp(-pow((r-.971)/.013,2.)); col=mix(col,mix(ice,vec3(1.),.6),rim*.86);
 float highlight=pow(max(dot(n,normalize(vec3(-.46,.64,1.))),0.),38.);
 col=mix(col,vec3(1.),highlight*.88);
 float shine=pow(max(dot(n,normalize(vec3(.78,-.28,.38))),0.),70.);
 col+=brass*shine*.7;
 float edgeShade=pow(max(dot(n,normalize(vec3(.48,-.72,.2))),0.),4.);
 col*=1.-edgeShade*.07;
 float alpha=1.-smoothstep(.985,1.,r);
 gl_FragColor=vec4(clamp(col,0.,1.),alpha);
}`

/** `working`: Marc arbeitet gerade, die Kugel bewegt sich schneller. `still`: einmal zeichnen, keine Bewegung. */
export function BenniOrb({ className = 'w-7 h-7', still = false, working = false }: { className?: string; still?: boolean; working?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const holder = useRef<HTMLSpanElement>(null)
  const motion = useRef({ still: still && !working, speed: working ? 2.6 : 1 })
  const reschedule = useRef<() => void>(() => {})
  const [inView, setInView] = useState(false)
  const [ready, setReady] = useState(false), [moving, setMoving] = useState(false), [epoch, setEpoch] = useState(0)
  useEffect(() => { motion.current = { still: still && !working, speed: working ? 2.6 : 1 }; reschedule.current() }, [still, working])
  useEffect(() => {
    const el = holder.current; if (!el) return
    const io = new IntersectionObserver(e => setInView(e[0]?.isIntersecting ?? false)); io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    const el = canvas.current
    if (!el || !inView) { setMoving(false); setReady(false); return }
    setReady(false)
    const gl = el.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' })
    if (!gl) return
    let frame = 0, lost = false, last = -Infinity, disposed = false
    const shaders: WebGLShader[] = []
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type); if (!s) throw new Error('shader'); shaders.push(s)
      gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader'); return s
    }
    let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null
    try {
      program = gl.createProgram(); if (!program) throw new Error('program')
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment))
      gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('program')
      gl.useProgram(program)
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
      const pos = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
      const clock = gl.getUniformLocation(program, 'time')
      const media = matchMedia('(prefers-reduced-motion: reduce)')
      const draw = (at: number) => {
        if (disposed || lost) return
        gl.viewport(0, 0, el.width, el.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
        gl.uniform1f(clock, at * 0.001 * motion.current.speed + 30); gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
      const loop = (at: number) => {
        if (disposed || lost || document.hidden || media.matches || motion.current.still) return
        if (at - last >= 1000 / 24) { draw(at); last = at }
        frame = requestAnimationFrame(loop)
      }
      const schedule = () => {
        cancelAnimationFrame(frame)
        const animate = !motion.current.still && !document.hidden && !media.matches && !lost
        setMoving(animate)
        if (animate) frame = requestAnimationFrame(loop); else if (!lost) draw(0)
      }
      const resize = () => {
        const w = el.getBoundingClientRect().width
        const px = Math.max(32, Math.min(420, Math.round(w * Math.min(devicePixelRatio || 1, 2))))
        el.width = px; el.height = px; draw(performance.now())
      }
      const ro = new ResizeObserver(resize); ro.observe(el)
      const onLost = (e: Event) => { e.preventDefault(); lost = true; cancelAnimationFrame(frame); setReady(false); setMoving(false) }
      const onRestored = () => setEpoch(v => v + 1)
      el.addEventListener('webglcontextlost', onLost); el.addEventListener('webglcontextrestored', onRestored)
      document.addEventListener('visibilitychange', schedule); media.addEventListener('change', schedule)
      resize(); setReady(true); reschedule.current = schedule; schedule()
      return () => {
        disposed = true; reschedule.current = () => {}; cancelAnimationFrame(frame); ro.disconnect()
        document.removeEventListener('visibilitychange', schedule); media.removeEventListener('change', schedule)
        el.removeEventListener('webglcontextlost', onLost); el.removeEventListener('webglcontextrestored', onRestored)
        gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(s => gl.deleteShader(s))
        queueMicrotask(() => { if (!el.isConnected) gl.getExtension('WEBGL_lose_context')?.loseContext() })
      }
    } catch {
      if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program); shaders.forEach(s => gl.deleteShader(s))
    }
  }, [epoch, inView])
  return (
    <span ref={holder} className={`benni-orb ${ready ? 'has-renderer' : ''} ${className}`} data-motion={moving} aria-hidden="true">
      <span className="orb-shadow" />
      <span className="orb-float"><span className="orb-fallback" /><canvas ref={canvas} key={inView ? 'on' : 'off'} /></span>
    </span>
  )
}

// Standbild der Kugel für Listen (z. B. jede Marc-Nachricht): einmal zeichnen, als Bild wiederverwenden.
// Browser erlauben nur rund 16 WebGL-Kontexte, eine lebende Kugel pro Nachricht wäre zu viel.
let still: Promise<string | null> | null = null
export function orbImage(): Promise<string | null> {
  still ??= new Promise(resolve => {
    try {
      const el = document.createElement('canvas'); el.width = el.height = 112
      const gl = el.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true })
      if (!gl) return resolve(null)
      const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
      const p = gl.createProgram()!
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vertex)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(p)
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return resolve(null)
      gl.useProgram(p)
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
      const pos = gl.getAttribLocation(p, 'position'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
      gl.viewport(0, 0, 112, 112); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(gl.getUniformLocation(p, 'time'), 30); gl.drawArrays(gl.TRIANGLES, 0, 6)
      const url = el.toDataURL('image/png')
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      resolve(url)
    } catch { resolve(null) }
  })
  return still
}

/** Marc als kleines, ruhiges Profilbild (ohne eigenen WebGL-Kontext). */
export function BenniAvatar({ className = 'w-7 h-7' }: { className?: string }) {
  return <img src="/benni.jpg" alt="" aria-hidden="true" className={`rounded-full shrink-0 object-cover bg-sage-100 ${className}`} />
}

