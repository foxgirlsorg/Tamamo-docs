<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'

const img = (p: string) => withBase(p)

/* ---------- live proof of work ---------- */
const examples = ['shop.example.com', 'blog.example.com', 'my-homelab.lan']
const challenge = ref('example.com')
const difficulty = ref(4)
const state = ref<'idle' | 'running' | 'done' | 'error'>('idle')
const hashes = ref(0)
const elapsed = ref(0)
const nonce = ref('')
const hash = ref('')
const errorText = ref('')
let worker: Worker | null = null
let started = 0
let timer = 0

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n))
const expected = computed(() => fmt(16 ** difficulty.value))
const speed = computed(() => {
  if (elapsed.value <= 0) return '–'
  const hps = hashes.value / (elapsed.value / 1000)
  return hps >= 1e6 ? `${(hps / 1e6).toFixed(2)} MH/s` : `${Math.round(hps / 1000)} kH/s`
})
const seconds = computed(() => `${(elapsed.value / 1000).toFixed(2)} s`)
const zeros = computed(() => hash.value.slice(0, difficulty.value))
const rest = computed(() => hash.value.slice(difficulty.value))
const pose = computed(() => (state.value === 'done' ? 'success' : state.value === 'error' ? 'denied' : 'checking'))
const poseAlt = computed(
  () =>
    ({
      checking: 'The Tamamo mascot looking through a magnifying glass',
      success: 'The Tamamo mascot with a green tick in a speech bubble',
      denied: 'The Tamamo mascot with a red cross in a speech bubble',
    })[pose.value],
)

function stop() {
  if (worker) worker.terminate()
  worker = null
  cancelAnimationFrame(timer)
}

function run() {
  stop()
  const text = challenge.value.trim() || 'example.com'
  state.value = 'running'
  hashes.value = 0
  elapsed.value = 0
  nonce.value = ''
  hash.value = ''
  started = performance.now()
  const tick = () => {
    elapsed.value = performance.now() - started
    if (state.value === 'running') timer = requestAnimationFrame(tick)
  }
  timer = requestAnimationFrame(tick)
  try {
    worker = new Worker(withBase('/home/pow-worker.js'))
  } catch (e) {
    state.value = 'error'
    errorText.value = 'This browser blocked the worker.'
    return
  }
  worker.onmessage = (ev: MessageEvent) => {
    const m = ev.data || {}
    if (m.type === 'progress') hashes.value += m.hashes
    if (m.type === 'found') {
      hashes.value += m.hashes
      elapsed.value = performance.now() - started
      nonce.value = m.nonce
      hash.value = m.hash
      state.value = 'done'
      stop()
    }
    if (m.type === 'error') {
      state.value = 'error'
      errorText.value = m.message
      stop()
    }
  }
  worker.postMessage({ random: text, difficulty: difficulty.value, start: 0, step: 1 })
}

function useExample(e: string) {
  challenge.value = e
  run()
}
function setDifficulty(d: number) {
  difficulty.value = d
  run()
}

/* ---------- stages slider ---------- */
const stages = [
  { name: 'Request', clause: 'First, a request comes in' },
  { name: 'Rules', clause: 'Then the rules decide' },
  { name: 'Puzzle', clause: 'Next, the browser does the work' },
  { name: 'Pass', clause: 'Finally, a pass for seven days' },
]
const stage = ref(0)

/* ---------- reveal + autoplay ---------- */
const root = ref<HTMLElement | null>(null)
const tryEl = ref<HTMLElement | null>(null)
let io: IntersectionObserver | null = null
let tryIo: IntersectionObserver | null = null

/* footer wordmark: scale the name to exactly fill the footer width */
const markEl = ref<HTMLElement | null>(null)
const markText = ref<HTMLElement | null>(null)
let ro: ResizeObserver | null = null
function fitMark() {
  const box = markEl.value
  const text = markText.value
  if (!box || !text) return
  box.style.fontSize = '100px'
  const w = text.getBoundingClientRect().width
  if (w > 0) box.style.fontSize = `${(100 * box.clientWidth) / w}px`
}

onMounted(() => {
  const el = root.value
  if (!el) return
  el.classList.add('is-js')
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in')
          io?.unobserve(e.target)
        }
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  )
  el.querySelectorAll('[data-reveal]').forEach((n) => io!.observe(n))
  tryIo = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      run()
      tryIo?.disconnect()
    }
  })
  if (tryEl.value) tryIo.observe(tryEl.value)
  if (markEl.value) {
    ro = new ResizeObserver(fitMark)
    ro.observe(markEl.value)
    document.fonts?.ready.then(fitMark)
  }
})
onBeforeUnmount(() => {
  ro?.disconnect()
  stop()
  io?.disconnect()
  tryIo?.disconnect()
})
</script>

<template>
  <div ref="root" class="th">
    <!-- Hero -->
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-main">
        <h1 id="hero-title" class="hero-title" aria-label="Tamamo keeps bots out">
          <span class="hero-line hero-name" aria-hidden="true">Tamamo</span>
          <span class="hero-line" aria-hidden="true">keeps bots out.</span>
        </h1>
        <img
          class="hero-mascot"
          :src="img('/home/mascot-denied.webp')"
          alt="The Tamamo mascot, a fox girl, holding up a red cross"
          width="806"
          height="900"
          fetchpriority="high"
        />
      </div>
      <div class="hero-foot">
        <p class="hero-lede">
          A self-hosted reverse proxy that asks each browser to solve a small proof-of-work puzzle before it reaches your
          site. People wait well under a second. Scrapers that won't do the work stay outside.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" :href="img('/guide/installation')">Install Tamamo</a>
          <a class="btn btn-quiet" href="#try">Try the check</a>
        </div>
      </div>
    </section>

    <!-- Live proof of work -->
    <section id="try" ref="tryEl" class="try" aria-labelledby="try-title">
      <div class="try-text">
        <h2 id="try-title" class="h2" data-reveal>Try the check yourself</h2>
        <p class="body" data-reveal>
          Your browser is about to run the same worker Tamamo sends to visitors. It hashes the text below with a
          counter until the SHA-256 hash starts with enough zeros. Change the text and it starts again.
        </p>
        <label class="sr-only" for="pow-input">Text to hash</label>
        <div class="pow-line" data-ui data-reveal>
          <input
            id="pow-input"
            v-model="challenge"
            class="pow-input"
            spellcheck="false"
            autocomplete="off"
            maxlength="48"
            @keydown.enter="run"
            @change="run"
          />
        </div>
        <div class="examples" data-reveal>
          <button v-for="e in examples" :key="e" type="button" class="example" @click="useExample(e)">{{ e }}</button>
        </div>
      </div>

      <div class="pow-card" data-ui data-reveal aria-live="polite">
        <div class="pow-top">
          <img
            class="pow-mascot"
            :src="img(`/home/mascot-${pose}.webp`)"
            :alt="poseAlt"
            width="320"
            height="356"
            :key="pose"
          />
          <div>
            <p class="pow-status">
              <template v-if="state === 'done'">Solved. You're in.</template>
              <template v-else-if="state === 'error'">Something stopped the check.</template>
              <template v-else>Checking your browser…</template>
            </p>
            <p class="small">
              About {{ expected }} tries on average at difficulty {{ difficulty }}. Tamamo checks the answer with one.
            </p>
          </div>
        </div>

        <div class="seg" role="group" aria-labelledby="seg-label">
          <span id="seg-label" class="seg-label">Difficulty</span>
          <button
            v-for="d in [3, 4, 5, 6]"
            :key="d"
            type="button"
            class="seg-btn"
            :aria-pressed="difficulty === d"
            @click="setDifficulty(d)"
          >
            {{ d }}
          </button>
        </div>

        <dl class="pow-stats">
          <div><dt>Hashes</dt><dd>{{ fmt(hashes) }}</dd></div>
          <div><dt>Time</dt><dd>{{ seconds }}</dd></div>
          <div><dt>Speed</dt><dd>{{ speed }}</dd></div>
          <div><dt>Answer</dt><dd>{{ nonce || '…' }}</dd></div>
        </dl>

        <p class="pow-hash">
          <code v-if="hash"><span class="zeros">{{ zeros }}</span>{{ rest }}</code>
          <code v-else-if="state === 'error'">{{ errorText }}</code>
          <code v-else class="pending">sha256("{{ challenge || 'example.com' }}" + counter)</code>
        </p>

        <button type="button" class="btn btn-primary btn-block" @click="run">
          {{ state === 'running' ? 'Restart' : 'Run it again' }}
        </button>
      </div>
    </section>

    <!-- What visitors see -->
    <section class="see" aria-labelledby="see-title">
      <div class="see-head">
        <h2 id="see-title" class="h2" data-reveal>All a visitor sees</h2>
        <p class="body" data-reveal>
          A real recording of Tamamo in front of a test site. The page is yours to design: texts in any language,
          colours, layout and your own pictures. The <strong>Protected by Tamamo</strong> line stays.
        </p>
      </div>
      <figure class="see-frame shutter" data-reveal>
        <video
          class="see-video"
          :poster="img('/home/checking-poster.webp')"
          autoplay
          muted
          loop
          playsinline
          preload="metadata"
          width="2000"
          height="1360"
          aria-label="Recording of the checking page: the mascot checks the browser, then the page turns green and says All good, you're in"
        >
          <source :src="img('/home/checking.webm')" type="video/webm" />
          <source :src="img('/home/checking.mp4')" type="video/mp4" />
        </video>
      </figure>
    </section>

    <!-- How it works -->
    <section class="how" aria-labelledby="how-title">
      <h2 id="how-title" class="sr-only">How a request goes through Tamamo</h2>
      <div class="how-fields">
        <div class="how-clause">
          <Transition name="swap" mode="out-in">
            <p :key="stage" class="clause">{{ stages[stage].clause }}</p>
          </Transition>
          <Transition name="swap" mode="out-in">
            <p :key="stage" class="body how-note">
              <template v-if="stage === 0"
                >Visitors connect to port 8923, usually behind nginx, Caddy or Traefik. Tamamo reads the host, path,
                user agent and IP address.</template
              >
              <template v-else-if="stage === 1"
                >Bypass headers, the rate limit, webhooks and modules run first. Then rules run top to bottom and the
                first match picks allow, challenge or block.</template
              >
              <template v-else-if="stage === 2"
                >The checking page gives the browser a puzzle. Each difficulty step makes it about 16 times harder;
                the default of 4 takes a phone well under a second.</template
              >
              <template v-else
                >Tamamo sets a signed pass cookie and forwards the request. Your site never sees the check, and later
                requests go straight through.</template
              >
            </p>
          </Transition>
        </div>

        <div class="how-stage" data-ui>
          <Transition name="swap" mode="out-in">
            <div v-if="stage === 0" key="0" class="frag req">
              <p class="req-line"><span class="verb">GET</span> /products</p>
              <dl class="kv">
                <div><dt>Host</dt><dd>shop.example.com</dd></div>
                <div><dt>From</dt><dd>203.0.113.42</dd></div>
                <div><dt>Browser</dt><dd>Firefox 132, Windows</dd></div>
                <div><dt>Pass cookie</dt><dd>none yet</dd></div>
              </dl>
            </div>
            <div v-else-if="stage === 1" key="1" class="frag acts">
              <div class="act">
                <img :src="img('/home/mascot-success.webp')" alt="Mascot with a green tick" width="200" height="259" />
                <p class="act-name">allow</p>
                <p class="small">Googlebot, link previews, /robots.txt</p>
              </div>
              <div class="act">
                <img :src="img('/home/mascot-checking.webp')" alt="Mascot with a magnifying glass" width="200" height="223" />
                <p class="act-name">challenge</p>
                <p class="small">Everyone else, by default</p>
              </div>
              <div class="act">
                <img :src="img('/home/mascot-denied.webp')" alt="Mascot with a red cross" width="200" height="223" />
                <p class="act-name">block</p>
                <p class="small">Scrapers you name, like AhrefsBot</p>
              </div>
            </div>
            <div v-else-if="stage === 2" key="2" class="frag work">
              <img :src="img('/home/mascot-checking.webp')" alt="Mascot with a magnifying glass" width="240" height="268" />
              <div class="work-card">
                <p class="work-title">Making sure you're not a bot</p>
                <div class="bar"><span /></div>
                <p class="small">Difficulty 4 · about 65,536 hashes · 0.4 s</p>
              </div>
            </div>
            <div v-else key="3" class="frag pass">
              <img :src="img('/home/mascot-success.webp')" alt="Mascot with a green tick" width="240" height="311" />
              <dl class="kv">
                <div><dt>Cookie</dt><dd>signed pass</dd></div>
                <div><dt>Expires</dt><dd>in 7 days</dd></div>
                <div><dt>Next request</dt><dd>straight to your site</dd></div>
              </dl>
            </div>
          </Transition>
        </div>
      </div>

      <div class="how-slider">
        <label class="sr-only" for="stage-range">Stage</label>
        <div class="track" :style="{ '--p': `${(stage / 3) * 100}%` }">
        <span class="track-fill" aria-hidden="true" />
        <input
          id="stage-range"
          v-model.number="stage"
          type="range"
          min="0"
          max="3"
          step="1"
          class="range"
          :aria-valuetext="stages[stage].name"
        />
        </div>
        <div class="stage-names">
          <button
            v-for="(s, i) in stages"
            :key="s.name"
            type="button"
            class="stage-name"
            :class="{ on: i === stage }"
            :aria-pressed="i === stage"
            @click="stage = i"
          >
            {{ s.name }}
          </button>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="feat" aria-labelledby="feat-title">
      <div class="feat-head">
        <h2 id="feat-title" class="h2" data-reveal>A web UI, if you want one</h2>
        <p class="body" data-reveal>
          The admin UI is a second, optional container. It edits the same settings file and never touches visitor
          traffic.
        </p>
      </div>

      <article class="row" data-reveal>
        <div class="row-text">
          <h3 class="h3">Design the checking page</h3>
          <p class="body">
            Texts in several languages, colours, layout, your own mascot or logo, and a live preview of every state:
            checking, success, denied and error.
          </p>
          <a class="more" :href="img('/config/checking-page')">Checking page settings</a>
        </div>
        <div class="shot w-lg"><img :src="img('/img/ui/page.webp')" alt="The checking page designer with a live preview" width="1800" height="1125" loading="lazy" /></div>
      </article>

      <article class="row" data-reveal>
        <div class="row-text">
          <h3 class="h3">Rules, read top to bottom</h3>
          <p class="body">
            Match on paths, hosts, user agents, headers or methods, with wildcards or regular expressions. The first
            match decides, and the tester tells you which rule a request would hit.
          </p>
          <a class="more" :href="img('/config/rules')">How rules work</a>
        </div>
        <div class="shot w-md"><img :src="img('/img/ui/rules.webp')" alt="The rules screen listing allow, challenge and block rules" width="1800" height="1125" loading="lazy" /></div>
      </article>

      <article class="row" data-reveal>
        <div class="row-text">
          <h3 class="h3">Many sites, one proxy</h3>
          <p class="body">
            Each site gets its own host names, upstream, difficulty, rules and checking page. Unknown hosts fall
            back to the default.
          </p>
          <a class="more" :href="img('/config/sites')">Sites</a>
        </div>
        <div class="shot w-lg"><img :src="img('/img/ui/sites.webp')" alt="The sites screen with several protected sites" width="1800" height="1125" loading="lazy" /></div>
      </article>

      <article class="row" data-reveal>
        <div class="row-text">
          <h3 class="h3">Modules in Go</h3>
          <p class="body">
            Compile your own checks, page content, endpoints and admin screens into Tamamo. The web UI builds each
            module's settings form from the fields it declares.
          </p>
          <a class="more" :href="img('/modules/')">Write a module</a>
        </div>
        <div class="shot w-md"><img :src="img('/img/ui/modules.webp')" alt="The modules screen with a running example module" width="1800" height="1125" loading="lazy" /></div>
      </article>

      <article class="row" data-reveal>
        <div class="row-text">
          <h3 class="h3">Statistics stay home</h3>
          <p class="body">
            Off by default. When on, counts go to a database on your server: requests, solved checks, blocks and how
            long people waited.
          </p>
          <a class="more" :href="img('/config/admin')">Web UI and statistics</a>
        </div>
        <div class="shot w-lg"><img :src="img('/img/ui/overview.webp')" alt="The overview screen with request charts for the last 24 hours" width="1800" height="1125" loading="lazy" /></div>
      </article>

      <article class="row" data-reveal>
        <div class="row-text">
          <h3 class="h3">Or skip the UI entirely</h3>
          <p class="body">
            Everything lives in one file, <code>tamamo.yaml</code>. Environment variables can override a field and
            lock it in the web UI.
          </p>
          <a class="more" :href="img('/config/full-example')">A full example</a>
        </div>
        <div class="shot w-md code-shot">
          <pre><code><span class="c"># data/tamamo.yaml</span>
<span class="k">server</span>:
  <span class="k">target</span>: http://app:80

<span class="k">rules</span>:
  - <span class="k">name</span>: Block SEO scrapers
    <span class="k">action</span>: block
    <span class="k">user_agents</span>: [<span class="s">'*AhrefsBot*'</span>]
  - <span class="k">name</span>: Check everyone else
    <span class="k">action</span>: challenge
    <span class="k">paths</span>: [<span class="s">'*'</span>]

<span class="k">sites</span>:
  - <span class="k">name</span>: Shop
    <span class="k">hosts</span>: [shop.example.com]
    <span class="k">protection</span>:
      <span class="k">difficulty</span>: 5</code></pre>
        </div>
      </article>
    </section>

    <!-- CTA -->
    <section class="cta" aria-labelledby="cta-title">
      <h2 id="cta-title" class="cta-title" data-reveal>People in. Bots out.</h2>
      <div class="cta-foot" data-reveal>
        <p class="cta-text">
          Two containers, or one if you skip the web UI. Point Tamamo at your site and put it behind your HTTPS proxy.
        </p>
        <a class="btn btn-primary btn-lg" :href="img('/guide/installation')">Installation guide</a>
      </div>
    </section>

    <!-- Footer -->
    <footer class="foot" aria-labelledby="foot-title">
      <div class="foot-top">
        <div>
          <h2 id="foot-title" class="foot-title">Open source, MIT licensed.</h2>
          <a class="btn btn-quiet" :href="img('/contributing')">Contribute</a>
        </div>
        <ul class="foot-links">
          <li><a href="https://github.com/foxgirlsorg/Tamamo">Tamamo on GitHub</a></li>
          <li><a href="https://github.com/foxgirlsorg/Tamamo-webui">Web UI on GitHub</a></li>
          <li><a :href="img('/guide/introduction')">Introduction</a></li>
          <li><a :href="img('/reference/troubleshooting')">Troubleshooting</a></li>
        </ul>
      </div>
      <div class="foot-legal">
        <p>© 2026 <a href="https://foxgirls.org">foxgirls.org</a> · MIT License</p>
        <p>Mascot art by <a href="https://t.me/tr1flu0r1d3_exe_art">tr1flu0r1d3.exe</a></p>
      </div>
      <p ref="markEl" class="foot-mark" aria-hidden="true"><span ref="markText">Tamamo</span></p>
    </footer>
  </div>
</template>

<style scoped>
.th {
  --bg: #09090b;
  --surface: #131316;
  --surface-2: #1c1c20;
  --surface-3: #27272a;
  --ink: #fafafa;
  --muted: #a1a1aa;
  --accent: #de6161;
  --accent-hover: #e57a7a;
  --action: #c44a4a;
  --action-hover: #b84545;
  --m: clamp(20px, 4vw, 64px);
  --r: 16px;
  --r-sm: 10px;
  --gap: 24px;
  --fs-display: clamp(52px, 9.6vw, 176px);
  --fs-h2: clamp(40px, 5vw, 80px);
  --fs-h3: clamp(26px, 2.4vw, 38px);
  --fs-body: 18px;
  --fs-small: 15px;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);

  background: var(--bg);
  color: var(--ink);
  font-family: var(--vp-font-family-base);
  font-size: var(--fs-body);
  line-height: 1.55;
  overflow-x: clip;
}
.th :where(h1, h2, h3, p, dl, dd, figure, ul) {
  margin: 0;
  padding: 0;
  border: 0;
}
.th a {
  color: inherit;
  text-decoration: none;
}
.th ul {
  list-style: none;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.h2 {
  font-size: var(--fs-h2);
  line-height: 1;
  letter-spacing: -0.035em;
  font-weight: 700;
  text-wrap: balance;
}
.h3 {
  font-size: var(--fs-h3);
  line-height: 1.08;
  letter-spacing: -0.025em;
  font-weight: 650;
}
.body {
  font-size: var(--fs-body);
  line-height: 1.55;
  color: var(--ink);
  max-width: 56ch;
}
.small {
  font-size: var(--fs-small);
  line-height: 1.45;
  color: var(--muted);
}
.th code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.86em;
}

/* buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 22px;
  border-radius: var(--r-sm);
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  border: 0;
  cursor: pointer;
  transition:
    background-color 0.2s var(--ease),
    transform 0.2s var(--ease),
    color 0.2s var(--ease);
}
.btn:active {
  transform: scale(0.97);
}
.btn-primary {
  background: var(--action);
  color: #fff !important;
}
.btn-primary:hover {
  background: var(--action-hover);
}
.btn-quiet {
  background: var(--surface-3);
  color: var(--ink);
}
.btn-quiet:hover {
  background: #3f3f46;
}
.btn-lg {
  min-height: 58px;
  padding: 0 28px;
  font-size: 18px;
}
.btn-block {
  width: 100%;
}
.th :focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: var(--r-sm);
}

/* ---------- hero ---------- */
.hero {
  min-height: calc(100svh - var(--vp-nav-height, 64px));
  display: flex;
  flex-direction: column;
  gap: 48px;
  padding: clamp(40px, 9vh, 120px) var(--m) clamp(32px, 6vh, 64px);
}
.hero-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: clamp(16px, 2.5vw, 48px);
  font-size: var(--fs-display);
}
.hero-mascot {
  height: 2.3em;
  width: auto;
  flex: none;
  margin-inline: auto;
  object-fit: contain;
  animation: rise 1.1s var(--ease) 0.3s both;
}
.hero-title {
  font-size: 1em;
  line-height: 0.92;
  letter-spacing: -0.05em;
  font-weight: 800;
}
.hero-name {
  color: var(--accent);
}
.hero-line {
  display: block;
  white-space: nowrap;
}
.hero-foot {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 32px 48px;
  flex-wrap: wrap;
}
.hero-lede {
  font-size: 20px;
  line-height: 1.5;
  max-width: 50ch;
}
.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

/* ---------- try ---------- */
.try {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: clamp(32px, 5vw, 96px);
  align-items: center;
  padding: clamp(96px, 14vh, 200px) var(--m);
}
.try-text {
  display: grid;
  gap: 28px;
  min-width: 0;
}
.pow-line {
  min-width: 0;
  background: var(--surface);
  border-radius: var(--r);
  padding: 4px 24px;
  transition: background-color 0.2s var(--ease);
}
.pow-line:focus-within {
  background: var(--surface-2);
}
.pow-input {
  width: 100%;
  background: transparent;
  border: 0;
  color: var(--ink);
  font: inherit;
  font-size: var(--fs-h2);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.25;
  caret-color: var(--accent);
  outline: none;
}
.examples {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
}
.example {
  font: inherit;
  font-size: 16px;
  color: var(--muted);
  background: var(--surface);
  border: 0;
  border-radius: 999px;
  padding: 10px 16px;
  min-height: 44px;
  cursor: pointer;
  transition:
    color 0.2s var(--ease),
    background-color 0.2s var(--ease);
}
.example:hover {
  color: var(--ink);
  background: var(--surface-2);
}
.pow-card {
  background: var(--surface);
  border-radius: 22px;
  padding: 24px;
  display: grid;
  gap: 20px;
  min-width: 0;
}
.pow-top {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 20px;
  align-items: center;
}
.pow-mascot {
  width: 120px;
  height: 130px;
  object-fit: contain;
  animation: pop 0.45s var(--ease);
}
@keyframes pop {
  from {
    transform: translateY(10px) scale(0.94);
    opacity: 0;
  }
}
.pow-status {
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.02em;
  margin-bottom: 6px !important;
}
.seg-label {
  font-size: 15px;
  color: var(--muted);
  align-self: center;
  padding: 0 10px 0 8px;
}
.seg {
  display: grid;
  grid-template-columns: auto repeat(4, 1fr);
  gap: 4px;
  background: var(--bg);
  border-radius: 12px;
  padding: 4px;
}
.seg-btn {
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  color: var(--muted);
  background: transparent;
  border: 0;
  border-radius: 9px;
  min-height: 40px;
  cursor: pointer;
  transition:
    background-color 0.2s var(--ease),
    color 0.2s var(--ease);
}
.seg-btn:hover {
  color: var(--ink);
}
.seg-btn[aria-pressed='true'] {
  background: var(--surface-3);
  color: var(--ink);
}
.pow-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.pow-stats > div {
  background: var(--surface-2);
  border-radius: 12px;
  padding: 12px 14px;
  min-width: 0;
}
.pow-stats dt {
  font-size: 15px;
  color: var(--muted);
}
.pow-stats dd {
  font-size: 18px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pow-hash {
  background: var(--bg);
  border-radius: 12px;
  padding: 14px 16px;
  overflow-wrap: anywhere;
  line-height: 1.5;
  min-height: 72px;
}
.pow-hash code {
  font-size: 15px;
  color: var(--muted);
  background: none;
  padding: 0;
}
.pow-hash .zeros {
  color: var(--accent);
  font-weight: 700;
}

/* ---------- see ---------- */
.see {
  padding: clamp(48px, 8vh, 120px) var(--m) clamp(96px, 14vh, 200px);
  display: grid;
  gap: 48px;
}
.see-head {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: clamp(32px, 5vw, 96px);
  align-items: end;
}
.see-frame {
  justify-self: center;
  width: min(100%, calc((100svh - var(--vp-nav-height, 64px) - 64px) * 2000 / 1360));
  border-radius: 24px;
  overflow: hidden;
  background: var(--surface);
  aspect-ratio: 2000 / 1360;
}
.see-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* ---------- how ---------- */
.how {
  padding: 0 var(--m) clamp(96px, 14vh, 200px);
}
.how-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: min(72svh, 680px);
  border-radius: 28px;
  overflow: hidden;
}
.how-clause {
  background: var(--surface);
  padding: clamp(28px, 4vw, 56px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 32px;
}
.clause {
  font-size: var(--fs-h2);
  line-height: 1;
  letter-spacing: -0.035em;
  font-weight: 700;
  max-width: 11ch;
}
.how-note {
  max-width: 44ch;
}
.how-stage {
  background: var(--surface-2);
  display: grid;
  place-items: center;
  padding: clamp(24px, 3vw, 48px);
}
.frag {
  width: min(100%, 460px);
}
.req,
.pass .kv,
.work-card {
  background: var(--bg);
  border-radius: 18px;
  padding: 24px;
}
.req-line {
  font-size: var(--fs-h3);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 18px !important;
}
.verb {
  color: var(--accent);
}
.kv {
  display: grid;
  gap: 10px;
}
.kv > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  background: var(--surface);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 16px;
}
.kv dt {
  color: var(--muted);
}
.kv dd {
  font-weight: 600;
  text-align: right;
}
.acts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: min(100%, 560px);
}
.act {
  background: var(--bg);
  border-radius: 18px;
  padding: 16px 14px 18px;
  text-align: center;
}
.act img {
  height: 120px;
  width: auto;
  margin: 0 auto 10px;
  object-fit: contain;
}
.act-name {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 4px !important;
}
.work,
.pass {
  display: grid;
  justify-items: center;
  gap: 0;
}
.work img,
.pass img {
  height: 200px;
  width: auto;
  object-fit: contain;
  position: relative;
  z-index: 1;
  margin-bottom: -18px;
}
.pass img {
  margin-bottom: 16px;
}
.work-card {
  width: 100%;
  text-align: center;
}
.work-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 16px !important;
}
.bar {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
  margin-bottom: 14px;
}
.bar span {
  display: block;
  height: 100%;
  width: 100%;
  border-radius: inherit;
  background: var(--accent);
  transform-origin: left;
  animation: fill 2.4s var(--ease) infinite;
}
@keyframes fill {
  from {
    transform: scaleX(0);
  }
  80%,
  to {
    transform: scaleX(1);
  }
}
.pass .kv {
  width: 100%;
}
.how-slider {
  padding: 28px 4px 0;
}
.range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 32px;
  background: transparent;
  cursor: pointer;
  margin: 0;
}
.track {
  position: relative;
}
.track::before,
.track-fill {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  height: 8px;
  border-radius: 999px;
  pointer-events: none;
}
.track::before {
  right: 0;
  background: var(--surface-3);
}
.track-fill {
  width: calc(var(--p) * 0.98 + 1%);
  background: var(--ink);
  transition: width 0.2s var(--ease);
}
.range {
  position: relative;
}
.range::-webkit-slider-runnable-track {
  height: 8px;
  background: transparent;
}
.range::-moz-range-track {
  height: 8px;
  background: transparent;
}
.range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 32px;
  height: 32px;
  margin-top: -12px;
  border-radius: 999px;
  background: var(--accent);
  border: 0;
  transition: transform 0.2s var(--ease);
}
.range::-moz-range-thumb {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: var(--accent);
  border: 0;
}
.range:active::-webkit-slider-thumb {
  transform: scale(1.12);
}
.stage-names {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin-top: 10px;
}
.stage-name {
  font: inherit;
  font-size: 16px;
  color: var(--muted);
  background: none;
  border: 0;
  padding: 8px 0;
  cursor: pointer;
  text-align: left;
  transition: color 0.2s var(--ease);
}
.stage-name:nth-child(2) {
  text-align: center;
  padding-right: 8%;
}
.stage-name:nth-child(3) {
  text-align: center;
  padding-left: 8%;
}
.stage-name:last-child {
  text-align: right;
}
.stage-name:hover,
.stage-name.on {
  color: var(--ink);
}
.stage-name.on {
  font-weight: 600;
}
.swap-enter-active,
.swap-leave-active {
  transition:
    opacity 0.2s var(--ease),
    transform 0.2s var(--ease);
}
.swap-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.swap-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ---------- features ---------- */
.feat {
  padding: 0 var(--m) clamp(96px, 14vh, 200px);
  display: grid;
  gap: clamp(72px, 10vh, 128px);
}
.feat-head {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: clamp(32px, 5vw, 96px);
  align-items: end;
}
.row {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
  gap: clamp(32px, 5vw, 96px);
  align-items: start;
}
.row-text {
  display: grid;
  gap: 16px;
  position: sticky;
  top: calc(var(--vp-nav-height, 64px) + 32px);
  max-width: 460px;
}
.more {
  justify-self: start;
  font-size: 16px;
  font-weight: 600;
  color: var(--accent) !important;
  padding: 6px 0;
  transition: color 0.2s var(--ease);
}
.more:hover {
  color: var(--accent-hover) !important;
}
.more::after {
  content: ' →';
}
.shot {
  background: var(--surface);
  border-radius: 22px;
  padding: 10px;
  overflow: hidden;
}
.shot img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 14px;
  transition: transform 0.6s var(--ease);
}
.shot:hover img {
  transform: scale(1.015);
}
.w-lg {
  justify-self: stretch;
}
.w-md {
  justify-self: end;
  width: 84%;
}
.code-shot {
  padding: 0;
}
.code-shot pre {
  margin: 0;
  padding: 28px 32px;
  font-size: 15px;
  line-height: 1.7;
  overflow-x: auto;
  color: var(--ink);
}
.code-shot code {
  font-size: 15px;
}
.code-shot .k {
  color: #f0a3a3;
}
.code-shot .s {
  color: #9fd8b5;
}
.code-shot .c {
  color: var(--muted);
}
.row-text code {
  background: var(--surface-2);
  border-radius: 6px;
  padding: 2px 6px;
}

/* ---------- cta ---------- */
.cta {
  background: var(--ink);
  color: var(--bg);
  min-height: 72svh;
  margin: 0 var(--m);
  border-radius: 32px;
  padding: clamp(36px, 5vw, 72px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 64px;
}
.cta-title {
  font-size: clamp(56px, 10vw, 168px);
  line-height: 0.92;
  letter-spacing: -0.05em;
  font-weight: 800;
  max-width: 9.5em;
  text-wrap: balance;
}
.cta-foot {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 32px;
  flex-wrap: wrap;
}
.cta-text {
  font-size: 20px;
  line-height: 1.5;
  max-width: 44ch;
  color: var(--bg);
}

/* ---------- footer ---------- */
.foot {
  position: relative;
  overflow: hidden;
  padding: clamp(96px, 14vh, 180px) var(--m) 0;
}
.foot-top {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 40px;
  flex-wrap: wrap;
}
.foot-title {
  font-size: var(--fs-h3);
  font-weight: 650;
  letter-spacing: -0.025em;
  line-height: 1.1;
  margin-bottom: 24px !important;
}
.foot-links {
  display: grid;
  gap: 6px;
}
.foot-links a {
  font-size: 16px;
  padding: 4px 0;
  display: inline-block;
  color: var(--muted);
  transition: color 0.2s var(--ease);
}
.foot-links a:hover {
  color: var(--ink);
}
.foot-legal {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: clamp(64px, 10vh, 128px);
  font-size: var(--fs-small);
  color: var(--muted);
}
.foot-legal a {
  color: var(--ink);
}
.foot-legal a:hover {
  color: var(--accent);
}
.foot-mark {
  font-size: 21vw;
  line-height: 0.8;
  font-weight: 800;
  letter-spacing: -0.06em;
  white-space: nowrap;
  color: var(--surface-2);
  margin: 16px 0 -0.1em !important;
  user-select: none;
}
.foot-mark span {
  display: inline-block;
  padding-right: 0.06em;
}

/* ---------- motion ---------- */
.is-js [data-reveal] {
  opacity: 0;
  transform: translateY(24px);
  transition:
    opacity 0.7s var(--ease),
    transform 0.7s var(--ease);
}
.is-js [data-reveal].is-in {
  opacity: 1;
  transform: none;
}
.is-js .try-text > [data-reveal]:nth-child(2),
.is-js .see-head > [data-reveal]:nth-child(2),
.is-js .feat-head > [data-reveal]:nth-child(2) {
  transition-delay: 0.08s;
}
.is-js .try-text > [data-reveal]:nth-child(4) {
  transition-delay: 0.16s;
}
.is-js .try-text > [data-reveal]:nth-child(5),
.is-js .pow-card[data-reveal] {
  transition-delay: 0.24s;
}
.is-js .cta-foot[data-reveal] {
  transition-delay: 0.12s;
}
.is-js .shutter[data-reveal] {
  opacity: 1;
  transform: none;
  clip-path: inset(100% 0 0 0 round 24px);
  transition: clip-path 1.1s var(--ease);
}
.is-js .shutter[data-reveal] .see-video {
  transform: scale(1.12);
  transition: transform 1.3s var(--ease);
}
.is-js .shutter[data-reveal].is-in {
  clip-path: inset(0 0 0 0 round 24px);
}
.is-js .shutter[data-reveal].is-in .see-video {
  transform: none;
}
.hero-line {
  animation: rise 0.9s var(--ease) both;
}
.hero-line + .hero-line {
  animation-delay: 0.08s;
}
.hero-lede {
  animation: rise 0.9s var(--ease) 0.18s both;
}
.hero-actions {
  animation: rise 0.9s var(--ease) 0.26s both;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(28px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .th *,
  .th *::before,
  .th *::after {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
  .is-js [data-reveal] {
    opacity: 1;
    transform: none;
  }
  .is-js .shutter[data-reveal] {
    clip-path: none;
  }
}

/* ---------- smaller screens ---------- */
@media (max-width: 960px) {
  .hero-main {
    font-size: 9vw;
  }
  .cta {
    min-height: 0;
    gap: 120px;
  }
  .try,
  .see-head,
  .feat-head,
  .row {
    grid-template-columns: 1fr;
  }
  .row-text {
    position: static;
  }
  .w-md {
    width: 100%;
  }
  .how-fields {
    grid-template-columns: 1fr;
  }
  .how-stage {
    order: -1;
    min-height: 420px;
  }
}
@media (max-width: 640px) {
  .th {
    --fs-body: 17px;
  }
  .hero {
    min-height: 0;
    gap: 28px;
    padding-top: 24px;
  }
  .hero-main {
    font-size: 13.5vw;
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
  }
  .hero-mascot {
    order: -1;
    height: 190px;
    margin-inline: 0;
  }
  .hero-lede {
    font-size: 18px;
  }
  .hero-actions,
  .hero-actions .btn {
    width: 100%;
  }
  .pow-input {
    font-size: 11vw;
  }
  .see-frame {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 20px;
  }
  .see-video {
    object-position: 50% 30%;
  }
  .pow-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .pow-top {
    grid-template-columns: 88px 1fr;
  }
  .pow-mascot {
    width: 88px;
    height: 96px;
  }
  .seg-btn {
    font-size: 13px;
  }
  .clause {
    font-size: 10vw;
  }
  .acts {
    gap: 8px;
  }
  .act img {
    height: 84px;
  }
  .act-name {
    font-size: 18px;
  }
  .stage-name {
    font-size: 15px;
  }
  .cta {
    min-height: 0;
    border-radius: 24px;
  }
  .shot {
    padding: 6px;
    border-radius: 18px;
  }
  .shot:not(.code-shot) img {
    aspect-ratio: 1 / 1;
    object-fit: cover;
    object-position: 47% 0;
    border-radius: 13px;
  }
  .cta-title {
    font-size: 15vw;
  }
  .cta {
    gap: 64px;
  }
  .cta-foot .btn {
    width: 100%;
  }
}
</style>
