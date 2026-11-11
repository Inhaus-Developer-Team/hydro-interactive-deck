// Three.js 3D Multi-Layered Aquatic Engine
// Combines Background Caustics, Volumetric Water Surface, Floating Droplets, and Foreground Fluid Ribbons
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
    this.globeUserRotation = { x: 0.18, y: 0 };
    this.globeVelocity = { x: 0, y: 0 };
    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();

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
    // Default position (adjusted responsively in updateCameraForSlide)
    this.globeGroup.position.set(3.2, 0, 1.5);
    this.globeGroup.scale.set(0, 0, 0);

    const radius = 2.25;

    // 1. Authentic NASA Blue Marble Photorealistic Earth Mesh
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load('assets/images/earth_surface_realistic.jpg');
    earthTexture.colorSpace = THREE.SRGBColorSpace;
    earthTexture.wrapS = THREE.RepeatWrapping;
    earthTexture.wrapT = THREE.ClampToEdgeWrapping;

    // Specular ocean map for realistic sun gleam on water vs matte continents
    const specularTexture = textureLoader.load('assets/images/earth_specular.jpg');

    const earthGeo = new THREE.SphereGeometry(radius, 64, 64);
    // Note: No arbitrary rotateY, so UV u=0.5 directly matches prime meridian (Lon 0)

    const earthMat = new THREE.MeshPhongMaterial({
      map: earthTexture,
      specularMap: specularTexture,
      specular: new THREE.Color(0x226688),
      shininess: 25,
      bumpScale: 0.05
    });
    this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
    this.globeGroup.add(this.earthMesh);

    // 2. Translucent Dynamic Cloud Layer (Subtle, sheer whisps allowing continents to stay crisp)
    const cloudsTexture = textureLoader.load('assets/images/earth_clouds.jpg');
    const cloudsGeo = new THREE.SphereGeometry(radius * 1.012, 48, 48);
    const cloudsMat = new THREE.MeshStandardMaterial({
      alphaMap: cloudsTexture,
      transparent: true,
      opacity: 0.16, // Sheer, delicate whisps so continents, borders and cities remain completely vivid
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    this.globeGroup.add(this.cloudsMesh);

    // 3. Atmospheric Rayleigh Scattering Fresnel Shell
    const atmoGeo = new THREE.SphereGeometry(radius * 1.055, 48, 48);
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
          float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.4);
          vec3 atmoColor = vec3(0.05, 0.72, 1.0);
          gl_FragColor = vec4(atmoColor, fresnel * 0.85);
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

    // 4. Exact Geographic Coordinates Conversion for Three.js UV Spherical Coordinates:
    // Equirectangular mapping in Three.js:
    // phi: 0 at North Pole (+90 lat) to PI at South Pole (-90 lat)
    // theta: longitude in radians mapped with offset so Prime Meridian (lon 0) aligns with vertex normal
    const latLongToVector3 = (lat, lon, r) => {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      return new THREE.Vector3(
        -(r * Math.sin(phi) * Math.cos(theta)),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    };

    // Real verified operating cities and official subsidiaries of Hydro Industries:
    const hubs = [
      { name: "UK Global HQ", city: "Llangennech / London", country: "United Kingdom", lat: 51.5074, lon: -0.1278, isHQ: true },
      { name: "Hydro Ecuador", city: "Quito", country: "Ecuador", lat: -0.1807, lon: -78.4678, isHQ: false },
      { name: "Hydro Colombia", city: "Bogotá", country: "Colombia", lat: 4.7110, lon: -74.0721, isHQ: false },
      { name: "Hydro Saudi Arabia", city: "Riyadh", country: "Saudi Arabia", lat: 24.7136, lon: 46.6753, isHQ: false },
      { name: "Hydro Egypt", city: "Cairo", country: "Egypt", lat: 30.0444, lon: 31.2357, isHQ: false },
      { name: "Hydro Regional Operations", city: "Manama", country: "Bahrain", lat: 26.2285, lon: 50.5860, isJV: true }
    ];

    const hqPos = latLongToVector3(51.5074, -0.1278, radius);
    this.hubPins = [];
    this.arcBeams = [];

    // Helper: Canvas Text Sprite Generator for 3D City Labels (Sci-fi HUD Data Tag Design)
    const createCitySprite = (hub) => {
      const canvas = document.createElement('canvas');
      canvas.width = 440;
      canvas.height = 140;
      const ctx = canvas.getContext('2d');

      const isHQ = hub.isHQ;
      const isJV = hub.isJV;
      const accentColor = isHQ ? '#ffffff' : (isJV ? '#ffd166' : '#00f0ff');
      const tagBg = isHQ ? 'rgba(0, 40, 95, 0.95)' : 'rgba(2, 12, 32, 0.92)';

      // 1. Futuristic Glass HUD Tag Body with Corner Chamfer
      const x = 14, y = 14, w = 412, h = 112, chamfer = 14;
      ctx.beginPath();
      ctx.moveTo(x + chamfer, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h - chamfer);
      ctx.lineTo(x + w - chamfer, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x, y + chamfer);
      ctx.closePath();

      ctx.fillStyle = tagBg;
      ctx.fill();

      // Border with Accent Color Glow
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = isHQ ? 3.5 : 2.5;
      ctx.stroke();

      // 2. Corner Bracket Detail (High-Tech Engineering Aesthetic)
      ctx.strokeStyle = isHQ ? '#ffd166' : '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y + 26);
      ctx.lineTo(x, y + chamfer);
      ctx.lineTo(x + chamfer, y);
      ctx.lineTo(x + 26, y);
      ctx.stroke();

      // 3. Category / Status Header
      ctx.font = '700 16px "JetBrains Mono", monospace';
      ctx.fillStyle = isHQ ? '#ffd166' : (isJV ? '#ffd166' : '#00d2ff');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const statusText = isHQ ? '★ GLOBAL HEADQUARTERS' : (isJV ? 'REGIONAL JV OFFICE' : 'WHOLLY OWNED SUBSIDIARY');
      ctx.fillText(statusText, x + 24, y + 20);

      // 4. Primary City Name (Large, crisp, high contrast)
      ctx.font = '800 32px "Inter", "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(hub.city.toUpperCase(), x + 24, y + 46);

      // 5. Geographic Coordinate & Country Tagline
      ctx.font = '500 16px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      const latStr = `${Math.abs(hub.lat).toFixed(1)}°${hub.lat >= 0 ? 'N' : 'S'}`;
      const lonStr = `${Math.abs(hub.lon).toFixed(1)}°${hub.lon >= 0 ? 'E' : 'W'}`;
      ctx.fillText(`${hub.country.toUpperCase()}  •  ${latStr}, ${lonStr}`, x + 24, y + 84);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(1.25, 0.40, 1);
      return sprite;
    };

    // Staggered Radial Heights for Labels to Prevent Overlap:
    // Cairo & Riyadh & Manama are geographically clustered in the Middle East.
    // Staggering their radial heights (1.20, 1.40, 1.62) completely eliminates 2D screen stacking.
    const labelAltitudeMap = {
      "UK Global HQ": 1.28,
      "Hydro Ecuador": 1.24,
      "Hydro Colombia": 1.48,
      "Hydro Egypt": 1.22,
      "Hydro Saudi Arabia": 1.46,
      "Hydro Regional Operations": 1.68
    };

    // Generate Pins, Stems, Pulsing Beacons, Text Sprites & Arcs
    hubs.forEach(hub => {
      const pos = latLongToVector3(hub.lat, hub.lon, radius);

      // Pin Color Palette: High Contrast vs Earth Blue/Green
      const pinColor = hub.isHQ ? 0xffffff : (hub.isJV ? 0xffd166 : 0x00f0ff);
      const ringColor = hub.isHQ ? 0x00e5ff : (hub.isJV ? 0xffaa00 : 0x00ffff);

      // Elevated Pin Head
      const pinGeo = new THREE.SphereGeometry(hub.isHQ ? 0.095 : 0.065, 18, 18);
      const pinMat = new THREE.MeshBasicMaterial({ color: pinColor });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.copy(pos.clone().multiplyScalar(1.022));
      this.globeGroup.add(pinMesh);

      // High-Tech Stalk / Beacon Stem extending from globe surface directly to label height
      const labelAltitude = labelAltitudeMap[hub.name] || 1.30;
      const labelPos = pos.clone().multiplyScalar(labelAltitude);

      const stemPoints = [pos, labelPos];
      const stemGeo = new THREE.BufferGeometry().setFromPoints(stemPoints);
      const stemMat = new THREE.LineBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: 0.65,
        linewidth: 2
      });
      this.globeGroup.add(new THREE.Line(stemGeo, stemMat));

      // Radial Glowing Pulse Ring at Ground Contact
      const ringGeo = new THREE.RingGeometry(0.07, 0.14, 28);
      const ringMat = new THREE.MeshBasicMaterial({
        color: ringColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(pos.clone().multiplyScalar(1.025));
      ringMesh.lookAt(pos.clone().multiplyScalar(2.0));
      this.globeGroup.add(ringMesh);

      // 3D Floating City Label Sprite
      const sprite = createCitySprite(hub);
      sprite.position.copy(labelPos);
      this.globeGroup.add(sprite);

      this.hubPins.push({ mesh: pinMesh, ring: ringMesh, sprite, isHQ: hub.isHQ, hub, worldPos: pos });

      // Curved Orbital Flight / Data Arcs from UK HQ to each Subsidiary
      if (!hub.isHQ) {
        const mid = pos.clone().add(hqPos).multiplyScalar(0.5);
        const distance = pos.distanceTo(hqPos);
        const arcAltitude = radius + Math.min(distance * 0.38, 1.15);
        mid.normalize().multiplyScalar(arcAltitude);

        const curve = new THREE.QuadraticBezierCurve3(hqPos, mid, pos);
        const curvePoints = curve.getPoints(44);
        const arcGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
        const arcMat = new THREE.LineBasicMaterial({
          color: 0x00e5ff,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending
        });
        const arcLine = new THREE.Line(arcGeo, arcMat);
        this.globeGroup.add(arcLine);

        // Travelling Light Packet along Arc
        const pulseGeo = new THREE.SphereGeometry(0.045, 12, 12);
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

    // Interactive Dragging / Orbiting for Globe (Slide 10)
    const onPointerDown = (clientX, clientY) => {
      if (this.slideIndex !== 9 || !this.globeGroup) return;

      this.pointerNdc.x = (clientX / window.innerWidth) * 2 - 1;
      this.pointerNdc.y = -(clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.pointerNdc, this.camera);

      // Check if clicking near or on the globe
      const intersects = this.raycaster.intersectObjects([this.earthMesh, this.atmoMesh].filter(Boolean), true);
      const isMobile = window.innerWidth <= 900;

      // On mobile or when pointer is on/near globe sphere, start drag
      if (intersects.length > 0 || (isMobile && clientY > window.innerHeight * 0.35)) {
        this.isDraggingGlobe = true;
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

        // Clamp vertical tilt to avoid flipping upside down
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

      // 3D Multi-Layer Parallax:
      // Foreground Content Layer
      const activeContent = document.querySelector(".slide.active .slide-content-layer");
      if (activeContent) {
        const fgX = (clientX / window.innerWidth - 0.5) * 18;
        const fgY = (clientY / window.innerHeight - 0.5) * 10;
        activeContent.style.transform = `translate3d(${fgX}px, ${fgY}px, 0)`;
      }

      // Middleground Cutout / Card
      const activeCard = document.querySelector(".slide.active .middleground-card");
      if (activeCard) {
        const mgX = (clientX / window.innerWidth - 0.5) * -22;
        const mgY = (clientY / window.innerHeight - 0.5) * -14;
        activeCard.style.transform = `translate3d(${mgX}px, ${mgY}px, 0)`;
      }

      // Deep Monumental Background Text
      const activeMonumental = document.querySelector(".slide.active .monumental-bg-text");
      if (activeMonumental) {
        const bgX = (clientX / window.innerWidth - 0.5) * -55;
        const bgY = (clientY / window.innerHeight - 0.5) * -32;
        activeMonumental.style.transform = `translate(calc(-50% + ${bgX}px), calc(-50% + ${bgY}px))`;
      }
    };

    const onPointerUp = () => {
      if (this.isDraggingGlobe) {
        this.isDraggingGlobe = false;
        document.body.style.cursor = 'default';
      }
    };

    // Mouse listeners
    window.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onPointerUp);

    // Touch listeners for mobile & tablet dragging
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
      
      // Smooth drag orbit physics & gentle continuous planetary spin
      if (this.isDraggingGlobe) {
        this.globeGroup.rotation.y = this.globeUserRotation.y;
        this.globeGroup.rotation.x = this.globeUserRotation.x;
      } else {
        // Inertia decay
        this.globeUserRotation.y += this.globeVelocity.y + 0.0035;
        this.globeUserRotation.x += this.globeVelocity.x;
        this.globeVelocity.x *= 0.92;
        this.globeVelocity.y *= 0.92;

        this.globeGroup.rotation.y = this.globeUserRotation.y;
        this.globeGroup.rotation.x = this.globeUserRotation.x + this.mouse.y * 0.08;
      }

      // Animate dynamic cloud drift layer slightly offset
      if (this.cloudsMesh) {
        this.cloudsMesh.rotation.y += 0.0012;
      }

      // Responsive positioning of globe on right-hand showcase stage
      const isMobile = window.innerWidth <= 900;
      const targetGlobeX = isMobile ? 0.0 : 3.85;
      const targetGlobeY = isMobile ? -2.2 : 0.0;
      const targetGlobeZ = isMobile ? 0.6 : 1.2;
      this.globeGroup.position.lerp(new THREE.Vector3(targetGlobeX, targetGlobeY, targetGlobeZ), 0.06);

      // Animate pulsing beacon rings and dynamic front/back label occlusion
      if (this.hubPins) {
        // Calculate camera forward direction in globe local space to fade back-facing labels
        const camWorldPos = this.camera.position.clone();
        this.hubPins.forEach(item => {
          const s = 1.0 + Math.sin(this.time * 4.0 + (item.isHQ ? 0 : 1.5)) * 0.28;
          item.ring.scale.set(s, s, s);

          if (item.sprite && item.worldPos) {
            // Transform world normal of city pin by current globe rotation
            const pinWorldNormal = item.worldPos.clone().applyEuler(this.globeGroup.rotation).normalize();
            const viewDir = camWorldPos.clone().sub(this.globeGroup.position).normalize();
            const dot = pinWorldNormal.dot(viewDir);

            // If city is on the visible front hemisphere (dot > 0.05), show label; if on backside, smoothly fade
            const opacity = THREE.MathUtils.clamp((dot - 0.05) * 4.0, 0.0, 1.0);
            item.sprite.material.opacity = opacity;
            item.sprite.visible = opacity > 0.02;
          }
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
