# Architecture & Technical Design Specification
## Hydro Interactive Presentation Deck

This document details the software architecture, WebGL rendering pipeline, coordinate transformations, and scroll choreography mechanics of the Hydro Interactive Deck.

---

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph Browser Engine
        DOM[HTML5 DOM Tree<br/>index.html]
        CSS[Fluid CSS System<br/>styles.css]
        VideoEngine[Dual-Clip Video Player<br/>Above & Submarine]
        WebGLEngine[Three.js Scene Graph<br/>scene3d.js]
        DeckState[State & Event Manager<br/>deck.js]
    end

    Input[User Input: Wheel / Touch / Keyboard] --> DeckState
    DeckState -->|Step Transition| DOM
    DeckState -->|Progress 0.0 - 1.0| VideoEngine
    DeckState -->|Slide Index & Detail Flag| WebGLEngine
    WebGLEngine --> Canvas[(#bg-canvas)]
    VideoEngine --> VideoA[(#flight-video-above)]
    VideoEngine --> VideoB[(#flight-video-under)]
    CSS --> DOM
```

---

## 2. Dual-Clip Continuous Flight Choreography

Inspired by the Marlin continuous scroll mechanism, the background comprises two synchronized 4K video clips that hand over at a seamless junction:

```mermaid
sequenceDiagram
    autonumber
    actor User as User Scrolling
    participant Deck as Deck Controller
    participant ClipA as Clip Above Water
    participant ClipB as Clip Underwater
    participant Scene as Three.js WebGL

    User->>Deck: Scroll Down (Slide 0 -> 12)
    Deck->>Deck: Calculate Global Progress P in [0.0, 1.0]
    
    alt Progress P < 0.50 (Aerial Phase)
        Deck->>ClipA: currentTime = (P / 0.50) * durationA
        Deck->>ClipA: style.opacity = 1.0
        Deck->>ClipB: style.opacity = 0.0
        Deck->>Scene: Camera elevated, caustics light
    else Progress P >= 0.50 (Submarine Phase)
        Deck->>ClipA: style.opacity = max(0, 1.0 - (P - 0.50) * 10)
        Deck->>ClipB: currentTime = ((P - 0.50) / 0.50) * durationB
        Deck->>ClipB: style.opacity = 1.0
        Deck->>Scene: Camera submerged, bubbles increase, caustics deep cyan
    end
```

---

## 3. WebGL Layer Architecture (`scene3d.js`)

```mermaid
classDiagram
    class HydroScene {
        +WebGLRenderer renderer
        +Scene scene
        +PerspectiveCamera camera
        +Mesh waterMesh
        +Mesh surfaceMesh
        +Points particles
        +Group globeGroup
        +Group reactorGroup
        +init()
        +initWaterShader()
        +initFloatingWaterSurface()
        +initBubbleParticles()
        +initGlobalPresenceGlobe()
        +initModularReactor()
        +setSlide(index)
        +setDetailMode(isOpen)
        +animate()
    }

    class EarthGlobeModule {
        +Mesh earthMesh
        +Mesh atmoMesh
        +Array hubPins
        +Array arcBeams
        +latLongToVector3(lat, lon, r)
        +animateBeacons()
        +animatePulseBeams()
    }

    class ReactorModule {
        +Mesh cylinderVessel
        +Array electrodeRods
        +Mesh plasmaCore
        +Array reactorRings
        +animateMagneticPulse()
    }

    HydroScene --> EarthGlobeModule : contains
    HydroScene --> ReactorModule : contains
```

### 3.1 Caustics Shader Formula
The background fluid simulation uses a custom GLSL fragment shader combining dual domain-warped sine waves:
$$\eta(x, y, t) = \sin(x \cdot 0.35 + t \cdot 0.8) \cos(y \cdot 0.28 + t \cdot 0.6) + \sin(x \cdot 0.9 - t \cdot 1.1) \cdot 0.15$$

### 3.2 Atmospheric Rayleigh Scattering (Fresnel Shell)
$$\text{Fresnel} = \left( 1.0 - \max\left( \vec{V} \cdot \vec{N}, 0.0 \right) \right)^{3.2}$$
where $\vec{V}$ is the camera view direction and $\vec{N}$ is the surface normal.

---

## 4. State Management & Navigation Engine (`deck.js`)

```mermaid
stateDiagram-v2
    [*] --> SlideOverview: Page Loaded
    SlideOverview --> SlideDetail: Click 'See Details' or Press 'D'
    SlideDetail --> SlideOverview: Press 'Escape' or Click Close
    SlideOverview --> MatrixGrid: Press 'G' or Click Grid Button
    MatrixGrid --> SlideOverview: Click Specific Thumbnail or Press 'Escape'
    SlideOverview --> NextSlide: Wheel Down / Key Right
    NextSlide --> SlideOverview
    SlideOverview --> PrevSlide: Wheel Up / Key Left
    PrevSlide --> SlideOverview
```

### Keyboard Shortcut Mapping

| Key Code | Target Action |
| :--- | :--- |
| `ArrowRight` / `ArrowDown` / `PageDown` / `Space` | Advance to next slide |
| `ArrowLeft` / `ArrowUp` / `PageUp` | Return to previous slide |
| `KeyD` | Toggle engineering deep-dive drawer |
| `KeyG` | Toggle thumbnail navigation matrix |
| `Escape` | Dismiss any open modal or drawer |
| `Home` / `End` | Jump to Cover (01) or Closing (13) |

---

## 5. Directory & Asset Mapping

```
hydro-interactive-deck/
├── assets/
│   ├── brand/
│   │   ├── hydro_logo_white.png       # Official white Hydro vector logo
│   │   └── hydro_logo_color.png       # Official dual-tone brand logo
│   ├── images/
│   │   ├── earth_surface_realistic.jpg# 2048x1024 high-res Earth texture
│   │   ├── beeah_plant.jpg            # BEE'AH Sharjah reference photography
│   │   ├── quito_plant.jpg            # Quito Leachate plant reference
│   │   ├── water_engineers.jpg        # Field engineers on-site
│   │   ├── equipment_skid.jpg         # Modular treatment skid rendering
│   │   └── water_monument_cutout.png  # Hero transparent cutout
│   └── videos/
│       ├── hydro_flight_above.mp4     # Aerial water flight clip
│       ├── hydro_flight_under.mp4     # Submarine water flight clip
│       └── hydro_ambient_water.mp4    # Ambient caustic loop
├── docs/
│   ├── architecture/TECHNICAL_SPEC.md # This architecture document
│   ├── guides/OPERATOR_MANUAL.md      # Presentation & deployment guide
│   └── specs/PRD.md                   # Product requirement document
├── index.html                         # Semantic 13-slide master layout
├── deck.js                            # Interactive slide & state choreography
├── scene3d.js                         # Three.js WebGL multi-layer engine
├── styles.css                         # CSS design system & responsive styling
├── README.md                          # Repository landing page
├── LLMS.txt                           # Machine-readable context for AI agents
└── .gitignore                         # Version control ignore rules
```
