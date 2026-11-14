// Three.js 3D Multi-Layered Aquatic Engine + HTML-in-Canvas Multi-Layer Compositor
// Combines Calm WebGL Depth, Photorealistic Earth Globe, and 4-Layer Canvas Compositing

class HydroCanvasCompositor {
  constructor(canvasId = "compositing-canvas") {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext("2d");
    this.hasHtmlInCanvas = ("content" in HTMLCanvasElement.prototype);

    // Offscreen compositing buffer for Layer 0 (source-atop glyph masking)
    this.layerBuffer = document.createElement("canvas");
    this.layerBufferCtx = this.layerBuffer.getContext("2d");

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.activeSlideIndex = 0;
    this.bgWord = "HYDRO";
    this.chapterMeta = "00 / COMPANY OVERVIEW";
    this.totalSlides = 13;

    // Transition animation state (Layer 3)
    this.transitionActive = false;
    this.transitionStart = 0;
    this.transitionDuration = 850;
    this.transitionDirection = 1;
    this.outgoingWord = "HYDRO";

    // Cached bounding rectangles of foreground/middleground interactive cards (Layer 2)
    this.cachedElements = [];
    this.lastCacheSlide = -1;
    this.lastCacheTime = 0;

    // Direct HTML-in-Canvas [drawable] children
    this.drawableChildren = Array.from(this.canvas.querySelectorAll("[drawable]"));
    this.wordSpan = document.getElementById("drawable-monumental-word");
    this.metaSpan = document.getElementById("drawable-chapter-tag");
    this.counterSpan = document.getElementById("drawable-slide-counter");

    document.body.classList.add("canvas-compositing-active");

    // Initialize ResizeObserver strictly OUTSIDE onpaint to avoid memory leaks
    this.initResizeObserver();

    if (this.hasHtmlInCanvas) {
      this.canvas.onpaint = (event) => {
        this.paintHtmlInCanvas(event);
      };
      this.requestRender();
    }

    // Recache active card geometry when a slide scrolls
    document.addEventListener("scroll", () => this.invalidateElementCache(), true);
  }

  /**
   * Static helper demonstrating WebGL2 HTML-in-Canvas texture upload path.
   */
  static syncWebGLDrawableTexture(gl, canvas, element, texture) {
    if (!gl || !canvas || !element || typeof canvas.captureElementImage !== "function") return;
    const capture = canvas.captureElementImage(element);
    if (!capture) return;

    const width = Math.max(1, Math.ceil(capture.width));
    const height = Math.max(1, Math.ceil(capture.height));

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    if (typeof gl.texElementSubImage2D === "function") {
      gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, element, { width, height });
    }
  }

  initResizeObserver() {
    if (typeof ResizeObserver === "undefined" || !this.canvas) {
      this.syncCanvasDimensions(window.innerWidth, window.innerHeight);
      return;
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        let pixelWidth;
        let pixelHeight;
        if (entry.devicePixelContentBoxSize && entry.devicePixelContentBoxSize.length > 0) {
          pixelWidth = entry.devicePixelContentBoxSize[0].inlineSize;
          pixelHeight = entry.devicePixelContentBoxSize[0].blockSize;
          this.dpr = pixelWidth / Math.max(1, entry.contentRect.width);
        } else {
          this.dpr = Math.min(window.devicePixelRatio || 1, 2);
          pixelWidth = Math.round(entry.contentRect.width * this.dpr);
          pixelHeight = Math.round(entry.contentRect.height * this.dpr);
        }
        this.syncCanvasDimensions(entry.contentRect.width, entry.contentRect.height, pixelWidth, pixelHeight);
        this.invalidateElementCache();
        this.requestRender();
      }
    });

    try {
      this.resizeObserver.observe(this.canvas, { box: "device-pixel-content-box" });
    } catch (e) {
      this.resizeObserver.observe(this.canvas);
    }
  }

  syncCanvasDimensions(cssWidth, cssHeight, pixelWidth, pixelHeight) {
    this.width = Math.max(1, cssWidth || window.innerWidth);
    this.height = Math.max(1, cssHeight || window.innerHeight);
    const targetW = Math.max(1, pixelWidth || Math.round(this.width * this.dpr));
    const targetH = Math.max(1, pixelHeight || Math.round(this.height * this.dpr));

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
      this.layerBuffer.width = targetW;
      this.layerBuffer.height = targetH;
    }
  }

  requestRender() {
    if (this.hasHtmlInCanvas && typeof this.canvas.requestPaint === "function") {
      this.canvas.requestPaint();
    }
  }

  setSlideMetadata(slideIndex, totalSlides, bgWord, chapterMeta) {
    this.activeSlideIndex = slideIndex;
    this.totalSlides = totalSlides || 13;
    this.bgWord = (bgWord || "HYDRO").toUpperCase();
    this.chapterMeta = (chapterMeta || "COMPANY OVERVIEW").toUpperCase();

    if (this.wordSpan) this.wordSpan.textContent = this.bgWord;
    if (this.metaSpan) this.metaSpan.textContent = this.chapterMeta;
    if (this.counterSpan) {
      this.counterSpan.textContent = `${String(slideIndex + 1).padStart(2, "0")} / ${String(this.totalSlides).padStart(2, "0")}`;
    }

    this.invalidateElementCache();
    this.requestRender();
  }

  triggerTransition(fromIdx, toIdx, direction, prevWord) {
    this.outgoingWord = (prevWord || this.bgWord || "HYDRO").toUpperCase();
    this.transitionDirection = direction >= 0 ? 1 : -1;
    this.transitionStart = performance.now();
    this.transitionActive = true;
    this.invalidateElementCache();
    this.requestRender();
  }

  invalidateElementCache() {
    this.lastCacheSlide = -1;
  }

  refreshElementCache(nowMs) {
    const activeSlide = document.querySelector(".slide.active");
    if (!activeSlide) {
      this.cachedElements = [];
      return;
    }
    const selectors = ".middleground-card, .glass-card, .visual-frame, .table-wrapper, .hub-list-card, .comparison-container";
    const nodes = activeSlide.querySelectorAll(selectors);
    const rects = [];
    nodes.forEach((el, idx) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 20 && rect.height > 20 && rect.bottom > 0 && rect.top < this.height) {
        rects.push({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          depthFactor: 0.75 + (idx % 3) * 0.25
        });
      }
    });
    this.cachedElements = rects;
    this.lastCacheSlide = this.activeSlideIndex;
    this.lastCacheTime = nowMs;
  }

  updateFrameInputs(time, mouse, slideIndex) {
    this._lastTime = time;
    this._lastMouse = mouse;
    this.activeSlideIndex = slideIndex;
  }

  paintHtmlInCanvas() {
    if (!this.ctx || !this.hasHtmlInCanvas) return;

    this.renderCompositeFrame(this._lastTime || 0, this._lastMouse || { x: 0, y: 0 }, this.activeSlideIndex);

    // Composite [drawable] DOM elements natively when browser supports drawElementImage
    if (typeof this.ctx.drawElementImage === "function") {
      const offsets = [
        { x: -32 * ((this._lastMouse && this._lastMouse.x) || 0), y: 20 * ((this._lastMouse && this._lastMouse.y) || 0) },
        { x: 14 * ((this._lastMouse && this._lastMouse.x) || 0), y: -10 * ((this._lastMouse && this._lastMouse.y) || 0) },
        { x: 6 * ((this._lastMouse && this._lastMouse.x) || 0), y: -4 * ((this._lastMouse && this._lastMouse.y) || 0) }
      ];

      this.drawableChildren.forEach((el, idx) => {
        const off = offsets[idx] || { x: 0, y: 0 };
        this.ctx.save();
        this.ctx.globalAlpha = idx === 0 ? 0.04 : 0.0;
        const drawX = Math.round(this.width * 0.05 + off.x);
        const drawY = Math.round(this.height * 0.12 + off.y);
        try {
          this.ctx.drawElementImage(el, drawX, drawY);
          if (typeof this.canvas.updateElementGeometry === "function") {
            const matrix = new DOMMatrix().translate(drawX, drawY);
            this.canvas.updateElementGeometry(el, { canvasTransform: matrix });
          }
        } catch (e) {}
        this.ctx.restore();
      });
    }
  }

  /**
   * Evaluate cubic-bezier(0.22, 1, 0.36, 1) ease-out curve for editorial choreography.
   */
  easeOutQuintic(t) {
    const u = 1 - Math.min(1, Math.max(0, t));
    return 1 - Math.pow(u, 4);
  }

  renderCompositeFrame(time, mouse, slideIndex) {
    if (!this.ctx || !this.canvas) return;
    this._lastTime = time;
    this._lastMouse = mouse;

    const nowMs = performance.now();
    const mx = mouse ? mouse.x : 0;
    const my = mouse ? mouse.y : 0;

    // Refresh active slide card geometry at most every 450ms or on slide change
    if (this.lastCacheSlide !== slideIndex || nowMs - this.lastCacheTime > 450) {
      this.refreshElementCache(nowMs);
    }

    // Update Layer 3 & Layer 0 transition progress (850ms editorial curve)
    let wipeProgress = 1;
    if (this.transitionActive) {
      const elapsed = nowMs - this.transitionStart;
      const rawT = Math.min(1, Math.max(0, elapsed / this.transitionDuration));
      wipeProgress = this.easeOutQuintic(rawT);
      if (rawT >= 1) {
        this.transitionActive = false;
      }
    }

    const slideSlip = this.transitionActive ? (1 - wipeProgress) * 44 * this.transitionDirection : 0;

    // Drive CSS custom properties for synchronized DOM depth parallax
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--layer-bg-offset", `${(-32 * mx + slideSlip * 1.4).toFixed(2)}px`);
    rootStyle.setProperty("--layer-mid-offset", `${(-14 * mx + slideSlip * 1.0).toFixed(2)}px`);
    rootStyle.setProperty("--layer-fg-offset", `${(8 * mx + slideSlip * 0.7).toFixed(2)}px`);

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(this.dpr, this.dpr);

    // =========================================================================
    // LAYER 0: Rising Architectural Monumental Word + Masked Caustic Pass
    // =========================================================================
    this.renderLayer0MonumentalWord(ctx, time, mx, my, slideSlip * 1.4, wipeProgress);

    // =========================================================================
    // LAYER 1: Precision Architectural Grid & Laminar Wave Horizon
    // =========================================================================
    this.renderLayer1GridAndHorizon(ctx, time, mx, my, slideIndex, slideSlip * 1.0);

    // =========================================================================
    // LAYER 2: Element-Synced Specular Frames & Kinetic Echoes
    // =========================================================================
    this.renderLayer2ElementFrames(ctx, time, mx, my, slideSlip * 0.7, wipeProgress);

    // =========================================================================
    // LAYER 3: Editorial Diagonal Curtain Wipe ('destination-out' + 'screen')
    // =========================================================================
    if (this.transitionActive && wipeProgress < 0.996) {
      this.renderLayer3TransitionWipe(ctx, wipeProgress, time);
    }

    ctx.restore();
  }

  renderLayer0MonumentalWord(ctx, time, mx, my, offsetX, wipeProgress) {
    const bCtx = this.layerBufferCtx;
    if (!bCtx) return;

    const w = this.width;
    const h = this.height;
    bCtx.save();
    bCtx.setTransform(1, 0, 0, 1, 0, 0);
    bCtx.clearRect(0, 0, this.layerBuffer.width, this.layerBuffer.height);
    bCtx.scale(this.dpr, this.dpr);

    const fontSize = Math.max(96, Math.min(290, w * 0.19));
    bCtx.font = `700 ${fontSize}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
    bCtx.textAlign = "center";
    bCtx.textBaseline = "middle";

    // Emerge upward from behind a lower horizon clip mask (Dribbble / Marlin motif)
    const riseOffset = (1 - wipeProgress) * 110;
    const centerX = w * 0.52 - mx * 44 + offsetX;
    const baseCenterY = h * 0.51 + my * 24;
    const horizonMaskY = baseCenterY + fontSize * 0.36;

    bCtx.beginPath();
    bCtx.rect(0, 0, w, horizonMaskY);
    bCtx.clip();

    // Paint base silhouette of rising monumental word
    bCtx.globalCompositeOperation = "source-over";
    bCtx.fillStyle = "rgba(180, 218, 255, 0.88)";
    bCtx.fillText(this.bgWord, centerX, baseCenterY + riseOffset);

    // Mask caustic luminance sweep strictly inside typography shapes ('source-atop')
    bCtx.globalCompositeOperation = "source-atop";
    const sweepPos = ((Math.sin(time * 0.42) * 0.5 + 0.5) * 0.8 + 0.1) * w;
    const causticGrad = bCtx.createLinearGradient(
      sweepPos - w * 0.35,
      baseCenterY - fontSize * 0.6,
      sweepPos + w * 0.35,
      baseCenterY + fontSize * 0.6
    );
    causticGrad.addColorStop(0.0, "rgba(15, 38, 74, 0.32)");
    causticGrad.addColorStop(0.45, "rgba(0, 194, 255, 0.82)");
    causticGrad.addColorStop(0.55, "rgba(244, 247, 250, 0.94)");
    causticGrad.addColorStop(1.0, "rgba(15, 38, 74, 0.32)");
    bCtx.fillStyle = causticGrad;
    bCtx.fillRect(0, 0, w, horizonMaskY);
    bCtx.restore();

    // Composite Layer 0 onto main stage with subtle executive depth weight
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.068 * (0.28 + 0.72 * wipeProgress);
    ctx.drawImage(this.layerBuffer, 0, 0, w, h);
    ctx.restore();
  }

  renderLayer1GridAndHorizon(ctx, time, mx, my, slideIndex, offsetX) {
    const w = this.width;
    const h = this.height;
    const gx = -mx * 16 + offsetX;
    const gy = my * 8;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // Ultra-clean architectural hairlines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.024)";
    ctx.lineWidth = 1;
    const cols = w < 768 ? 2 : 4;
    const padX = w < 768 ? 24 : 64;
    const usableW = w - padX * 2;

    for (let i = 0; i <= cols; i++) {
      const xPos = Math.round(padX + (usableW / cols) * i + gx * 0.32) + 0.5;
      ctx.beginPath();
      ctx.moveTo(xPos, 64);
      ctx.lineTo(xPos, h - 72);
      ctx.stroke();

      // Intersection fiducial '+' ticks
      const tickY = Math.round(h * 0.24 + gy * 0.28) + 0.5;
      ctx.strokeStyle = "rgba(0, 194, 255, 0.12)";
      ctx.beginPath();
      ctx.moveTo(xPos - 4, tickY);
      ctx.lineTo(xPos + 4, tickY);
      ctx.moveTo(xPos, tickY - 4);
      ctx.lineTo(xPos, tickY + 4);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.024)";
    }

    // Calm Laminar Fluid Horizon Line (Tracks presentation depth 0 -> 12)
    const progress = slideIndex / Math.max(1, this.totalSlides - 1);
    const horizonBaseY = h * (0.82 - progress * 0.07) + gy * 0.35;
    ctx.strokeStyle = "rgba(0, 194, 255, 0.14)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 28) {
      const normX = x / w;
      const waveY = horizonBaseY +
        Math.sin(normX * 4.2 + time * 0.6) * 5.5 +
        Math.cos(normX * 7.5 - time * 0.38) * 2.5;
      if (x === 0) ctx.moveTo(x, waveY);
      else ctx.lineTo(x, waveY);
    }
    ctx.stroke();

    ctx.restore();
  }

  renderLayer2ElementFrames(ctx, time, mx, my, offsetX, wipeProgress) {
    if (!this.cachedElements.length) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    this.cachedElements.forEach((box) => {
      const shiftX = mx * 11 * box.depthFactor + offsetX * box.depthFactor;
      const shiftY = -my * 8 * box.depthFactor;
      const x = box.left + shiftX;
      const y = box.top + shiftY;
      const w = box.width;
      const h = box.height;

      // Subtle depth-separated hairline ghost plane
      ctx.strokeStyle = `rgba(0, 194, 255, ${(0.075 * wipeProgress).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);

      // Precision L-shaped architectural corner ticks
      const tick = 8;
      ctx.strokeStyle = `rgba(176, 191, 212, ${(0.22 * wipeProgress).toFixed(3)})`;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(x - 3, y - 3 + tick);
      ctx.lineTo(x - 3, y - 3);
      ctx.lineTo(x - 3 + tick, y - 3);
      // Bottom-right
      ctx.moveTo(x + w + 3 - tick, y + h + 3);
      ctx.lineTo(x + w + 3, y + h + 3);
      ctx.lineTo(x + w + 3, y + h + 3 - tick);
      ctx.stroke();
    });

    ctx.restore();
  }

  renderLayer3TransitionWipe(ctx, wipeProgress, time) {
    const w = this.width;
    const h = this.height;
    const fadeOut = 1 - wipeProgress;
    const slant = Math.round(w * 0.14);

    // 1. Editorial diagonal curtain wipe via 'destination-out' compositing
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    const bandX = this.transitionDirection >= 0
      ? w * (1 - wipeProgress * 1.18)
      : w * (wipeProgress * 1.18 - 0.18);
    const maskGrad = ctx.createLinearGradient(bandX - 220, 0, bandX + 220 + slant, h * 0.85);
    maskGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    maskGrad.addColorStop(0.5, `rgba(0, 0, 0, ${(0.5 * fadeOut).toFixed(3)})`);
    maskGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = maskGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 2. Crisp specular optical curtain sweep via 'screen' blend
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const curtainGrad = ctx.createLinearGradient(bandX - 180, 0, bandX + 180 + slant, h);
    curtainGrad.addColorStop(0, "rgba(0, 194, 255, 0)");
    curtainGrad.addColorStop(0.5, `rgba(0, 194, 255, ${(0.2 * fadeOut).toFixed(3)})`);
    curtainGrad.addColorStop(1, "rgba(0, 194, 255, 0)");
    ctx.fillStyle = curtainGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle rising outgoing monumental trail
    ctx.globalAlpha = 0.05 * fadeOut;
    ctx.font = `700 ${Math.max(88, Math.min(260, w * 0.18))}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#8fa3bd";
    const ghostX = w * 0.5 - this.transitionDirection * wipeProgress * 140;
    const ghostY = h * 0.51 - wipeProgress * 46 + Math.sin(time * 2) * 3;
    ctx.fillText(this.outgoingWord, ghostX, ghostY);
    ctx.restore();
  }
}

class HydroScene {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.time = 0;
    this.slideIndex = 0;
    this.isDetailOpen = false;

    // Interactive Drag / Orbit State for 3D Globe
    this.isDraggingGlobe = false;
    this.previousPointerPosition = { x: 0, y: 0 };
    this.globeUserRotation = { x: 0.22, y: -0.35 };
    this.targetGlobeRotation = null;
    this.focusedHubIndex = 0;
    this.globeVelocity = { x: 0, y: 0 };
    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();

    // Multi-Layer HTML-in-Canvas Compositor
    this.compositor = new HydroCanvasCompositor("compositing-canvas");

    this.init();
    this.initWaterShader();
    this.initGlobalPresenceGlobe();
    this.setupEvents();
    this.animate();
  }

  init() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.scene.fog = new THREE.FogExp2(0x03070e, 0.042);

    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.targetCameraPos = new THREE.Vector3(0, 0, 10);
    this.targetCameraLookAt = new THREE.Vector3(0, 0, 0);
    this.currentLookAt = new THREE.Vector3(0, 0, 0);

    // Balanced Executive Aquatic Lighting Setup
    const ambientLight = new THREE.AmbientLight(0x0f2547, 2.2);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xe0f7ff, 2.6);
    dirLight.position.set(6, 12, 8);
    this.scene.add(dirLight);

    const cyanPoint = new THREE.PointLight(0x00c2ff, 2.8, 35);
    cyanPoint.position.set(-6, -2, 5);
    this.scene.add(cyanPoint);

    const bluePoint = new THREE.PointLight(0x1a6dff, 2.2, 25);
    bluePoint.position.set(5, -4, 3);
    this.scene.add(bluePoint);
  }

  initWaterShader() {
    // Calm Deep Caustic Plane (Subdued contrast for executive readability)
    const vertexShader = `
      uniform float u_time;
      uniform vec2 u_mouse;
      varying vec2 vUv;
      varying vec3 vPosition;

      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
                  i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }

      void main() {
        vUv = uv;
        vec3 pos = position;
        
        float wave1 = snoise(vec3(pos.x * 0.16, pos.y * 0.16, u_time * 0.2)) * 0.65;
        float wave2 = snoise(vec3(pos.x * 0.35 + 4.0, pos.y * 0.35, u_time * 0.3)) * 0.32;
        
        float d = distance(pos.xy, u_mouse * 7.5);
        float mouseWave = sin(d * 1.8 - u_time * 2.8) * exp(-d * 0.38) * 0.35;

        pos.z += wave1 + wave2 + mouseWave;
        vPosition = pos;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float u_time;
      uniform vec2 u_mouse;
      varying vec2 vUv;
      varying vec3 vPosition;

      void main() {
        vec3 deepAbyss = vec3(0.012, 0.027, 0.055);
        vec3 oceanBlue = vec3(0.027, 0.067, 0.145);
        vec3 causticCyan = vec3(0.0, 0.72, 0.94);
        vec3 causticHighlight = vec3(0.76, 0.92, 1.0);

        vec2 p = vUv * 7.5;
        float c = 1.0;
        for (int i = 0; i < 4; i++) {
          p += vec2(
            cos(p.y + u_time * 0.25 + float(i) * 1.4),
            sin(p.x + u_time * 0.25 + float(i) * 1.4)
          );
          c += 1.0 / length(vec2(
            sin(p.x) / sin(p.y + u_time * 0.14),
            cos(p.y) / cos(p.x + u_time * 0.14)
          ));
        }
        c = clamp(pow(c * 0.075, 2.2), 0.0, 1.2);

        float heightFactor = clamp((vPosition.z + 1.0) * 0.42, 0.0, 1.0);
        vec3 color = mix(deepAbyss, oceanBlue, heightFactor);
        color = mix(color, causticCyan, c * 0.28);
        color += causticHighlight * (c * 0.16);

        float dist = distance(vUv, vec2(0.5, 0.5));
        color *= smoothstep(0.95, 0.2, dist);

        gl_FragColor = vec4(color, 0.22);
      }
    `;

    this.waterUniforms = {
      u_time: { value: 0 },
      u_mouse: { value: new THREE.Vector2(0, 0) }
    };

    const geometry = new THREE.PlaneGeometry(42, 28, 120, 120);
    const material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: this.waterUniforms,
      transparent: true,
      depthWrite: false
    });

    this.waterMesh = new THREE.Mesh(geometry, material);
    this.waterMesh.position.set(0, 0, -3.5);
    this.scene.add(this.waterMesh);
  }

  initGlobalPresenceGlobe() {
    // 3D Photorealistic Interactive Earth Globe for Slide 10 (Group Structure)
    this.globeGroup = new THREE.Group();
    this.globeGroup.rotation.order = "YXZ";
    this.globeGroup.position.set(3.2, 0, 1.5);
    this.globeGroup.scale.set(0, 0, 0);

    const radius = 2.25;
    const maxAniso = this.renderer && this.renderer.capabilities
      ? Math.min(this.renderer.capabilities.getMaxAnisotropy(), 16)
      : 8;

    // 1. NASA Blue Marble Photorealistic Earth Surface
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load('assets/images/earth_surface_realistic.jpg');
    earthTexture.colorSpace = THREE.SRGBColorSpace;
    earthTexture.anisotropy = maxAniso;
    earthTexture.wrapS = THREE.RepeatWrapping;
    earthTexture.wrapT = THREE.ClampToEdgeWrapping;

    const specularTexture = textureLoader.load('assets/images/earth_specular.jpg');
    specularTexture.anisotropy = maxAniso;

    const earthGeo = new THREE.SphereGeometry(radius, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      map: earthTexture,
      bumpMap: specularTexture,
      bumpScale: 0.03,
      specularMap: specularTexture,
      specular: new THREE.Color(0x1b4d6e),
      shininess: 26
    });
    this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
    this.globeGroup.add(this.earthMesh);

    // 2. Sheer Translucent Cloud Whisps
    const cloudsTexture = textureLoader.load('assets/images/earth_clouds.jpg');
    cloudsTexture.anisotropy = maxAniso;
    const cloudsGeo = new THREE.SphereGeometry(radius * 1.01, 48, 48);
    const cloudsMat = new THREE.MeshStandardMaterial({
      alphaMap: cloudsTexture,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    this.globeGroup.add(this.cloudsMesh);

    // 3. Restrained Rayleigh Atmospheric Limbshell (No thick cartoon ring)
    const atmoGeo = new THREE.SphereGeometry(radius * 1.045, 48, 48);
    const atmoShader = {
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 viewDir = normalize(-vPosition);
          float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 4.2);
          gl_FragColor = vec4(vec3(0.15, 0.65, 0.98), fresnel * 0.42);
        }
      `
    };

    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: atmoShader.vertexShader,
      fragmentShader: atmoShader.fragmentShader,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });
    this.atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    this.globeGroup.add(this.atmoMesh);

    // Exact Geographic Coordinates Conversion for Three.js SphereGeometry UV mapping
    const latLongToVector3 = (lat, lon, r) => {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      return new THREE.Vector3(
        -(r * Math.sin(phi) * Math.cos(theta)),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    };

    // Active verified Hydro Industries Group operating locations (index 0-5 matches index.html)
    const hubs = [
      {
        name: "UK Global HQ",
        city: "Llangennech / London",
        country: "United Kingdom",
        lat: 51.5074,
        lon: -0.1278,
        isHQ: true,
        radial: 1.22,
        offset: [0.0, 0.28, 0.0]
      },
      {
        name: "Hydro Ecuador",
        city: "Quito",
        country: "Ecuador",
        lat: -0.1807,
        lon: -78.4678,
        isHQ: false,
        radial: 1.24,
        offset: [-0.38, -0.30, 0.15]
      },
      {
        name: "Hydro Colombia",
        city: "Bogotá",
        country: "Colombia",
        lat: 4.7110,
        lon: -74.0721,
        isHQ: false,
        radial: 1.24,
        offset: [-0.35, 0.30, 0.15]
      },
      {
        name: "Hydro Saudi Arabia",
        city: "Riyadh",
        country: "Saudi Arabia",
        lat: 24.7136,
        lon: 46.6753,
        isHQ: false,
        radial: 1.24,
        offset: [0.38, -0.34, 0.12]
      },
      {
        name: "Hydro Egypt",
        city: "Cairo",
        country: "Egypt",
        lat: 30.0444,
        lon: 31.2357,
        isHQ: false,
        radial: 1.22,
        offset: [-0.32, 0.34, 0.10]
      },
      {
        name: "Hydro Regional Operations",
        city: "Manama",
        country: "Bahrain",
        lat: 26.2285,
        lon: 50.5860,
        isJV: true,
        radial: 1.30,
        offset: [0.48, 0.22, -0.15]
      }
    ];

    const hqPos = latLongToVector3(51.5074, -0.1278, radius);
    this.hubPins = [];
    this.arcBeams = [];

    // Minimalist Executive Callout Pill Generator
    const createCitySprite = (hub) => {
      const canvas = document.createElement('canvas');
      canvas.width = 420;
      canvas.height = 104;
      const ctx = canvas.getContext('2d');

      const isHQ = hub.isHQ;
      const isJV = hub.isJV;
      const accentColor = isHQ ? '#f4f7fa' : (isJV ? '#ffd166' : '#00c2ff');

      // Clean rounded architectural pill
      const x = 6, y = 6, w = 408, h = 92, r = 8;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();

      ctx.fillStyle = 'rgba(4, 11, 24, 0.88)';
      ctx.fill();
      ctx.strokeStyle = isHQ ? 'rgba(244, 247, 250, 0.45)' : (isJV ? 'rgba(255, 209, 102, 0.5)' : 'rgba(0, 194, 255, 0.42)');
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Status indicator dot
      ctx.beginPath();
      ctx.arc(x + 22, y + 30, 5, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();

      // City Name
      ctx.font = '600 26px "Inter", "Segoe UI", sans-serif';
      ctx.fillStyle = '#f4f7fa';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(hub.city, x + 38, y + 31);

      // Role / Country & Coordinates
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.fillStyle = accentColor;
      const roleLabel = isHQ ? 'GLOBAL HQ' : (isJV ? 'JV OFFICE' : 'SUBSIDIARY');
      const latStr = `${Math.abs(hub.lat).toFixed(1)}°${hub.lat >= 0 ? 'N' : 'S'}`;
      const lonStr = `${Math.abs(hub.lon).toFixed(1)}°${hub.lon >= 0 ? 'E' : 'W'}`;
      ctx.fillText(`${roleLabel}  ·  ${hub.country.toUpperCase()}  ·  ${latStr}, ${lonStr}`, x + 22, y + 66);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(1.16, 0.29, 1);
      return sprite;
    };

    hubs.forEach((hub, idx) => {
      const pos = latLongToVector3(hub.lat, hub.lon, radius);

      const pinColor = hub.isHQ ? 0xf4f7fa : (hub.isJV ? 0xffd166 : 0x00c2ff);
      const ringColor = hub.isHQ ? 0x00c2ff : (hub.isJV ? 0xffd166 : 0x00c2ff);

      // Surface Pin Node
      const pinGeo = new THREE.SphereGeometry(hub.isHQ ? 0.08 : 0.055, 16, 16);
      const pinMat = new THREE.MeshBasicMaterial({ color: pinColor });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.copy(pos.clone().multiplyScalar(1.018));
      this.globeGroup.add(pinMesh);

      // 2-Segment Architectural Leader Line (surface -> radial elbow -> fanned label)
      const elbowPos = pos.clone().multiplyScalar(hub.radial);
      const labelPos = elbowPos.clone().add(new THREE.Vector3(hub.offset[0], hub.offset[1], hub.offset[2]));

      const stemGeo = new THREE.BufferGeometry().setFromPoints([pos, elbowPos, labelPos]);
      const stemMat = new THREE.LineBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: 0.55
      });
      const stemLine = new THREE.Line(stemGeo, stemMat);
      this.globeGroup.add(stemLine);

      // Radial Beacon Ring on Surface
      const ringGeo = new THREE.RingGeometry(0.06, 0.115, 28);
      const ringMat = new THREE.MeshBasicMaterial({
        color: ringColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(pos.clone().multiplyScalar(1.02));
      ringMesh.lookAt(pos.clone().multiplyScalar(2.0));
      this.globeGroup.add(ringMesh);

      // Minimalist Floating Executive Label
      const sprite = createCitySprite(hub);
      sprite.position.copy(labelPos);
      this.globeGroup.add(sprite);

      this.hubPins.push({
        index: idx,
        mesh: pinMesh,
        ring: ringMesh,
        stem: stemLine,
        sprite,
        isHQ: hub.isHQ,
        hub,
        worldPos: pos
      });

      // Curved Connection Arcs from UK HQ to each Hub
      if (!hub.isHQ) {
        const mid = pos.clone().add(hqPos).multiplyScalar(0.5);
        const distance = pos.distanceTo(hqPos);
        const arcAltitude = radius + Math.min(distance * 0.34, 1.05);
        mid.normalize().multiplyScalar(arcAltitude);

        const curve = new THREE.QuadraticBezierCurve3(hqPos, mid, pos);
        const curvePoints = curve.getPoints(44);
        const arcGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
        const arcMat = new THREE.LineBasicMaterial({
          color: 0x00c2ff,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending
        });
        const arcLine = new THREE.Line(arcGeo, arcMat);
        this.globeGroup.add(arcLine);

        const pulseGeo = new THREE.SphereGeometry(0.036, 10, 10);
        const pulseMat = new THREE.MeshBasicMaterial({
          color: 0xf4f7fa,
          blending: THREE.AdditiveBlending
        });
        const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
        this.globeGroup.add(pulseMesh);

        this.arcBeams.push({ curve, pulse: pulseMesh, progress: Math.random() });
      }
    });

    this.scene.add(this.globeGroup);
  }

  focusGlobeOnHub(lat, lon, hubIndex = -1) {
    if (!this.globeGroup) return;

    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const x = -(Math.sin(phi) * Math.cos(theta));
    const z = Math.sin(phi) * Math.sin(theta);

    const desiredY = Math.atan2(-x, z);
    const currentY = this.globeUserRotation.y;
    const deltaY = ((desiredY - currentY + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

    const desiredX = THREE.MathUtils.clamp((lat * Math.PI / 180) * 0.55, -0.45, 0.55);

    this.targetGlobeRotation = {
      x: desiredX,
      y: currentY + deltaY
    };
    this.globeVelocity = { x: 0, y: 0 };
    this.focusedHubIndex = hubIndex;
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const onPointerDown = (clientX, clientY) => {
      if (this.slideIndex !== 9 || !this.globeGroup) return;

      this.pointerNdc.x = (clientX / window.innerWidth) * 2 - 1;
      this.pointerNdc.y = -(clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.pointerNdc, this.camera);

      const intersects = this.raycaster.intersectObjects([this.earthMesh, this.atmoMesh].filter(Boolean), true);
      const isMobile = window.innerWidth <= 900;

      if (intersects.length > 0 || (isMobile && clientY > window.innerHeight * 0.35)) {
        this.isDraggingGlobe = true;
        this.targetGlobeRotation = null;
        this.previousPointerPosition = { x: clientX, y: clientY };
        this.globeVelocity = { x: 0, y: 0 };
        document.body.style.cursor = 'grabbing';
      }
    };

    const onPointerMove = (clientX, clientY) => {
      if (this.isDraggingGlobe && this.globeGroup) {
        const deltaX = clientX - this.previousPointerPosition.x;
        const deltaY = clientY - this.previousPointerPosition.y;

        const rotSpeed = 0.0065;
        this.globeUserRotation.y += deltaX * rotSpeed;
        this.globeUserRotation.x += deltaY * rotSpeed;
        this.globeUserRotation.x = Math.max(-0.8, Math.min(0.8, this.globeUserRotation.x));

        this.globeVelocity = {
          x: deltaY * rotSpeed * 0.25,
          y: deltaX * rotSpeed * 0.25
        };

        this.previousPointerPosition = { x: clientX, y: clientY };
        return;
      }

      this.mouse.targetX = (clientX / window.innerWidth) * 2 - 1;
      this.mouse.targetY = -(clientY / window.innerHeight) * 2 + 1;

      // Multi-Layer DOM Parallax (Foreground vs Middleground vs Deep Canvas)
      const activeContent = document.querySelector(".slide.active .slide-content-layer");
      if (activeContent) {
        const fgX = (clientX / window.innerWidth - 0.5) * 14;
        const fgY = (clientY / window.innerHeight - 0.5) * 8;
        activeContent.style.transform = `translate3d(${fgX}px, ${fgY}px, 0)`;
      }

      const activeCard = document.querySelector(".slide.active .middleground-card");
      if (activeCard) {
        const mgX = (clientX / window.innerWidth - 0.5) * -18;
        const mgY = (clientY / window.innerHeight - 0.5) * -12;
        activeCard.style.transform = `translate3d(${mgX}px, ${mgY}px, 0)`;
      }

      const activeMonumental = document.querySelector(".slide.active .monumental-bg-text");
      if (activeMonumental) {
        const bgX = (clientX / window.innerWidth - 0.5) * -48;
        const bgY = (clientY / window.innerHeight - 0.5) * -28;
        activeMonumental.style.transform = `translate(calc(-50% + ${bgX}px), calc(-50% + ${bgY}px))`;
      }
    };

    const onPointerUp = () => {
      if (this.isDraggingGlobe) {
        this.isDraggingGlobe = false;
        document.body.style.cursor = 'default';
      }
    };

    window.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onPointerUp);

    window.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0] && this.isDraggingGlobe) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', onPointerUp, { passive: true });
  }

  triggerSlideTransition(fromIdx, toIdx, direction, prevWord, nextWord, nextMeta, totalSlides) {
    if (this.compositor) {
      this.compositor.triggerTransition(fromIdx, toIdx, direction, prevWord);
      this.compositor.setSlideMetadata(toIdx, totalSlides, nextWord, nextMeta);
    }
  }

  setSlide(index, slideMeta = {}) {
    this.slideIndex = index;
    if (this.compositor) {
      this.compositor.setSlideMetadata(
        index,
        slideMeta.totalSlides || 13,
        slideMeta.bgWord,
        slideMeta.chapterMeta
      );
    }
    this.updateCameraForSlide();
  }

  setDetailMode(isOpen) {
    this.isDetailOpen = isOpen;
    this.updateCameraForSlide();
  }

  updateCameraForSlide() {
    const angle = (this.slideIndex / 13) * Math.PI * 0.85;
    const radius = 9.8;

    const targetX = Math.sin(angle) * 2.2;
    const targetY = Math.cos(angle * 1.4) * 1.0;
    const targetZ = radius;

    this.targetCameraLookAt.set(0, 0, 0);
    this.targetCameraPos.set(targetX, targetY, targetZ);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.time += 0.016;
    this.waterUniforms.u_time.value = this.time;

    // Smooth mouse lerp
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;
    this.waterUniforms.u_mouse.value.set(this.mouse.x, this.mouse.y);

    // Subtle caustic water plane visibility (stronger on analytical slides, subtle over PDF photography)
    if (this.waterMesh) {
      this.waterMesh.visible = (this.slideIndex !== 9);
    }

    // Dynamic Camera Parallax & Depth Transitions
    const camParallaxX = this.targetCameraPos.x + this.mouse.x * 0.55;
    const camParallaxY = this.targetCameraPos.y + this.mouse.y * 0.35;

    this.camera.position.x += (camParallaxX - this.camera.position.x) * 0.045;
    this.camera.position.y += (camParallaxY - this.camera.position.y) * 0.045;
    this.camera.position.z += (this.targetCameraPos.z - this.camera.position.z) * 0.045;

    this.currentLookAt.lerp(this.targetCameraLookAt, 0.045);
    this.camera.lookAt(this.currentLookAt);

    // Photorealistic Interactive Globe Animation & Target Focusing (Slide 10)
    if (this.globeGroup) {
      const isSlide10 = (this.slideIndex === 9);
      const targetScale = isSlide10 ? 1 : 0;
      this.globeGroup.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);

      if (this.isDraggingGlobe) {
        this.globeGroup.rotation.y = this.globeUserRotation.y;
        this.globeGroup.rotation.x = this.globeUserRotation.x;
      } else if (this.targetGlobeRotation) {
        this.globeUserRotation.y += (this.targetGlobeRotation.y - this.globeUserRotation.y) * 0.085;
        this.globeUserRotation.x += (this.targetGlobeRotation.x - this.globeUserRotation.x) * 0.085;
        if (Math.abs(this.targetGlobeRotation.y - this.globeUserRotation.y) < 0.002 &&
            Math.abs(this.targetGlobeRotation.x - this.globeUserRotation.x) < 0.002) {
          this.targetGlobeRotation = null;
        }
        this.globeGroup.rotation.y = this.globeUserRotation.y;
        this.globeGroup.rotation.x = this.globeUserRotation.x + this.mouse.y * 0.04;
      } else {
        this.globeUserRotation.y += this.globeVelocity.y + 0.0022;
        this.globeUserRotation.x += this.globeVelocity.x;
        this.globeVelocity.x *= 0.92;
        this.globeVelocity.y *= 0.92;

        this.globeGroup.rotation.y = this.globeUserRotation.y;
        this.globeGroup.rotation.x = this.globeUserRotation.x + this.mouse.y * 0.06;
      }

      if (this.cloudsMesh) {
        this.cloudsMesh.rotation.y += 0.0009;
      }

      const isMobile = window.innerWidth <= 900;
      const targetGlobeX = isMobile ? 0.0 : 3.85;
      const targetGlobeY = isMobile ? -2.2 : 0.0;
      const targetGlobeZ = isMobile ? 0.6 : 1.2;
      this.globeGroup.position.lerp(new THREE.Vector3(targetGlobeX, targetGlobeY, targetGlobeZ), 0.06);

      if (this.hubPins) {
        const camWorldPos = this.camera.position.clone();
        this.hubPins.forEach(item => {
          const isFocused = item.index === this.focusedHubIndex;
          const pulseAmp = isFocused ? 0.42 : 0.24;
          const s = (isFocused ? 1.25 : 1.0) + Math.sin(this.time * 3.8 + (item.isHQ ? 0 : 1.5)) * pulseAmp;
          item.ring.scale.set(s, s, s);
          item.mesh.scale.setScalar(isFocused ? 1.35 : 1.0);

          if (item.sprite && item.worldPos) {
            const pinWorldNormal = item.worldPos.clone().applyEuler(this.globeGroup.rotation).normalize();
            const viewDir = camWorldPos.clone().sub(this.globeGroup.position).normalize();
            const dot = pinWorldNormal.dot(viewDir);

            const opacity = THREE.MathUtils.clamp((dot - 0.05) * 4.0, 0.0, 1.0);
            item.sprite.material.opacity = opacity;
            item.sprite.visible = opacity > 0.02;
            item.stem.material.opacity = Math.max(0.15, opacity * 0.65);
          }
        });
      }

      if (this.arcBeams) {
        this.arcBeams.forEach(arc => {
          arc.progress += 0.007;
          if (arc.progress > 1.0) arc.progress = 0.0;
          const pt = arc.curve.getPointAt(arc.progress);
          arc.pulse.position.copy(pt);
        });
      }
    }

    // Render 4-Layer Canvas Compositing Frame synchronized with WebGL frame
    if (this.compositor) {
      if (this.compositor.hasHtmlInCanvas) {
        this.compositor.updateFrameInputs(this.time, this.mouse, this.slideIndex);
        this.compositor.requestRender();
      } else {
        this.compositor.renderCompositeFrame(this.time, this.mouse, this.slideIndex);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.HydroScene = HydroScene;
window.HydroCanvasCompositor = HydroCanvasCompositor;
