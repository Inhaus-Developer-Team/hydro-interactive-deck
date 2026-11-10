// Three.js 3D Multi-Layered Aquatic Engine
// Combines Background Caustics, Volumetric Water Surface, Floating Droplets, and Foreground Fluid Ribbons
class HydroScene {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.time = 0;
    this.slideIndex = 0;
    this.isDetailOpen = false;

    this.init();
    this.initWaterShader();
    this.initFloatingWaterSurface();
    this.initBubbleParticles();
    this.initGlobalPresenceGlobe();
    this.initModularReactor();
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020712);
    this.scene.fog = new THREE.FogExp2(0x020712, 0.04);

    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.targetCameraPos = new THREE.Vector3(0, 0, 10);
    this.targetCameraLookAt = new THREE.Vector3(0, 0, 0);
    this.currentLookAt = new THREE.Vector3(0, 0, 0);

    // Aquatic Lighting Setup
    const ambientLight = new THREE.AmbientLight(0x0a2245, 2.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00d2ff, 3.2);
    dirLight.position.set(6, 12, 8);
    this.scene.add(dirLight);

    const cyanPoint = new THREE.PointLight(0x00ffff, 4.5, 35);
    cyanPoint.position.set(-6, -2, 5);
    this.scene.add(cyanPoint);

    const bluePoint = new THREE.PointLight(0x0055ff, 3.5, 25);
    bluePoint.position.set(5, -4, 3);
    this.scene.add(bluePoint);
  }

  initWaterShader() {
    // Background Dynamic Simplex Caustic Plane
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
        
        float wave1 = snoise(vec3(pos.x * 0.2, pos.y * 0.2, u_time * 0.28)) * 0.9;
        float wave2 = snoise(vec3(pos.x * 0.45 + 4.0, pos.y * 0.45, u_time * 0.42)) * 0.45;
        
        float d = distance(pos.xy, u_mouse * 7.5);
        float mouseWave = sin(d * 2.2 - u_time * 3.8) * exp(-d * 0.35) * 0.65;

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
        vec3 deepAbyss = vec3(0.01, 0.04, 0.12);
        vec3 oceanBlue = vec3(0.03, 0.18, 0.46);
        vec3 causticCyan = vec3(0.0, 0.85, 1.0);
        vec3 causticHighlight = vec3(0.85, 0.97, 1.0);

        // Multi-frequency caustic calculation
        vec2 p = vUv * 9.0;
        float c = 1.0;
        for (int i = 0; i < 4; i++) {
          p += vec2(
            cos(p.y + u_time * 0.35 + float(i) * 1.4),
            sin(p.x + u_time * 0.35 + float(i) * 1.4)
          );
          c += 1.0 / length(vec2(
            sin(p.x) / sin(p.y + u_time * 0.18),
            cos(p.y) / cos(p.x + u_time * 0.18)
          ));
        }
        c = clamp(pow(c * 0.08, 2.4), 0.0, 1.6);

        float heightFactor = clamp((vPosition.z + 1.2) * 0.45, 0.0, 1.0);
        vec3 color = mix(deepAbyss, oceanBlue, heightFactor);
        color = mix(color, causticCyan, c * 0.62);
        color += causticHighlight * (c * 0.42);

        float dist = distance(vUv, vec2(0.5, 0.5));
        color *= smoothstep(0.98, 0.22, dist);

        gl_FragColor = vec4(color, 0.94);
      }
    `;

    this.waterUniforms = {
      u_time: { value: 0 },
      u_mouse: { value: new THREE.Vector2(0, 0) }
    };

    const geometry = new THREE.PlaneGeometry(42, 28, 140, 140);
    const material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: this.waterUniforms,
      transparent: true,
      depthWrite: false
    });

    this.waterMesh = new THREE.Mesh(geometry, material);
    this.waterMesh.position.set(0, 0, -3);
    this.scene.add(this.waterMesh);
  }

  initFloatingWaterSurface() {
    // Middleground Floating Fluid Plane (Horizontal Water Plane at y = -2.2)
    // Giving visual depth beneath monumental typography
    const meshGeo = new THREE.PlaneGeometry(36, 18, 64, 48);
    meshGeo.rotateX(-Math.PI / 2.3);

    const surfaceShader = {
      vertexShader: `
        uniform float u_time;
        varying vec2 vUv;
        varying float vElevation;

        void main() {
          vUv = uv;
          vec3 pos = position;
          float wave = sin(pos.x * 0.5 + u_time * 1.2) * cos(pos.y * 0.4 + u_time * 0.9) * 0.35;
          wave += sin(pos.x * 1.2 - u_time * 1.8) * 0.12;
          pos.z += wave;
          vElevation = wave;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float u_time;
        varying vec2 vUv;
        varying float vElevation;

        void main() {
          vec3 shallow = vec3(0.0, 0.65, 0.95);
          vec3 deep = vec3(0.01, 0.08, 0.25);
          vec3 crest = vec3(0.7, 0.95, 1.0);

          float mixFactor = smoothstep(-0.3, 0.35, vElevation);
          vec3 col = mix(deep, shallow, mixFactor);
          if (vElevation > 0.25) {
            col = mix(col, crest, (vElevation - 0.25) * 4.0);
          }

          // Edge fade
          float alpha = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x) *
                        smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);

          gl_FragColor = vec4(col, alpha * 0.45);
        }
      `
    };

    this.surfaceUniforms = { u_time: { value: 0 } };
    const surfaceMat = new THREE.ShaderMaterial({
      vertexShader: surfaceShader.vertexShader,
      fragmentShader: surfaceShader.fragmentShader,
      uniforms: this.surfaceUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.surfaceMesh = new THREE.Mesh(meshGeo, surfaceMat);
    this.surfaceMesh.position.set(0, -2.5, 0);
    this.scene.add(this.surfaceMesh);
  }

  initBubbleParticles() {
    // Foreground & Middleground 3D Water Droplets / Bubbles
    const count = 350;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 32;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 22;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14 + 1.5; // Spread around camera and cards
      speeds[i] = Math.random() * 0.015 + 0.006;
      sizes[i] = Math.random() * 0.22 + 0.08;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const loader = new THREE.TextureLoader();
    const dropletTexture = loader.load('assets/images/water_droplet.png');

    const pMaterial = new THREE.PointsMaterial({
      color: 0x90e0ef,
      size: 0.35,
      map: dropletTexture,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.particles = new THREE.Points(geometry, pMaterial);
    this.scene.add(this.particles);
    this.particleSpeeds = speeds;
  }

  initGlobalPresenceGlobe() {
    // 3D Photorealistic Interactive Earth Globe for Slide 10 (Global Presence)
    this.globeGroup = new THREE.Group();
    this.globeGroup.position.set(3.2, 0, 1.5);
    this.globeGroup.scale.set(0, 0, 0);

    const radius = 2.25;

    // 1. Realistic Earth Spherical Mesh with High-Fidelity Continents Texture
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load('assets/images/earth_surface_realistic.jpg');
    earthTexture.colorSpace = THREE.SRGBColorSpace;
    earthTexture.wrapS = THREE.RepeatWrapping;
    earthTexture.wrapT = THREE.ClampToEdgeWrapping;

    const earthGeo = new THREE.SphereGeometry(radius, 64, 64);
    // Orient texture so prime meridian (0 lon) aligns with standard rotation
    earthGeo.rotateY(-Math.PI / 2);

    const earthMat = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.72,
      metalness: 0.18,
      bumpScale: 0.04
    });
    this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
    this.globeGroup.add(this.earthMesh);

    // 2. Atmospheric Fresnel Glow Shell
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
          float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.2);
          vec3 atmoColor = vec3(0.0, 0.78, 1.0);
          gl_FragColor = vec4(atmoColor, fresnel * 0.75);
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

    // 3. Exact Coordinate Converter for Three.js UV aligned sphere
    // phi: 0 at North Pole (+90 lat), PI at South Pole (-90 lat)
    // theta: longitude in radians
    const latLongToVector3 = (lat, lon, r) => {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      return new THREE.Vector3(
        -(r * Math.sin(phi) * Math.cos(theta)),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    };

    // Geographic Hubs (Hydro Group Entities)
    const hubs = [
      { name: "UK (HQ)", city: "London", lat: 51.5, lon: -0.12, isHQ: true },
      { name: "Ecuador", city: "Quito", lat: -0.18, lon: -78.46 },
      { name: "Colombia", city: "Bogotá", lat: 4.71, lon: -74.07 },
      { name: "Saudi Arabia", city: "Riyadh", lat: 24.71, lon: 46.67 },
      { name: "Egypt", city: "Cairo", lat: 30.04, lon: 31.23 },
      { name: "Bahrain", city: "Manama", lat: 26.22, lon: 50.58, isJV: true }
    ];

    const hqPos = latLongToVector3(51.5, -0.12, radius);
    this.hubPins = [];
    this.arcBeams = [];

    // Pin Beacon Creator
    hubs.forEach(hub => {
      const pos = latLongToVector3(hub.lat, hub.lon, radius);

      // Pin base anchor
      const pinColor = hub.isHQ ? 0xffffff : (hub.isJV ? 0x00f0ff : 0x00e5ff);
      const pinGeo = new THREE.SphereGeometry(hub.isHQ ? 0.08 : 0.05, 16, 16);
      const pinMat = new THREE.MeshBasicMaterial({ color: pinColor });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.copy(pos);
      this.globeGroup.add(pinMesh);

      // Glowing Pulsing Beacon Ring
      const ringGeo = new THREE.RingGeometry(0.06, 0.11, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: pinColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(pos.clone().multiplyScalar(1.015));
      ringMesh.lookAt(pos.clone().multiplyScalar(2.0));
      this.globeGroup.add(ringMesh);

      this.hubPins.push({ mesh: pinMesh, ring: ringMesh, isHQ: hub.isHQ, hub });

      // Curved Orbital Arcs from UK HQ to each global entity
      if (!hub.isHQ) {
        const mid = pos.clone().add(hqPos).multiplyScalar(0.5);
        const distance = pos.distanceTo(hqPos);
        const arcAltitude = radius + Math.min(distance * 0.42, 1.15);
        mid.normalize().multiplyScalar(arcAltitude);

        const curve = new THREE.QuadraticBezierCurve3(hqPos, mid, pos);
        const curvePoints = curve.getPoints(36);
        const arcGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
        const arcMat = new THREE.LineBasicMaterial({
          color: 0x00d2ff,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending
        });
        const arcLine = new THREE.Line(arcGeo, arcMat);
        this.globeGroup.add(arcLine);

        // Travelling light pulse packet along each arc
        const pulseGeo = new THREE.SphereGeometry(0.038, 10, 10);
        const pulseMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          blending: THREE.AdditiveBlending
        });
        const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
        this.globeGroup.add(pulseMesh);

        this.arcBeams.push({ curve, pulse: pulseMesh, progress: Math.random() });
      }
    });

    this.scene.add(this.globeGroup);
  }

  initModularReactor() {
    // 3D Modular Electro-Coagulation Treatment Reactor (Slide 02 & Slide 11)
    this.reactorGroup = new THREE.Group();
    this.reactorGroup.position.set(3.8, -0.1, 2.2);
    this.reactorGroup.scale.set(0, 0, 0);

    // 1. Outer Translucent Reaction Vessel with Cyan Edge Refraction
    const cylinderGeo = new THREE.CylinderGeometry(1.25, 1.25, 3.8, 36, 1, true);
    const cylinderMat = new THREE.MeshPhysicalMaterial({
      color: 0x00d2ff,
      transparent: true,
      opacity: 0.28,
      roughness: 0.1,
      metalness: 0.15,
      transmission: 0.6,
      ior: 1.333,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.reactorGroup.add(new THREE.Mesh(cylinderGeo, cylinderMat));

    // 2. Stainless Steel Upper & Lower Flanges
    const capGeo = new THREE.CylinderGeometry(1.35, 1.35, 0.18, 36);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x24334a,
      metalness: 0.9,
      roughness: 0.2
    });
    const topCap = new THREE.Mesh(capGeo, capMat);
    topCap.position.y = 1.95;
    this.reactorGroup.add(topCap);

    const bottomCap = new THREE.Mesh(capGeo, capMat);
    bottomCap.position.y = -1.95;
    this.reactorGroup.add(bottomCap);

    // 3. Central Electro-Coagulation Core (Active Anode & Cathode Rods)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const isAnode = (i % 2 === 0);
      const rodGeo = new THREE.CylinderGeometry(0.065, 0.065, 3.4, 16);
      const rodMat = new THREE.MeshStandardMaterial({
        color: isAnode ? 0x00f0ff : 0xd1d5db,
        metalness: 0.85,
        roughness: 0.25,
        emissive: isAnode ? 0x0088cc : 0x000000,
        emissiveIntensity: 0.45
      });
      const rod = new THREE.Mesh(rodGeo, rodMat);
      rod.position.set(Math.cos(angle) * 0.72, 0, Math.sin(angle) * 0.72);
      this.reactorGroup.add(rod);
    }

    // 4. Central Plasma Ion Discharge Core
    const coreGeo = new THREE.CylinderGeometry(0.18, 0.18, 3.3, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    this.reactorGroup.add(new THREE.Mesh(coreGeo, coreMat));

    // 5. Magnetic Clarification Pulse Rings
    this.reactorRings = [];
    for (let j = -2; j <= 2; j++) {
      const ringGeo = new THREE.TorusGeometry(1.32, 0.035, 12, 36);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = j * 0.7;
      this.reactorGroup.add(ring);
      this.reactorRings.push(ring);
    }

    this.scene.add(this.reactorGroup);
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('mousemove', (e) => {
      this.mouse.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.targetY = -(e.clientY / window.innerHeight) * 2 + 1;

      // 3D Multi-Layer Parallax:
      // Foreground Content Layer
      const activeContent = document.querySelector(".slide.active .slide-content-layer");
      if (activeContent) {
        const fgX = (e.clientX / window.innerWidth - 0.5) * 18;
        const fgY = (e.clientY / window.innerHeight - 0.5) * 10;
        activeContent.style.transform = `translate3d(${fgX}px, ${fgY}px, 0)`;
      }

      // Middleground Cutout / Card
      const activeCard = document.querySelector(".slide.active .middleground-card");
      if (activeCard) {
        const mgX = (e.clientX / window.innerWidth - 0.5) * -22;
        const mgY = (e.clientY / window.innerHeight - 0.5) * -14;
        activeCard.style.transform = `translate3d(${mgX}px, ${mgY}px, 0)`;
      }

      // Deep Monumental Background Text
      const activeMonumental = document.querySelector(".slide.active .monumental-bg-text");
      if (activeMonumental) {
        const bgX = (e.clientX / window.innerWidth - 0.5) * -55;
        const bgY = (e.clientY / window.innerHeight - 0.5) * -32;
        activeMonumental.style.transform = `translate(calc(-50% + ${bgX}px), calc(-50% + ${bgY}px))`;
      }
    });
  }

  setSlide(index) {
    this.slideIndex = index;
    this.updateCameraForSlide();
  }

  setDetailMode(isOpen) {
    this.isDetailOpen = isOpen;
    this.updateCameraForSlide();
  }

  updateCameraForSlide() {
    const angle = (this.slideIndex / 13) * Math.PI * 0.85;
    const radius = 9.8;
    
    let targetX = Math.sin(angle) * 2.8;
    let targetY = Math.cos(angle * 1.4) * 1.3;
    let targetZ = radius;

    if (this.isDetailOpen) {
      targetX = -3.4;
      targetY = 0.6;
      targetZ = 7.6;
      this.targetCameraLookAt.set(-1.1, 0, 0);
    } else {
      this.targetCameraLookAt.set(0, 0, 0);
    }

    this.targetCameraPos.set(targetX, targetY, targetZ);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.time += 0.016;
    this.waterUniforms.u_time.value = this.time;
    if (this.surfaceUniforms) {
      this.surfaceUniforms.u_time.value = this.time;
    }

    // Smooth mouse lerp
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;
    this.waterUniforms.u_mouse.value.set(this.mouse.x, this.mouse.y);

    // Dynamic Camera Parallax & Depth Transitions
    const camParallaxX = this.targetCameraPos.x + this.mouse.x * 0.75;
    const camParallaxY = this.targetCameraPos.y + this.mouse.y * 0.5;
    
    this.camera.position.x += (camParallaxX - this.camera.position.x) * 0.045;
    this.camera.position.y += (camParallaxY - this.camera.position.y) * 0.045;
    this.camera.position.z += (this.targetCameraPos.z - this.camera.position.z) * 0.045;

    this.currentLookAt.lerp(this.targetCameraLookAt, 0.045);
    this.camera.lookAt(this.currentLookAt);

    // Upward rising floating water bubbles simulation
    if (this.particles) {
      const posAttr = this.particles.geometry.attributes.position;
      const count = posAttr.count;
      for (let i = 0; i < count; i++) {
        let y = posAttr.getY(i);
        y += this.particleSpeeds[i];
        if (y > 11) y = -11;
        posAttr.setY(i, y);

        // Gentle horizontal oscillation
        let x = posAttr.getX(i);
        posAttr.setX(i, x + Math.sin(this.time * 2.0 + i) * 0.003);
      }
      posAttr.needsUpdate = true;
    }

    // Floating water surface wave tilt
    if (this.surfaceMesh) {
      this.surfaceMesh.rotation.z = Math.sin(this.time * 0.4) * 0.03 + this.mouse.x * 0.04;
    }

    // Globe Animation
    if (this.globeGroup) {
      const isSlide10 = (this.slideIndex === 9);
      const targetScale = isSlide10 ? 1 : 0;
      this.globeGroup.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);
      
      // Continuous gentle planetary spin
      this.globeGroup.rotation.y += 0.0055;
      this.globeGroup.rotation.x = 0.22 + this.mouse.y * 0.12;

      // Animate pulsing beacon rings
      if (this.hubPins) {
        this.hubPins.forEach(item => {
          const s = 1.0 + Math.sin(this.time * 4.0 + (item.isHQ ? 0 : 1.5)) * 0.28;
          item.ring.scale.set(s, s, s);
        });
      }

      // Animate orbital light packet pulses across arcs
      if (this.arcBeams) {
        this.arcBeams.forEach(arc => {
          arc.progress += 0.008;
          if (arc.progress > 1.0) arc.progress = 0.0;
          const pt = arc.curve.getPointAt(arc.progress);
          arc.pulse.position.copy(pt);
        });
      }
    }

    // Modular Reactor Animation
    if (this.reactorGroup) {
      const isReactorSlide = (this.slideIndex === 2 || this.slideIndex === 11);
      const targetScale = isReactorSlide ? 1 : 0;
      this.reactorGroup.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);
      this.reactorGroup.rotation.y += 0.012;
      this.reactorGroup.rotation.x = 0.15 + this.mouse.y * 0.08;
      if (this.reactorRings) {
        this.reactorRings.forEach((ring, idx) => {
          const pulse = 1 + Math.sin(this.time * 3.5 + idx * 0.8) * 0.05;
          ring.scale.set(pulse, pulse, pulse);
        });
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.HydroScene = HydroScene;
