// Hydro Executive Interactive Presentation Controller
// Handles Navigation, Same-Document View Transitions, Conditional Popover Polyfill, Web Audio, & 3D Synchronization

// Mandatory feature detection for Popover API fallback
if (typeof HTMLElement !== "undefined" && !Object.hasOwn(HTMLElement.prototype, "popover")) {
  import("https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js").catch(() => {});
}

document.addEventListener("DOMContentLoaded", () => {
  const slides = document.querySelectorAll(".slide");
  const totalSlides = slides.length;
  let currentSlide = 0;

  // Parse initial slide and modal states from URL hash or query parameters
  const hashMatch = window.location.hash.match(/slide=(\d+)/);
  const searchMatch = window.location.search.match(/slide=(\d+)/);
  const detailParam = window.location.hash.includes("detail=1") || window.location.search.includes("detail=1");
  const gridParam = window.location.hash.includes("grid=1") || window.location.search.includes("grid=1");

  if (hashMatch) {
    const s = parseInt(hashMatch[1], 10);
    if (!Number.isNaN(s) && s >= 0 && s < totalSlides) currentSlide = s;
  } else if (searchMatch) {
    const s = parseInt(searchMatch[1], 10);
    if (!Number.isNaN(s) && s >= 0 && s < totalSlides) currentSlide = s;
  }

  let isDetailOpen = false;
  let isGridOpen = false;
  let isHelpOpen = false;
  let isScrolling = false;

  // Initialize 3D Aquatic Engine & HTML-in-Canvas Compositor
  const scene = new HydroScene("webgl-canvas");

  // Web Audio Synthesizer for Subtle Executive UI Feedback
  let audioCtx = null;
  let ambientGain = null;
  let isMuted = true;

  // --- Dual-Clip Cinematic Flight Background Controller ---
  const flightVidA = document.getElementById("flight-video-above");
  const flightVidB = document.getElementById("flight-video-under");
  const flightVideos = [flightVidA, flightVidB].filter(Boolean);
  const VIDEO_SEAM = 0.50;
  const SEAM_HALF_WIDTH = 0.05;

  let targetProgress = 0;
  let smoothedProgress = 0;

  flightVideos.forEach(v => {
    v.muted = true;
    v.playsInline = true;
    const nudge = () => {
      try {
        if (v.currentTime === 0) v.currentTime = 0.01;
      } catch (e) {}
    };
    if (v.readyState >= 1) nudge();
    else v.addEventListener("loadedmetadata", nudge, { once: true });
  });

  function getSlideProgress(slideIdx) {
    if (totalSlides <= 1) return 0;
    return Math.max(0, Math.min(slideIdx / (totalSlides - 1), 1));
  }

  function setFlightTargetProgress(prog) {
    targetProgress = Math.max(0, Math.min(prog, 1));
  }

  function updateFlightFrame() {
    const diff = targetProgress - smoothedProgress;
    if (Math.abs(diff) > 0.0005) {
      smoothedProgress += diff * 0.12;
    } else {
      smoothedProgress = targetProgress;
    }

    const q = smoothedProgress;
    let bMix = 0;
    if (q <= VIDEO_SEAM - SEAM_HALF_WIDTH) {
      bMix = 0;
    } else if (q >= VIDEO_SEAM + SEAM_HALF_WIDTH) {
      bMix = 1;
    } else {
      bMix = (q - (VIDEO_SEAM - SEAM_HALF_WIDTH)) / (2 * SEAM_HALF_WIDTH);
    }

    if (flightVidA) flightVidA.style.opacity = ((1 - bMix) * 0.55).toFixed(3);
    if (flightVidB) flightVidB.style.opacity = (bMix * 0.55).toFixed(3);

    if (flightVidA) {
      const want01A = Math.max(0, Math.min(q / VIDEO_SEAM, 1));
      const durA = flightVidA.duration;
      if (durA && Number.isFinite(durA)) {
        const wantA = want01A * durA;
        const nowA = flightVidA.currentTime;
        if (Math.abs(wantA - nowA) > 0.012) {
          try {
            flightVidA.currentTime = nowA + (wantA - nowA) * 0.26;
          } catch (e) {}
        }
      }
    }

    if (flightVidB) {
      const want01B = Math.max(0, Math.min((q - VIDEO_SEAM) / (1 - VIDEO_SEAM), 1));
      const durB = flightVidB.duration;
      if (durB && Number.isFinite(durB)) {
        const wantB = want01B * durB;
        const nowB = flightVidB.currentTime;
        if (Math.abs(wantB - nowB) > 0.012) {
          try {
            flightVidB.currentTime = nowB + (wantB - nowB) * 0.26;
          } catch (e) {}
        }
      }
    }

    requestAnimationFrame(updateFlightFrame);
  }
  requestAnimationFrame(updateFlightFrame);

  function initAudio() {
    if (audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();

      const bufferSize = audioCtx.sampleRate * 2;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.14;
      }

      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 260;

      ambientGain = audioCtx.createGain();
      ambientGain.gain.value = 0;

      whiteNoise.connect(filter);
      filter.connect(ambientGain);
      ambientGain.connect(audioCtx.destination);
      whiteNoise.start();
    } catch (e) {
      console.warn("Web Audio not supported or blocked", e);
    }
  }

  function playUiClick(freq = 520) {
    if (isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.09);
    } catch (e) {}
  }

  function hideControlsPopover() {
    const popover = document.getElementById("exec-controls-popover");
    if (!popover) return;
    try {
      if (typeof popover.hidePopover === "function" && popover.matches(":popover-open")) {
        popover.hidePopover();
      } else {
        popover.classList.remove(":popover-open");
      }
    } catch (e) {}
  }

  // Audio Toggle Button (inside controls popover)
  const audioBtn = document.getElementById("btn-audio-toggle");
  if (audioBtn) {
    audioBtn.addEventListener("click", () => {
      initAudio();
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      isMuted = !isMuted;
      if (ambientGain) {
        ambientGain.gain.setTargetAtTime(isMuted ? 0 : 0.035, audioCtx.currentTime, 0.5);
      }
      audioBtn.innerHTML = isMuted
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg> Sound: Off`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00c2ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> Sound: On`;
    });
  }

  // DOM Elements
  const currentNumEl = document.querySelector(".current-num");
  const totalNumEl = document.querySelector(".total-num");
  const progressFill = document.querySelector(".progress-fill");
  const scrubber = document.querySelector(".progress-scrubber");
  const prevBtn = document.getElementById("btn-prev");
  const nextBtn = document.getElementById("btn-next");
  const sectionTag = document.querySelector(".brand-section-tag");
  const drawer = document.getElementById("detail-drawer");
  const drawerCloseBtn = drawer ? drawer.querySelector(".drawer-close-btn") : null;
  const drawerTag = document.querySelector(".drawer-tag");
  const drawerTitle = document.querySelector(".drawer-title");
  const drawerBody = document.querySelector(".drawer-body");
  const gridModal = document.getElementById("grid-overview-modal");
  const gridBtn = document.getElementById("btn-grid-view");
  const headerBriefBtn = document.getElementById("btn-header-brief");
  const closeGridBtn = document.getElementById("btn-close-grid");
  const slidesMatrix = document.querySelector(".slides-matrix");

  if (totalNumEl) {
    totalNumEl.textContent = String(totalSlides).padStart(2, "0");
  }

  // Executive Briefing Drawer Content per Slide
  const detailData = {
    0: {
      tag: "Company Overview",
      title: "Water. Technology. Possibility.",
      body: `
        <p>Hydro Industries is a global leader in designing, constructing, installing, and operating high-performance modular water treatment solutions.</p>
        <div class="drawer-stats-grid">
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">2010</div>
            <div class="drawer-stat-label">Founded in Wales, UK</div>
          </div>
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">Global</div>
            <div class="drawer-stat-label">Multi-National Footprint</div>
          </div>
        </div>
        <p>From industrial effluent detox to community drinking water supply, Hydro applies proprietary patented electro-chemical processes to solve the toughest water challenges on earth.</p>
      `
    },
    1: {
      tag: "01 / Introduction",
      title: "Technology for a world of water.",
      body: `
        <p>Every industrial and municipal challenge has unique chemical and geological signatures. Hydro engineers end-to-end solutions that adapt modular process steps to exact client specifications.</p>
        <div class="drawer-stats-grid">
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">100%</div>
            <div class="drawer-stat-label">Custom Modular Architecture</div>
          </div>
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">Patented</div>
            <div class="drawer-stat-label">Proprietary Electro-Processes</div>
          </div>
        </div>
        <p>Our rapid-deployment units can be transported and commissioned anywhere in the world, operating reliably under extreme climatic conditions.</p>
      `
    },
    2: {
      tag: "02 / Capabilities",
      title: "Full Lifecycle: Design to Operation",
      body: `
        <p>Hydro provides complete end-to-end partnership across four unified phases:</p>
        <p><strong>01. Design:</strong> Custom chemical engineering, bench-scale testing, simulation, and CAD integration tailored to site conditions.</p>
        <p><strong>02. Construct:</strong> Precision manufacturing in controlled UK facilities with highest quality standards.</p>
        <p><strong>03. Install:</strong> Rapid on-site civil and electrical commissioning worldwide.</p>
        <p><strong>04. Operate:</strong> 24/7 telemetry monitoring, preventative servicing, and BOOT (Build-Own-Operate-Transfer) contracts.</p>
      `
    },
    3: {
      tag: "03 / Case Studies",
      title: "Proven Impact in Complex Environments",
      body: `
        <p>Our track record spans severe landfill leachates, legacy acid mine drainage, hyper-saline effluents, and heavy industrial wastewater.</p>
        <div class="drawer-stats-grid">
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">&gt;98%</div>
            <div class="drawer-stat-label">Heavy Metal Elimination</div>
          </div>
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">&gt;99%</div>
            <div class="drawer-stat-label">Runoff Turbidity Reduction</div>
          </div>
        </div>
        <p>Explore the following case studies across the Americas, Europe, and the Middle East to examine the exact measured performance.</p>
      `
    },
    4: {
      tag: "Case Study / Quito, Ecuador",
      title: "Protecting Andean River Basins",
      body: `
        <p><strong>Client:</strong> Municipality of Quito</p>
        <p><strong>The Challenge:</strong> Leachate from landfill sites represents one of the most toxic chemical cocktails: high BOD, COD, ammonia, and toxic heavy metals threatening local river networks.</p>
        <div class="drawer-stats-grid">
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">600–800</div>
            <div class="drawer-stat-label">Tonnes Leachate / Day</div>
          </div>
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">Q3 2024</div>
            <div class="drawer-stat-label">Commissioning Completed</div>
          </div>
        </div>
        <p>Hydro engineered a specialized multi-stage treatment plant that neutralizes toxic contaminants and safely returns clean water to the natural ecosystem.</p>
      `
    },
    5: {
      tag: "Case Study / Frongoch, Wales",
      title: "Remediating Historic Mine Drainage",
      body: `
        <p><strong>Partner:</strong> Natural Resources Wales</p>
        <p><strong>The Challenge:</strong> Over 1,300 abandoned metal mines across Wales discharge acidic, zinc- and lead-laden water into more than 200 kilometers of pristine rivers and streams.</p>
        <div class="drawer-stats-grid">
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">&gt;98%</div>
            <div class="drawer-stat-label">Metal Pollutants Removed</div>
          </div>
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">200+ km</div>
            <div class="drawer-stat-label">Protected River Systems</div>
          </div>
        </div>
        <p>Hydro applied its proprietary electro-coagulation technology at Frongoch, achieving over 98% reduction in dissolved metal ions with minimal sludge generation.</p>
      `
    },
    6: {
      tag: "Case Study / Roadbridge, South Wales",
      title: "Rapid Construction Runoff Clarification",
      body: `
        <p><strong>Site:</strong> Roadbridge Major Infrastructure, South Wales</p>
        <p><strong>The Challenge:</strong> Heavy rainfall on earthworks generated highly turbid construction runoff that exceeded regulatory thresholds set by the Environment Agency.</p>
        <div class="drawer-stats-grid">
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">828 → 5.91</div>
            <div class="drawer-stat-label">NTU Turbidity Reduction</div>
          </div>
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">&gt;99%</div>
            <div class="drawer-stat-label">Suspended Solids Clarification</div>
          </div>
        </div>
        <p>Four mobile Hydro Current treatment plants operated continuously on-site, successfully achieving compliance and enabling safe environmental discharge.</p>
      `
    },
    7: {
      tag: "04 / Treatment Performance",
      title: "Rigorous Chemical Verification",
      body: `
        <p>Measured analytical dataset comparing raw input versus discharge after Hydro electro-treatment against strict discharge standards (all values in mg/l):</p>
        <p>• <strong>COD:</strong> Reduced from 4,856 to 26 (Standard: 100)<br>
           • <strong>Oil &amp; Grease:</strong> Reduced from 300 to 2 (Standard: 15)<br>
           • <strong>TSS:</strong> Reduced from 250 to 3 (Standard: 60)<br>
           • <strong>BOD:</strong> Reduced from 2,050 to 8 (Standard: 60)<br>
           • <strong>Total Nitrogen:</strong> Reduced from 400 to 7 (Standard: 10)<br>
           • <strong>Ammonia:</strong> Reduced from 247 to 2 (Standard: 3)</p>
      `
    },
    8: {
      tag: "05 / Corporate Development",
      title: "Strategic Growth Roadmap",
      body: `
        <p>A history of continuous technological innovation and commercial expansion:</p>
        <p><strong>2010:</strong> Hydro founded in Wales, developing proprietary core electro-treatment intellectual property.<br>
           <strong>2018:</strong> Major BEE'AH wastewater recycling plant commissioned in Sharjah, UAE.<br>
           <strong>2024:</strong> Delivery and commissioning of the Quito Leachate Treatment Plant in Ecuador.<br>
           <strong>2025:</strong> Acquisition and integration of the JEMS Environmental specialist team.<br>
           <strong>2026:</strong> Expanded international deployments into Sucre, Montecristi, and Santa Cruz.</p>
      `
    },
    9: {
      tag: "06 / Group Structure",
      title: "Global Operations Architecture",
      body: `
        <p>Headquartered in the United Kingdom, Hydro operates through 100% wholly owned regional operating companies and strategic local joint ventures:</p>
        <div class="drawer-stats-grid">
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">UK</div>
            <div class="drawer-stat-label">Group Headquarters &amp; R&amp;D</div>
          </div>
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">MENA &amp; LatAm</div>
            <div class="drawer-stat-label">Active Operating Hubs</div>
          </div>
        </div>
        <p>Wholly owned subsidiaries in Ecuador, Colombia, Saudi Arabia, Egypt, and Hydro Environmental Limited, supported by a joint venture office in Bahrain.</p>
      `
    },
    10: {
      tag: "Case Study / BEE'AH, Sharjah",
      title: "Circular Water Economy in the Desert",
      body: `
        <p><strong>Partner:</strong> BEE'AH Group, Sharjah, UAE</p>
        <p><strong>Facility:</strong> Integrated Landfill Liquid Waste &amp; Industrial Effluent Reclamation Plant</p>
        <div class="drawer-stats-grid">
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">500 m³</div>
            <div class="drawer-stat-label">Daily Capacity</div>
          </div>
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">1.5M</div>
            <div class="drawer-stat-label">Tonnes Treated Since 2018</div>
          </div>
        </div>
        <p>This award-winning plant converts contaminated leachate and commercial waste into irrigation-grade water for municipal landscaping, conserving precious natural groundwater.</p>
      `
    },
    11: {
      tag: "07 / Technology Development",
      title: "Next-Gen Low-Energy Desalination",
      body: `
        <p>Traditional reverse osmosis desalination suffers from severe limitations: high electrical power draw and 50–60% brine waste rejected back into marine ecosystems.</p>
        <div class="drawer-stats-grid">
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">70%+</div>
            <div class="drawer-stat-label">Hydro Freshwater Recovery</div>
          </div>
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">-35%</div>
            <div class="drawer-stat-label">Reduced Brine Discharge</div>
          </div>
        </div>
        <p>Hydro's development pipeline integrates electro-chemical pre-conditioning, drastically lowering osmotic pressure requirements and membrane fouling.</p>
      `
    },
    12: {
      tag: "Case Study / Capestone Poultry, UK",
      title: "Closed-Loop Agricultural Water Reclamation",
      body: `
        <p><strong>Client:</strong> Capestone Organic Poultry, Wales, UK</p>
        <p><strong>Integrated Treatment Train:</strong> Screening → Dissolved Air Flotation (DAF) → Moving Bed Biofilm Reactor (MBBR) → Reverse Osmosis (RO) → UV Disinfection.</p>
        <div class="drawer-stats-grid">
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">70%</div>
            <div class="drawer-stat-label">Process Water Reused</div>
          </div>
          <div class="drawer-stat-card">
            <div class="drawer-stat-num">45 m³/h</div>
            <div class="drawer-stat-label">Output Capacity</div>
          </div>
        </div>
        <p>Built under a long-term operate &amp; maintain partnership, this plant reduces reliance on local aquifers while guaranteeing pathogen-free recycled water.</p>
      `
    }
  };

  function focusActiveSlideHeading() {
    const activeHeading = slides[currentSlide]?.querySelector(".slide-title-hero");
    if (activeHeading && typeof activeHeading.focus === "function") {
      activeHeading.focus({ preventScroll: true });
    }
  }

  function applySlideDOMUpdate(newIndex) {
    slides.forEach(s => s.classList.remove("active"));
    currentSlide = newIndex;
    const activeSlideEl = slides[currentSlide];
    activeSlideEl.classList.add("active");

    const bgWord = activeSlideEl.dataset.bgWord || "HYDRO";
    const chapterMeta = activeSlideEl.dataset.layerMeta || "COMPANY OVERVIEW";

    if (currentNumEl) {
      currentNumEl.textContent = String(currentSlide + 1).padStart(2, "0");
    }
    if (progressFill) {
      const progressPercent = ((currentSlide + 1) / totalSlides) * 100;
      progressFill.style.width = `${progressPercent}%`;
    }

    const slideCat = activeSlideEl.querySelector(".slide-category");
    if (sectionTag) {
      sectionTag.textContent = slideCat ? slideCat.textContent.trim() : "HYDRO INDUSTRIES";
    }

    try {
      history.replaceState(null, null, "#slide=" + newIndex);
    } catch (e) {}

    if (prevBtn) prevBtn.disabled = currentSlide === 0;
    if (nextBtn) nextBtn.disabled = currentSlide === totalSlides - 1;

    if (isDetailOpen) {
      closeDetail();
    }

    scene.setSlide(currentSlide, { totalSlides, bgWord, chapterMeta });
    if (typeof resetAutoplayProgress === "function") resetAutoplayProgress();

    setFlightTargetProgress(getSlideProgress(currentSlide));

    const ambientVid = document.getElementById("ambient-video-backdrop");
    if (ambientVid) {
      ambientVid.style.opacity = currentSlide === 0 ? "0.14" : "0.06";
    }

    if (currentSlide === 6) {
      const rawBar = document.querySelector(".bar-fill.raw");
      const treatedBar = document.querySelector(".bar-fill.treated");
      if (rawBar && treatedBar) {
        rawBar.style.width = "0%";
        treatedBar.style.width = "0%";
        setTimeout(() => {
          rawBar.style.width = "100%";
          treatedBar.style.width = "0.71%";
        }, 250);
      }
    }
  }

  function updateSlide(newIndex, animateTransition = true) {
    if (newIndex < 0 || newIndex >= totalSlides) return;

    const prevSlide = currentSlide;
    const direction = newIndex >= prevSlide ? 1 : -1;
    const prevWord = slides[prevSlide]?.dataset.bgWord || "HYDRO";
    const nextEl = slides[newIndex];
    const nextWord = nextEl?.dataset.bgWord || "HYDRO";
    const nextMeta = nextEl?.dataset.layerMeta || "COMPANY OVERVIEW";

    if (animateTransition && prevSlide !== newIndex) {
      playUiClick(440 + newIndex * 20);
      scene.triggerSlideTransition(prevSlide, newIndex, direction, prevWord, nextWord, nextMeta, totalSlides);
    }

    hideControlsPopover();

    const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animateTransition || prefersReducedMotion || !document.startViewTransition || prevSlide === newIndex) {
      applySlideDOMUpdate(newIndex);
      if (animateTransition) focusActiveSlideHeading();
      return;
    }

    const transition = document.startViewTransition(() => {
      applySlideDOMUpdate(newIndex);
    });
    transition.finished.finally(() => {
      focusActiveSlideHeading();
    });
  }

  function openDetail() {
    const data = detailData[currentSlide];
    if (!data || !drawer) return;

    hideControlsPopover();
    playUiClick(680);

    if (drawerTag) drawerTag.textContent = data.tag;
    if (drawerTitle) drawerTitle.textContent = data.title;
    if (drawerBody) drawerBody.innerHTML = data.body;
    drawer.classList.add("open");
    isDetailOpen = true;

    scene.setDetailMode(true);
  }

  function closeDetail() {
    if (!drawer) return;
    playUiClick(360);
    drawer.classList.remove("open");
    isDetailOpen = false;
    scene.setDetailMode(false);
  }

  // Interactive Performance Table Row Selection (Slide 08)
  const perfRows = document.querySelectorAll(".perf-table tbody tr");
  perfRows.forEach(row => {
    row.style.cursor = "pointer";
    row.addEventListener("click", () => {
      perfRows.forEach(r => { r.style.background = ""; });
      row.style.background = "rgba(0, 194, 255, 0.12)";
      const param = row.cells[0].textContent.trim();
      const inputVal = parseFloat(row.cells[1].textContent.replace(/,/g, ""));
      const treatedVal = parseFloat(row.cells[2].textContent.replace(/,/g, ""));
      const reduction = (((inputVal - treatedVal) / inputVal) * 100).toFixed(2);

      const noteEl = document.getElementById("perf-interactive-note");
      if (noteEl) {
        noteEl.innerHTML = `<span style="color: #00c2ff; font-weight: 600;">${param}</span>: <strong>${inputVal.toLocaleString()} mg/l</strong> reduced to <strong>${treatedVal} mg/l</strong> (<span style="color: #10b981; font-weight: 700;">-${reduction}% reduction</span>).`;
      }
      playUiClick(600);
    });
  });

  // Capestone Process Pipeline Chips (Slide 13)
  const processChips = document.querySelectorAll(".process-chip");
  const processDesc = document.getElementById("process-pipeline-desc");
  processChips.forEach(chip => {
    chip.addEventListener("click", () => {
      processChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      if (processDesc && chip.dataset.desc) {
        processDesc.textContent = chip.dataset.desc;
      }
      playUiClick(680);
    });
  });

  // Slide 10 Interactive Subsidiary Cards -> Smooth 3D Globe Hub Focus
  const hubItems = document.querySelectorAll(".hub-item[data-lat][data-lon]");
  hubItems.forEach(item => {
    const activateHub = (playAudio = true) => {
      hubItems.forEach(el => el.classList.remove("active-hub"));
      item.classList.add("active-hub");

      const lat = parseFloat(item.dataset.lat);
      const lon = parseFloat(item.dataset.lon);
      const hubIndex = parseInt(item.dataset.hubIndex, 10);
      if (!Number.isNaN(lat) && !Number.isNaN(lon) && typeof scene.focusGlobeOnHub === "function") {
        scene.focusGlobeOnHub(lat, lon, hubIndex);
      }
      if (playAudio) playUiClick(620);
    };

    item.addEventListener("click", () => activateHub(true));
    item.addEventListener("pointerenter", () => activateHub(false));
    item.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activateHub(true);
      }
    });
  });

  // Turbidity Clarification Interactive Slider (Slide 07)
  const turbiditySlider = document.getElementById("turbidity-slider");
  const sliderReadout = document.getElementById("slider-ntu-readout");
  const dynamicLiquid = document.getElementById("dynamic-beaker-liquid");

  if (turbiditySlider && sliderReadout && dynamicLiquid) {
    turbiditySlider.addEventListener("input", e => {
      const val = parseFloat(e.target.value);
      const ratio = val / 100;
      const currentNtu = (828 - ratio * (828 - 5.91)).toFixed(2);
      const reduction = (ratio * 99.28).toFixed(1);

      sliderReadout.textContent = `${currentNtu} NTU (${reduction}% reduction)`;
      turbiditySlider.setAttribute("aria-valuenow", String(Math.round(val)));

      const r = Math.round(185 * (1 - ratio));
      const g = Math.round(115 * (1 - ratio) + 194 * ratio);
      const b = Math.round(35 * (1 - ratio) + 255 * ratio);
      const alpha = 0.55 + (1 - ratio) * 0.35;

      dynamicLiquid.style.background = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      dynamicLiquid.style.boxShadow = `inset 0 0 14px rgba(${r}, ${g}, ${b}, 0.5)`;
    });
  }

  // Navigation & Drawer Listeners
  if (prevBtn) prevBtn.addEventListener("click", () => updateSlide(currentSlide - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => updateSlide(currentSlide + 1));

  if (scrubber) {
    scrubber.addEventListener("click", e => {
      const rect = scrubber.getBoundingClientRect();
      const clickRatio = (e.clientX - rect.left) / rect.width;
      const targetSlide = Math.floor(clickRatio * totalSlides);
      updateSlide(Math.min(Math.max(targetSlide, 0), totalSlides - 1));
    });
  }

  document.querySelectorAll(".btn-see-details").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      openDetail();
    });
  });

  if (headerBriefBtn) {
    headerBriefBtn.addEventListener("click", () => {
      if (isDetailOpen) closeDetail();
      else openDetail();
    });
  }

  if (drawerCloseBtn) {
    drawerCloseBtn.addEventListener("click", closeDetail);
  }

  // Slide Index Grid Modal
  function populateSlidesMatrix() {
    if (!slidesMatrix) return;
    slidesMatrix.innerHTML = "";
    slides.forEach((slide, idx) => {
      const card = document.createElement("div");
      card.className = `matrix-card ${idx === currentSlide ? "current" : ""}`;
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");

      const cat = slide.querySelector(".slide-category")?.textContent.trim() || `Slide ${idx + 1}`;
      const titleEl = slide.querySelector(".slide-title-hero");
      const title = titleEl ? titleEl.innerText.replace(/\n/g, " ") : `Slide ${idx + 1}`;

      card.innerHTML = `
        <div class="matrix-card-num">${String(idx + 1).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}</div>
        <div class="matrix-card-category">${cat}</div>
        <div class="matrix-card-title">${title}</div>
      `;

      const selectCard = () => {
        closeGrid();
        updateSlide(idx);
      };
      card.addEventListener("click", selectCard);
      card.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectCard();
        }
      });

      slidesMatrix.appendChild(card);
    });
  }

  function openGrid() {
    hideControlsPopover();
    populateSlidesMatrix();
    if (gridModal) gridModal.classList.add("open");
    isGridOpen = true;
    playUiClick(580);
  }

  function closeGrid() {
    if (gridModal) gridModal.classList.remove("open");
    isGridOpen = false;
    playUiClick(360);
  }

  function toggleGrid() {
    if (isGridOpen) closeGrid();
    else openGrid();
  }

  if (gridBtn) gridBtn.addEventListener("click", toggleGrid);
  if (closeGridBtn) closeGridBtn.addEventListener("click", closeGrid);

  // Help Shortcuts Modal
  const helpModal = document.getElementById("help-modal");
  const helpBtn = document.getElementById("btn-help");
  const closeHelpBtn = document.getElementById("btn-close-help");

  function openHelp() {
    hideControlsPopover();
    if (helpModal) {
      helpModal.classList.add("open");
      isHelpOpen = true;
      playUiClick(650);
    }
  }

  function closeHelp() {
    if (helpModal) {
      helpModal.classList.remove("open");
      isHelpOpen = false;
      playUiClick(360);
    }
  }

  function toggleHelp() {
    if (isHelpOpen) closeHelp();
    else openHelp();
  }

  if (helpBtn) helpBtn.addEventListener("click", toggleHelp);
  if (closeHelpBtn) closeHelpBtn.addEventListener("click", closeHelp);

  // Autoplay Presentation Walkthrough Mode
  let isAutoplay = false;
  let autoplayProgressTimer = null;
  const autoplayDuration = 8000;
  let autoplayStart = 0;
  const autoplayBtn = document.getElementById("btn-autoplay");
  const autoplayProgressBar = document.getElementById("autoplay-progress");

  function resetAutoplayProgress() {
    if (autoplayProgressBar) autoplayProgressBar.style.width = "0%";
    autoplayStart = Date.now();
  }

  function startAutoplay() {
    isAutoplay = true;
    if (autoplayBtn) {
      autoplayBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Auto: On`;
      autoplayBtn.style.color = "#10b981";
      autoplayBtn.style.borderColor = "rgba(16, 185, 129, 0.35)";
    }
    resetAutoplayProgress();
    runAutoplayStep();
  }

  function stopAutoplay() {
    isAutoplay = false;
    cancelAnimationFrame(autoplayProgressTimer);
    if (autoplayProgressBar) autoplayProgressBar.style.width = "0%";
    if (autoplayBtn) {
      autoplayBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Auto: Off`;
      autoplayBtn.style.color = "";
      autoplayBtn.style.borderColor = "";
    }
  }

  function toggleAutoplay() {
    if (isAutoplay) {
      stopAutoplay();
      playUiClick(360);
    } else {
      startAutoplay();
      playUiClick(650);
    }
  }

  function runAutoplayStep() {
    if (!isAutoplay) return;
    const elapsed = Date.now() - autoplayStart;
    const progress = Math.min((elapsed / autoplayDuration) * 100, 100);
    if (autoplayProgressBar) autoplayProgressBar.style.width = `${progress}%`;

    if (elapsed >= autoplayDuration) {
      if (!isDetailOpen && !isGridOpen && !isHelpOpen) {
        updateSlide((currentSlide + 1) % totalSlides);
      }
      resetAutoplayProgress();
    }
    autoplayProgressTimer = requestAnimationFrame(runAutoplayStep);
  }

  if (autoplayBtn) autoplayBtn.addEventListener("click", toggleAutoplay);

  // Fullscreen Toggle
  const fsBtn = document.getElementById("btn-fullscreen");
  if (fsBtn) {
    fsBtn.addEventListener("click", () => {
      hideControlsPopover();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  // Keyboard Navigation
  window.addEventListener("keydown", e => {
    if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !e.target.closest("button, [role='button'], summary, input"))) {
      e.preventDefault();
      updateSlide(currentSlide + 1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      updateSlide(currentSlide - 1);
    } else if (e.key === "Escape") {
      if (isGridOpen) closeGrid();
      if (isDetailOpen) closeDetail();
      if (isHelpOpen) closeHelp();
      hideControlsPopover();
    } else if (e.key === "a" || e.key === "A") {
      toggleAutoplay();
    } else if (e.key === "?" || e.key === "h" || e.key === "H") {
      toggleHelp();
    } else if (e.key === "p" || e.key === "P") {
      document.body.classList.toggle("presenter-mode");
      playUiClick(500);
    } else if (e.key === "f" || e.key === "F") {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
      playUiClick(550);
    } else if (e.key === "g" || e.key === "G") {
      toggleGrid();
    } else if (e.key === "d" || e.key === "D" || (e.key === "Enter" && !e.target.closest("button, [role='button'], summary, a"))) {
      if (isDetailOpen) closeDetail();
      else openDetail();
    }
  });

  // Mouse Wheel Navigation (Debounced)
  window.addEventListener("wheel", e => {
    if (isDetailOpen || isGridOpen || isHelpOpen) return;
    if (isScrolling) return;

    if (Math.abs(e.deltaY) > 35) {
      isScrolling = true;
      if (e.deltaY > 0) {
        updateSlide(currentSlide + 1);
      } else {
        updateSlide(currentSlide - 1);
      }
      setTimeout(() => {
        isScrolling = false;
      }, 700);
    }
  }, { passive: true });

  // Touch Swipe Navigation
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  window.addEventListener("touchstart", e => {
    if (e.touches && e.touches[0]) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }
  }, { passive: true });

  window.addEventListener("touchend", e => {
    if (isDetailOpen || isGridOpen || isHelpOpen) return;
    if (scene && scene.isDraggingGlobe) return;

    if (e.changedTouches && e.changedTouches[0]) {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchStartX - touchEndX;
      const diffY = touchStartY - touchEndY;
      const timeElapsed = Date.now() - touchStartTime;

      if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY) && timeElapsed < 600) {
        if (diffX > 0) updateSlide(currentSlide + 1);
        else updateSlide(currentSlide - 1);
      }
    }
  }, { passive: true });

  // Initial Slide Mount (without transition flicker)
  updateSlide(currentSlide, false);
  if (detailParam) {
    setTimeout(() => openDetail(), 150);
  }
  if (gridParam) {
    setTimeout(() => openGrid(), 150);
  }
});
