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

  // Parse initial slide and grid modal state from URL hash or query parameters
  const hashMatch = window.location.hash.match(/slide=(\d+)/);
  const searchMatch = window.location.search.match(/slide=(\d+)/);
  const gridParam = window.location.hash.includes("grid=1") || window.location.search.includes("grid=1");

  if (hashMatch) {
    const s = parseInt(hashMatch[1], 10);
    if (!Number.isNaN(s) && s >= 0 && s < totalSlides) currentSlide = s;
  } else if (searchMatch) {
    const s = parseInt(searchMatch[1], 10);
    if (!Number.isNaN(s) && s >= 0 && s < totalSlides) currentSlide = s;
  }

  let isGridOpen = false;
  let isHelpOpen = false;
  let isScrolling = false;

  // Initialize 3D Stage & HTML-in-Canvas Compositor
  const scene = new HydroScene("webgl-canvas");

  // Web Audio Synthesizer for Subtle Executive UI Feedback
  let audioCtx = null;
  let ambientGain = null;
  let isMuted = true;

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
  const stageBackdrop = document.getElementById("slide-stage-backdrop");
  const currentNumEl = document.querySelector(".current-num");
  const totalNumEl = document.querySelector(".total-num");
  const progressFill = document.querySelector(".progress-fill");
  const scrubber = document.querySelector(".progress-scrubber");
  const prevBtn = document.getElementById("btn-prev");
  const nextBtn = document.getElementById("btn-next");
  const sectionTag = document.querySelector(".brand-section-tag");
  const gridModal = document.getElementById("grid-overview-modal");
  const gridBtn = document.getElementById("btn-grid-view");
  const closeGridBtn = document.getElementById("btn-close-grid");
  const slidesMatrix = document.querySelector(".slides-matrix");

  if (totalNumEl) {
    totalNumEl.textContent = String(totalSlides).padStart(2, "0");
  }

  function focusActiveSlideHeading() {
    const activeHeading = slides[currentSlide]?.querySelector(".slide-title-hero");
    if (activeHeading && typeof activeHeading.focus === "function") {
      activeHeading.focus({ preventScroll: true });
    }
  }

  function updateStageBackdrop(slideIdx, animateSettle = true) {
    if (!stageBackdrop) return;
    stageBackdrop.dataset.slideBg = String(slideIdx);
    stageBackdrop.classList.remove("stage-settling");
    if (animateSettle) {
      void stageBackdrop.offsetWidth;
      stageBackdrop.classList.add("stage-settling");
    }
  }

  function applySlideDOMUpdate(newIndex, animateBackdrop = true) {
    slides.forEach(s => s.classList.remove("active"));
    currentSlide = newIndex;
    const activeSlideEl = slides[currentSlide];
    activeSlideEl.classList.add("active");

    const bgWord = activeSlideEl.dataset.bgWord || "HYDRO";
    const chapterMeta = activeSlideEl.dataset.layerMeta || "COMPANY OVERVIEW";

    updateStageBackdrop(newIndex, animateBackdrop);

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

    scene.setSlide(currentSlide, { totalSlides, bgWord, chapterMeta });
    if (typeof resetAutoplayProgress === "function") resetAutoplayProgress();

    if (currentSlide === 6) {
      const rawBar = document.querySelector(".bar-fill.raw");
      const treatedBar = document.querySelector(".bar-fill.treated");
      if (rawBar && treatedBar) {
        rawBar.style.width = "0%";
        treatedBar.style.width = "0%";
        setTimeout(() => {
          rawBar.style.width = "100%";
          treatedBar.style.width = "0.71%";
        }, 260);
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
      applySlideDOMUpdate(newIndex, animateTransition);
      if (animateTransition) focusActiveSlideHeading();
      return;
    }

    const transition = document.startViewTransition(() => {
      applySlideDOMUpdate(newIndex, true);
    });
    transition.finished.finally(() => {
      focusActiveSlideHeading();
    });
  }

  // Slide 04 Interactive Case Study Preview Cards -> Direct Case Jump
  document.querySelectorAll(".case-preview-card[data-target-slide]").forEach(card => {
    card.addEventListener("click", () => {
      const target = parseInt(card.dataset.targetSlide, 10);
      if (!Number.isNaN(target)) {
        updateSlide(target);
      }
    });
  });

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
        noteEl.textContent = "";
        const paramSpan = document.createElement("span");
        paramSpan.style.color = "#00c2ff";
        paramSpan.style.fontWeight = "600";
        paramSpan.textContent = param;

        const sepText = document.createTextNode(": ");
        const inStrong = document.createElement("strong");
        inStrong.textContent = `${inputVal.toLocaleString()} mg/l`;

        const midText = document.createTextNode(" reduced to ");
        const outStrong = document.createElement("strong");
        outStrong.textContent = `${treatedVal} mg/l`;

        const openParen = document.createTextNode(" (");
        const redSpan = document.createElement("span");
        redSpan.style.color = "#10b981";
        redSpan.style.fontWeight = "700";
        redSpan.textContent = `-${reduction}% reduction`;

        const closeParen = document.createTextNode(").");
        noteEl.append(paramSpan, sepText, inStrong, midText, outStrong, openParen, redSpan, closeParen);
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

  // Slide 10 Interactive Subsidiary Cards -> Smooth 3D Globe Hub Focus + Inline Readout
  const hubItems = document.querySelectorAll(".hub-item[data-lat][data-lon]");
  const hubReadoutEl = document.getElementById("active-hub-readout");
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

      if (hubReadoutEl) {
        const roleEl = hubReadoutEl.querySelector(".hub-readout-role");
        const coordsEl = hubReadoutEl.querySelector(".hub-readout-coords");
        const entityEl = hubReadoutEl.querySelector(".hub-readout-entity");
        const scopeEl = hubReadoutEl.querySelector(".hub-readout-scope");

        const entityName = item.querySelector(".hub-name")?.textContent.trim() || "";
        const entityCountry = item.querySelector(".hub-country")?.textContent.trim() || "";
        const latStr = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`;
        const lonStr = `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;

        if (roleEl) roleEl.textContent = item.dataset.role || "Active Operating Entity";
        if (coordsEl) coordsEl.textContent = `${latStr}, ${lonStr}`;
        if (entityEl) entityEl.textContent = `${entityName} — ${entityCountry}`;
        if (scopeEl) scopeEl.textContent = item.dataset.scope || "";
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

  // Footer Navigation & Progress Scrubber
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

  // Slide Index Grid Modal
  function populateSlidesMatrix() {
    if (!slidesMatrix) return;
    slidesMatrix.textContent = "";
    slides.forEach((slide, idx) => {
      const card = document.createElement("div");
      card.className = `matrix-card ${idx === currentSlide ? "current" : ""}`;
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");

      const cat = slide.querySelector(".slide-category")?.textContent.trim() || `Slide ${idx + 1}`;
      const titleEl = slide.querySelector(".slide-title-hero");
      const title = titleEl ? titleEl.innerText.replace(/\n+/g, " ").trim() : `Slide ${idx + 1}`;

      const numEl = document.createElement("div");
      numEl.className = "matrix-card-num";
      numEl.textContent = `${String(idx + 1).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`;

      const catEl = document.createElement("div");
      catEl.className = "matrix-card-category";
      catEl.textContent = cat;

      const headingEl = document.createElement("div");
      headingEl.className = "matrix-card-title";
      headingEl.textContent = title;

      card.append(numEl, catEl, headingEl);

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
      if (!isGridOpen && !isHelpOpen) {
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
    }
  });

  // Mouse Wheel Navigation (Debounced)
  window.addEventListener("wheel", e => {
    if (isGridOpen || isHelpOpen) return;
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
    if (isGridOpen || isHelpOpen) return;
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
  if (gridParam) {
    setTimeout(() => openGrid(), 150);
  }
});
