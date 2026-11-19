"use client";

// EUM 3D SHOWROOM PRO — 실시간 Three.js 쇼룸 엔진
// SSR 충돌을 피하기 위해 클라이언트 전용 컴포넌트에서만 동적 import 된다.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { materialPreset } from "@/lib/constants";

export type EnginePart = {
  id: string;
  nodeName: string;
  name: string;
  partNumber: string | null;
  material: string;
  spec: string | null;
  weight: number | null;
  quantity: number;
  description: string | null;
  color: string;
  order: number;
  visible: boolean;
  opacity: number;
  center: [number, number, number];
  size: [number, number, number];
  exploded: [number, number, number];
  explodedDistance: number;
  moldRole: string | null;
  motionGroup: string | null;
};

export type EngineAnnotation = { id: string; title: string; body: string; x: number; y: number; z: number };

export type SequenceDef = {
  id: string;
  name: string;
  kind: string;
  durationMs: number;
  steps: { label: string; durationMs: number; actions: { part: number; to?: [number, number, number]; rotateTo?: [number, number, number]; spin?: [number, number, number]; opacityTo?: number }[] }[];
};

export type ThemeConfig = {
  background: string;
  accent: string;
  floorColor: string;
  envIntensity: number;
  keyLight: string;
  rimLight: string;
  exposure: number;
};

export type EngineOptions = {
  container: HTMLElement;
  modelUrl: string | null;
  parts: EnginePart[];
  annotations: EngineAnnotation[];
  theme: ThemeConfig;
  background: string;
  referenceImageUrl?: string | null;
  editable: boolean;
  onSelect?: (partId: string | null) => void;
  onAnnotationActivate?: (id: string) => void;
  onAnnotationCreate?: (position: [number, number, number]) => void;
  onPartMoved?: (partId: string, exploded: [number, number, number], distance: number) => void;
  onLoaded?: (partCount: number) => void;
  onError?: (message: string) => void;
};

type PartNode = {
  meta: EnginePart;
  group: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseCenter: THREE.Vector3;
  baseEmissive: THREE.Color;
  baseOpacity: number;
  color: THREE.Color;
  explodeVector: THREE.Vector3;
  animOffset: THREE.Vector3;
  animRotation: THREE.Euler;
  spinSpeed: THREE.Vector3;
  label?: THREE.Sprite;
};

const DEG = Math.PI / 180;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export class ShowroomEngine {
  private container: HTMLElement;
  private options: EngineOptions;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private persp: THREE.PerspectiveCamera;
  private ortho: THREE.OrthographicCamera;
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private controls: OrbitControls;
  private transform: TransformControls | null = null;
  private transformHelper: THREE.Object3D | null = null;
  private root = new THREE.Group();
  private parts = new Map<string, PartNode>();
  private partOrder: string[] = [];
  private selected: string | null = null;
  private highlightBox: THREE.Box3Helper;
  private floor: THREE.Mesh | null = null;
  private floorGrid: THREE.GridHelper | null = null;
  private keyLight: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private rimLight: THREE.SpotLight;
  private envTexture: THREE.Texture | null = null;
  private pmrem: THREE.PMREMGenerator;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private resizeObserver: ResizeObserver;
  private animationId = 0;
  private clock = new THREE.Clock();
  private disposed = false;

  private modelBox = new THREE.Box3();
  private modelCenter = new THREE.Vector3();
  private modelSize = new THREE.Vector3(1, 1, 1);
  private maxDim = 1;
  private built = false;

  private explodeT = 0;
  private xray = false;
  private labelsMode: "none" | "name" | "number" = "none";
  private annotationsVisible = true;
  private annotationSprites: { id: string; sprite: THREE.Sprite }[] = [];
  private annotationMode = false;

  private sequence: SequenceDef | null = null;
  private seqPlaying = false;
  private seqSpeed = 1;
  private seqTime = 0;
  private seqStepIndex = 0;
  private stepStart = new Map<string, { pos: THREE.Vector3; rot: THREE.Euler }>();
  private stepSpin = new Map<string, THREE.Vector3>();
  private onSeqUpdate: ((state: { playing: boolean; stepIndex: number; progress: number; time: number; duration: number }) => void) | null = null;

  private turntable = false;
  private turntableStart = 0;
  private turntableDuration = 8000;
  private recording: { recorder: MediaRecorder; chunks: Blob[]; mime: string } | null = null;
  private pointerDownAt = { x: 0, y: 0, t: 0 };
  private dragMode = false;
  private clipAxes: { x: number | null; y: number | null; z: number | null } = { x: null, y: null, z: null };
  private clipPlanes: Record<"x" | "y" | "z", THREE.Plane> = {
    x: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    y: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    z: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
  };
  private referenceTexture: THREE.Texture | null = null;

  constructor(options: EngineOptions) {
    this.options = options;
    this.container = options.container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.setAttribute("data-showroom-canvas", "true");
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(this.root);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.persp = new THREE.PerspectiveCamera(42, width / height, 0.01, 500);
    this.persp.position.set(2, 1.6, 2.4);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 500);
    this.ortho.position.set(2, 1.6, 2.4);
    this.camera = this.persp;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 80;
    this.controls.target.set(0, 0.3, 0);
    this.controls.addEventListener("start", () => {
      if (this.turntable) this.stopTurntable();
    });

    this.hemi = new THREE.HemisphereLight(0xdff2ff, 0x16202c, 0.9);
    this.scene.add(this.hemi);
    this.keyLight = new THREE.DirectionalLight(new THREE.Color(options.theme.keyLight), 2.4);
    this.keyLight.position.set(3, 5, 4);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 30;
    this.keyLight.shadow.camera.left = -5;
    this.keyLight.shadow.camera.right = 5;
    this.keyLight.shadow.camera.top = 5;
    this.keyLight.shadow.camera.bottom = -5;
    this.scene.add(this.keyLight);
    this.rimLight = new THREE.SpotLight(new THREE.Color(options.theme.rimLight), 60, 40, Math.PI / 5, 0.5, 1.2);
    this.rimLight.position.set(-4, 4, -5);
    this.scene.add(this.rimLight);

    this.highlightBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(options.theme.accent));
    this.highlightBox.visible = false;
    (this.highlightBox.material as THREE.LineBasicMaterial).depthTest = false;
    (this.highlightBox.material as THREE.LineBasicMaterial).transparent = true;
    (this.highlightBox.material as THREE.LineBasicMaterial).opacity = 0.9;
    this.scene.add(this.highlightBox);

    this.applyTheme(options.theme, options.background);
    this.setupEnvironment();

    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();

    if (options.modelUrl) this.loadModel(options.modelUrl);
    else this.buildEmpty();

    this.animate();
  }

  // ── 초기화 ────────────────────────────────────────────────
  private setupEnvironment(): void {
    try {
      const env = new RoomEnvironment();
      this.envTexture = this.pmrem.fromScene(env, 0.04).texture;
      this.scene.environment = this.envTexture;
      env.dispose();
    } catch {
      this.scene.environment = null;
    }
  }

  private applyTheme(theme: ThemeConfig, background: string): void {
    this.renderer.toneMappingExposure = theme.exposure;
    this.hemi.intensity = 0.55 + theme.envIntensity * 0.4;
    this.keyLight.color = new THREE.Color(theme.keyLight);
    this.keyLight.intensity = 1.9 + theme.envIntensity * 0.9;
    this.rimLight.color = new THREE.Color(theme.rimLight);
    this.setBackground(background, theme);
  }

  setTheme(theme: ThemeConfig, background: string): void {
    this.options.theme = theme;
    this.applyTheme(theme, background);
  }

  setBackground(background: string, theme?: ThemeConfig): void {
    const t = theme ?? this.options.theme;
    if (background === "TRANSPARENT") {
      this.scene.background = null;
      this.renderer.setClearColor(0x000000, 0);
    } else if (background === "WHITE") {
      this.scene.background = new THREE.Color("#eef2f6");
      this.renderer.setClearColor(0xeef2f6, 1);
      this.hemi.intensity = 1.15;
      this.keyLight.intensity = 2.2;
    } else if (background === "FACTORY") {
      this.scene.background = new THREE.Color("#1b2027");
      this.renderer.setClearColor(0x1b2027, 1);
      this.hemi.intensity = 0.7;
    } else {
      this.scene.background = new THREE.Color("#0a0f16");
      this.renderer.setClearColor(0x0a0f16, 1);
    }
    this.scene.fog = null;
    if (this.floor) {
      const mat = this.floor.material as THREE.MeshStandardMaterial;
      mat.color = new THREE.Color(background === "WHITE" ? "#e4e9ef" : t.floorColor);
      mat.roughness = background === "WHITE" ? 0.55 : 0.24;
      mat.metalness = background === "WHITE" ? 0.1 : 0.55;
    }
    if (this.floorGrid) {
      (this.floorGrid.material as THREE.Material).opacity = background === "WHITE" ? 0.18 : 0.22;
    }
    this.options.background = background;
    this.resize();
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.persp.aspect = width / height;
    this.persp.updateProjectionMatrix();
    const halfH = this.ortho.top;
    const aspect = width / height;
    this.ortho.left = -halfH * aspect;
    this.ortho.right = halfH * aspect;
    this.ortho.updateProjectionMatrix();
  }

  private buildEmpty(): void {
    this.buildFloor();
    this.built = true;
    this.options.onLoaded?.(0);
  }

  // ── 모델 로딩 ────────────────────────────────────────────
  private loadModel(url: string): void {
    this.buildFloor();
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (this.disposed) return;
        const metaByName = new Map<string, EnginePart>();
        for (const part of this.options.parts) metaByName.set(part.nodeName, part);
        const used = new Set<string>();
        const meshes: THREE.Mesh[] = [];
        const unmapped = this.options.parts.filter((p) => !used.has(p.id));
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
        });
        for (const object of meshes) {
          let meta = metaByName.get(object.name);
          if (!meta || used.has(meta.id)) {
            meta = unmapped.find((p) => !used.has(p.id));
          }
          if (!meta) continue;
          used.add(meta.id);
          this.mountPart(object, meta);
        }
        this.finishLoad();
      },
      undefined,
      (error) => {
        const message = error instanceof Error ? error.message : "모델을 불러오지 못했습니다.";
        this.options.onError?.(message);
        this.buildEmpty();
      },
    );
    if (this.options.referenceImageUrl) this.loadReferenceTexture(this.options.referenceImageUrl);
  }

  private loadReferenceTexture(url: string): void {
    new THREE.TextureLoader().load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      this.referenceTexture = texture;
      this.applyReferenceTexture();
    });
  }

  private applyReferenceTexture(): void {
    if (!this.referenceTexture) return;
    const texture = this.referenceTexture;
    for (const node of this.parts.values()) {
      if (node.meta.nodeName !== "DRAWING_PANEL") continue;
      const box = new THREE.Box3().setFromObject(node.mesh);
      const size = new THREE.Vector3();
      box.getSize(size);
      const image = texture.image as { width?: number; height?: number } | undefined;
      const aspect = image && image.height && image.width ? image.width / image.height : 1.414;
      const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
      node.mesh.material = material;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      plane.scale.set(size.x * 0.98, Math.min(size.y * 0.98, (size.x * 0.98) / aspect), 1);
      plane.position.set(0, 0, size.z / 2 + 0.001);
      node.group.add(plane);
    }
  }

  private mountPart(object: THREE.Mesh, meta: EnginePart): void {
    const geometry = object.geometry.clone();
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox ?? new THREE.Box3();
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    const preset = materialPreset(meta.material);
    const sourceMaterial = Array.isArray(object.material) ? object.material[0] : object.material;
    const baseColor = new THREE.Color(meta.color || preset.color);
    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      metalness: preset.metalness,
      roughness: preset.roughness,
      transparent: meta.opacity < 1,
      opacity: meta.opacity,
      envMapIntensity: 1.1,
      side: THREE.DoubleSide,
      flatShading: false,
    });
    if (sourceMaterial && "map" in sourceMaterial && (sourceMaterial as THREE.MeshStandardMaterial).map) {
      material.map = (sourceMaterial as THREE.MeshStandardMaterial).map;
    }
    material.emissive = new THREE.Color(0x000000);
    material.clippingPlanes = [];
    material.clipShadows = true;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.partId = meta.id;
    mesh.name = meta.nodeName;

    const group = new THREE.Group();
    group.name = `part-${meta.id}`;
    group.userData.partId = meta.id;
    group.position.copy(center);
    group.add(mesh);
    this.root.add(group);

    const node: PartNode = {
      meta,
      group,
      mesh,
      material,
      baseCenter: center.clone(),
      baseEmissive: new THREE.Color(0x000000),
      baseOpacity: meta.opacity,
      color: baseColor,
      explodeVector: new THREE.Vector3(...meta.exploded).normalize().multiplyScalar(meta.explodedDistance),
      animOffset: new THREE.Vector3(),
      animRotation: new THREE.Euler(),
      spinSpeed: new THREE.Vector3(),
    };
    this.parts.set(meta.id, node);
    this.partOrder.push(meta.id);
    group.visible = meta.visible;
  }

  private finishLoad(): void {
    this.visibleParts().forEach((node) => {
      node.mesh.updateMatrixWorld(true);
    });
    this.root.updateMatrixWorld(true);
    this.modelBox = new THREE.Box3().setFromObject(this.root);
    if (this.modelBox.isEmpty()) {
      this.modelBox.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
    }
    this.modelBox.getCenter(this.modelCenter);
    this.modelBox.getSize(this.modelSize);
    this.maxDim = Math.max(this.modelSize.x, this.modelSize.y, this.modelSize.z, 0.05);
    this.buildFloor();
    this.frameModel(false);
    this.updateLabels();
    this.applyReferenceTexture();
    this.built = true;
    this.options.onLoaded?.(this.parts.size);
  }

  private buildFloor(): void {
    const size = Math.max(this.maxDim * 8, 4);
    if (this.floor) {
      this.scene.remove(this.floor);
      this.floor.geometry.dispose();
      (this.floor.material as THREE.Material).dispose();
    }
    if (this.floorGrid) {
      this.scene.remove(this.floorGrid);
      this.floorGrid.geometry.dispose();
    }
    const floorY = Number.isFinite(this.modelBox.min.y) ? this.modelBox.min.y - 0.002 : 0;
    const geometry = new THREE.CircleGeometry(size / 2, 96);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.options.background === "WHITE" ? "#e4e9ef" : this.options.theme.floorColor),
      roughness: this.options.background === "WHITE" ? 0.55 : 0.24,
      metalness: this.options.background === "WHITE" ? 0.1 : 0.55,
      transparent: this.options.background === "TRANSPARENT",
      opacity: this.options.background === "TRANSPARENT" ? 0.55 : 1,
      envMapIntensity: 0.8,
    });
    this.floor = new THREE.Mesh(geometry, material);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(this.modelCenter.x, floorY, this.modelCenter.z);
    this.floor.receiveShadow = true;
    this.floor.name = "showroom-floor";
    this.scene.add(this.floor);
    const grid = new THREE.GridHelper(size, 40, 0x2b3b4f, 0x1a2634);
    grid.position.set(this.modelCenter.x, floorY + 0.001, this.modelCenter.z);
    (grid.material as THREE.Material).opacity = this.options.background === "WHITE" ? 0.18 : 0.22;
    (grid.material as THREE.Material).transparent = true;
    this.floorGrid = grid;
    this.scene.add(grid);
    this.keyLight.position.set(this.modelCenter.x + this.maxDim * 1.6, this.modelBox.max.y + this.maxDim * 2.4, this.modelCenter.z + this.maxDim * 1.6);
    this.rimLight.position.set(this.modelCenter.x - this.maxDim * 2, this.modelBox.max.y + this.maxDim * 1.4, this.modelCenter.z - this.maxDim * 2);
    this.rimLight.target.position.copy(this.modelCenter);
    this.scene.add(this.rimLight.target);
    const shadowCam = this.keyLight.shadow.camera;
    const extent = this.maxDim * 2.4;
    shadowCam.left = -extent;
    shadowCam.right = extent;
    shadowCam.top = extent;
    shadowCam.bottom = -extent;
    shadowCam.near = 0.01;
    shadowCam.far = this.maxDim * 12;
    shadowCam.updateProjectionMatrix();
    this.applyPartPositions();
  }

  // ── 카메라 ───────────────────────────────────────────────
  frameModel(animate = true): void {
    const center = this.modelCenter.clone();
    const distance = Math.max(this.maxDim * 1.75, 0.35);
    const dir = new THREE.Vector3(0.82, 0.58, 1).normalize();
    const position = center.clone().add(dir.multiplyScalar(distance));
    this.setCamera(position, center, animate);
  }

  setCamera(position: THREE.Vector3, target: THREE.Vector3, animate = true): void {
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.updateProjectionMatrix();
    } else {
      this.updateOrthoFrustum();
    }
    if (!animate) this.controls.update();
  }

  view(direction: "front" | "back" | "left" | "right" | "top" | "bottom"): void {
    const center = this.modelCenter.clone();
    const d = Math.max(this.maxDim * 1.85, 0.4);
    const map: Record<string, THREE.Vector3> = {
      front: new THREE.Vector3(0, 0, 1),
      back: new THREE.Vector3(0, 0, -1),
      left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
      top: new THREE.Vector3(0, 1, 0.0001),
      bottom: new THREE.Vector3(0, -1, 0.0001),
    };
    const dir = map[direction] ?? map.front;
    this.setCamera(center.clone().add(dir.multiplyScalar(d)), center, false);
  }

  setProjection(mode: "perspective" | "orthographic"): void {
    if (mode === "orthographic") {
      this.syncOrthoFromPersp();
      this.camera = this.ortho;
    } else {
      this.camera = this.persp;
      this.persp.position.copy(this.ortho.position);
    }
    this.controls.object = this.camera;
    this.controls.update();
    if (this.transform) this.transform.camera = this.camera;
    this.resize();
  }

  private syncOrthoFromPersp(): void {
    const distance = this.ortho.position.distanceTo(this.controls.target);
    const height = 2 * distance * Math.tan(((this.persp.fov * DEG) / 2));
    const aspect = this.persp.aspect;
    this.ortho.left = (-height * aspect) / 2;
    this.ortho.right = (height * aspect) / 2;
    this.ortho.top = height / 2;
    this.ortho.bottom = -height / 2;
    this.ortho.position.copy(this.camera.position);
    this.ortho.quaternion.copy(this.camera.quaternion);
    this.ortho.zoom = 1;
    this.ortho.updateProjectionMatrix();
  }

  private updateOrthoFrustum(): void {
    const distance = this.ortho.position.distanceTo(this.controls.target);
    const height = 2 * distance * Math.tan(((this.persp.fov * DEG) / 2));
    const aspect = Math.max(1e-3, this.container.clientWidth / Math.max(1, this.container.clientHeight));
    this.ortho.top = height / 2;
    this.ortho.bottom = -height / 2;
    this.ortho.left = (-height * aspect) / 2;
    this.ortho.right = (height * aspect) / 2;
    this.ortho.updateProjectionMatrix();
  }

  getCameraState(): { position: [number, number, number]; target: [number, number, number] } {
    return {
      position: this.camera.position.toArray() as [number, number, number],
      target: this.controls.target.toArray() as [number, number, number],
    };
  }

  setCameraState(state: { position: [number, number, number]; target: [number, number, number] }): void {
    this.setCamera(new THREE.Vector3(...state.position), new THREE.Vector3(...state.target), false);
  }

  setAutoRotate(enabled: boolean, speed = 1.2): void {
    this.controls.autoRotate = enabled;
    this.controls.autoRotateSpeed = speed;
  }

  // ── 부품 조작 ─────────────────────────────────────────────
  visibleParts(): PartNode[] {
    return this.partOrder.map((id) => this.parts.get(id)).filter((n): n is PartNode => Boolean(n));
  }

  select(partId: string | null): void {
    if (this.selected && this.parts.has(this.selected)) {
      const prev = this.parts.get(this.selected)!;
      prev.material.emissive.copy(prev.baseEmissive);
      prev.material.emissiveIntensity = 1;
    }
    this.selected = partId;
    if (partId && this.parts.has(partId)) {
      const node = this.parts.get(partId)!;
      node.material.emissive = new THREE.Color(this.options.theme.accent);
      node.material.emissiveIntensity = 0.32;
      const box = new THREE.Box3().setFromObject(node.group);
      this.highlightBox.box.copy(box);
      this.highlightBox.visible = true;
    } else {
      this.highlightBox.visible = false;
    }
    this.options.onSelect?.(partId);
  }

  setVisible(partId: string, visible: boolean): void {
    const node = this.parts.get(partId);
    if (!node) return;
    node.group.visible = visible;
    node.meta.visible = visible;
    if (!visible && this.selected === partId) this.select(null);
  }

  isolate(partId: string | null): void {
    for (const node of this.parts.values()) {
      const visible = partId === null ? node.meta.visible : node.meta.id === partId;
      node.group.visible = visible;
    }
    if (partId) this.select(partId);
  }

  setExplode(t: number): void {
    this.explodeT = Math.max(0, Math.min(1, t));
    this.applyPartPositions();
    this.updateLabels();
  }

  setPartExplode(partId: string, dir: [number, number, number], distance: number): void {
    const node = this.parts.get(partId);
    if (!node) return;
    const vec = new THREE.Vector3(...dir);
    if (vec.lengthSq() < 1e-8) vec.set(0, 1, 0);
    node.explodeVector.copy(vec.normalize().multiplyScalar(distance));
    node.meta.exploded = vec.normalize().toArray() as [number, number, number];
    node.meta.explodedDistance = distance;
    this.applyPartPositions();
    this.updateLabels();
    if (this.selected === partId) {
      const box = new THREE.Box3().setFromObject(node.group);
      this.highlightBox.box.copy(box);
    }
  }

  private applyPartPositions(): void {
    const range = this.maxDim * 0.95;
    for (const node of this.parts.values()) {
      const explode = node.explodeVector.clone().multiplyScalar(this.explodeT * range);
      node.group.position.copy(node.baseCenter).add(explode).add(node.animOffset);
      node.group.rotation.copy(node.animRotation);
    }
    if (this.built) this.syncHighlight();
  }

  private syncHighlight(): void {
    if (!this.selected) return;
    const node = this.parts.get(this.selected);
    if (!node) return;
    const box = new THREE.Box3().setFromObject(node.group);
    this.highlightBox.box.copy(box);
  }

  setPartOpacity(partId: string, opacity: number): void {
    const node = this.parts.get(partId);
    if (!node) return;
    const value = Math.max(0, Math.min(1, opacity));
    node.meta.opacity = value;
    node.material.opacity = this.xray ? Math.min(value, 0.18) : value;
    node.material.transparent = node.material.opacity < 1;
    node.material.depthWrite = !this.xray && node.material.opacity >= 0.98;
    node.baseOpacity = value;
  }

  setXray(enabled: boolean): void {
    this.xray = enabled;
    for (const node of this.parts.values()) {
      if (enabled) {
        node.material.transparent = true;
        node.material.opacity = Math.min(node.baseOpacity, 0.18);
        node.material.depthWrite = false;
        node.material.side = THREE.DoubleSide;
      } else {
        node.material.opacity = node.baseOpacity;
        node.material.transparent = node.baseOpacity < 1;
        node.material.depthWrite = node.baseOpacity >= 0.98;
      }
    }
  }

  setWireframe(enabled: boolean): void {
    for (const node of this.parts.values()) node.material.wireframe = enabled;
  }

  setLabels(mode: "none" | "name" | "number"): void {
    this.labelsMode = mode;
    for (const node of this.parts.values()) {
      if (node.label) {
        node.group.remove(node.label);
        node.label.material.map?.dispose();
        node.label.material.dispose();
        node.label = undefined;
      }
    }
    this.updateLabels();
  }

  private makeLabelSprite(text: string, accent: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const scale = 2;
    const fontSize = 42;
    canvas.width = 512 * scale;
    canvas.height = 128 * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.font = `600 ${fontSize}px Pretendard, system-ui, sans-serif`;
    const width = Math.min(512, ctx.measureText(text).width + 48);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(7, 13, 22, 0.82)";
    const x = (512 - width) / 2;
    ctx.beginPath();
    ctx.roundRect(x, 24, width, 80, 18);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#eaf6ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 66);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(this.maxDim * 0.5, this.maxDim * 0.125, 1);
    sprite.userData.label = true;
    return sprite;
  }

  private updateLabels(): void {
    if (this.labelsMode === "none") return;
    for (const node of this.parts.values()) {
      if (!node.meta.visible) continue;
      const text = this.labelsMode === "number" ? node.meta.partNumber ?? node.meta.name : node.meta.name;
      if (!node.label) {
        node.label = this.makeLabelSprite(text.slice(0, 18), this.options.theme.accent);
        node.label.position.set(0, node.meta.size[1] / 2 + this.maxDim * 0.05, 0);
        node.group.add(node.label);
      }
    }
  }

  setClipping(axis: "x" | "y" | "z", value: number | null): void {
    this.clipAxes[axis] = value;
    const min = this.modelBox.min[axis];
    const max = this.modelBox.max[axis];
    const constant = min + (max - min) * (value ?? 1);
    this.clipPlanes[axis].constant = constant;
    const active: THREE.Plane[] = [];
    (["x", "y", "z"] as const).forEach((key) => {
      if (this.clipAxes[key] !== null) active.push(this.clipPlanes[key]);
    });
    for (const node of this.parts.values()) {
      node.material.clippingPlanes = active;
      node.material.needsUpdate = true;
    }
  }

  clearClipping(): void {
    this.clipAxes = { x: null, y: null, z: null };
    for (const node of this.parts.values()) {
      node.material.clippingPlanes = [];
      node.material.needsUpdate = true;
    }
  }

  // ── 부품 이동 (TransformControls) ────────────────────────
  setDragMode(enabled: boolean, partId?: string | null): void {
    this.dragMode = enabled;
    if (!this.transform) {
      this.transform = new TransformControls(this.camera, this.renderer.domElement);
      this.transform.setSize(0.9);
      this.transformHelper = this.transform.getHelper();
      this.scene.add(this.transformHelper);
      this.transform.addEventListener("dragging-changed", (event) => {
        const value = (event as unknown as { value: boolean }).value;
        this.controls.enabled = !value;
      });
      this.transform.addEventListener("objectChange", () => {
        const obj = this.transform?.object;
        if (!obj) return;
        const partIdValue = obj.userData.partId as string | undefined;
        if (!partIdValue) return;
        const node = this.parts.get(partIdValue);
        if (!node) return;
        const range = this.maxDim * 0.95;
        const offset = obj.position.clone().sub(node.baseCenter).sub(node.animOffset);
        const len = offset.length();
        const dir = len > 1e-6 ? offset.clone().normalize() : new THREE.Vector3(0, 1, 0);
        node.explodeVector.copy(dir.clone().multiplyScalar(len / Math.max(range, 1e-6)));
        node.meta.exploded = dir.toArray() as [number, number, number];
        node.meta.explodedDistance = len / Math.max(range, 1e-6);
        this.syncHighlight();
      });
      this.transform.addEventListener("mouseUp", () => {
        const obj = this.transform?.object;
        if (!obj) return;
        const partIdValue = obj.userData.partId as string | undefined;
        const node = partIdValue ? this.parts.get(partIdValue) : null;
        if (node) this.options.onPartMoved?.(node.meta.id, node.meta.exploded, node.meta.explodedDistance);
      });
    }
    if (enabled) {
      const id = partId ?? this.selected;
      const node = id ? this.parts.get(id) : null;
      if (node) {
        this.transform.attach(node.group);
        this.transform.setMode("translate");
        this.controls.enabled = true;
      }
    } else {
      this.transform.detach();
      this.controls.enabled = true;
    }
  }

  setAnnotationMode(enabled: boolean): void {
    this.annotationMode = enabled;
    this.renderer.domElement.style.cursor = enabled ? "crosshair" : "grab";
  }

  setAnnotationsVisible(visible: boolean): void {
    this.annotationsVisible = visible;
    for (const item of this.annotationSprites) item.sprite.visible = visible;
  }

  refreshAnnotations(annotations: EngineAnnotation[]): void {
    for (const item of this.annotationSprites) {
      this.scene.remove(item.sprite);
      item.sprite.material.map?.dispose();
      item.sprite.material.dispose();
    }
    this.annotationSprites = [];
    annotations.forEach((ann, index) => {
      const sprite = this.makeAnnotationSprite(index + 1);
      sprite.position.set(ann.x, ann.y, ann.z);
      sprite.userData.annotationId = ann.id;
      sprite.visible = this.annotationsVisible;
      this.scene.add(sprite);
      this.annotationSprites.push({ id: ann.id, sprite });
    });
  }

  private makeAnnotationSprite(num: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(64, 60, 40, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(45, 212, 191, 0.95)";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(4, 18, 26, 0.9)";
    ctx.stroke();
    ctx.fillStyle = "#04211d";
    ctx.font = "700 52px Pretendard, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(num), 64, 62);
    ctx.beginPath();
    ctx.moveTo(52, 92);
    ctx.lineTo(64, 120);
    ctx.lineTo(76, 92);
    ctx.fillStyle = "rgba(45, 212, 191, 0.95)";
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(this.maxDim * 0.12, this.maxDim * 0.12, 1);
    return sprite;
  }

  // ── 애니메이션 시퀀스 ────────────────────────────────────
  loadSequence(sequence: SequenceDef, onUpdate?: (state: { playing: boolean; stepIndex: number; progress: number; time: number; duration: number }) => void): void {
    this.stopSequence();
    this.sequence = sequence;
    this.onSeqUpdate = onUpdate ?? null;
    this.seqTime = 0;
    this.seqStepIndex = 0;
    this.resetAnimState();
    this.emitSeqState();
  }

  private resetAnimState(): void {
    for (const node of this.parts.values()) {
      node.animOffset.set(0, 0, 0);
      node.animRotation.set(0, 0, 0);
      node.spinSpeed.set(0, 0, 0);
    }
    this.applyPartPositions();
  }

  playSequence(): void {
    if (!this.sequence) return;
    if (this.seqTime >= this.sequence.durationMs) {
      this.seqTime = 0;
      this.seqStepIndex = 0;
      this.resetAnimState();
    }
    this.seqPlaying = true;
    this.captureStepStart(this.seqStepIndex);
    this.emitSeqState(true);
  }

  pauseSequence(): void {
    this.seqPlaying = false;
    this.emitSeqState(true);
  }

  stopSequence(): void {
    this.seqPlaying = false;
    this.sequence = null;
    this.seqTime = 0;
    this.resetAnimState();
  }

  setSequenceSpeed(speed: number): void {
    this.seqSpeed = Math.max(0.1, Math.min(4, speed));
  }

  seekStep(index: number): void {
    if (!this.sequence) return;
    const clamped = Math.max(0, Math.min(this.sequence.steps.length - 1, index));
    let time = 0;
    for (let i = 0; i < clamped; i++) time += this.sequence.steps[i].durationMs;
    // 이전 단계까지의 최종 상태를 즉시 적용
    this.seqTime = time;
    this.seqStepIndex = clamped;
    this.applySequenceStateInstant(time);
    this.captureStepStart(clamped);
    this.emitSeqState(true);
  }

  private stepAt(time: number): { index: number; localTime: number; stepStartTime: number } {
    if (!this.sequence) return { index: 0, localTime: 0, stepStartTime: 0 };
    let acc = 0;
    for (let i = 0; i < this.sequence.steps.length; i++) {
      const step = this.sequence.steps[i];
      if (time < acc + step.durationMs || i === this.sequence.steps.length - 1) {
        return { index: i, localTime: Math.min(step.durationMs, Math.max(0, time - acc)), stepStartTime: acc };
      }
      acc += step.durationMs;
    }
    return { index: 0, localTime: 0, stepStartTime: 0 };
  }

  private captureStepStart(stepIndex: number): void {
    if (!this.sequence) return;
    this.stepStart.clear();
    this.stepSpin.clear();
    for (const [id, node] of this.parts) {
      this.stepStart.set(id, { pos: node.animOffset.clone(), rot: node.animRotation.clone() });
    }
    const step = this.sequence.steps[stepIndex];
    if (step) {
      step.actions.forEach((action) => {
        if (action.spin) this.stepSpin.set(String(action.part), new THREE.Vector3(...action.spin));
      });
    }
  }

  private applySequenceStateInstant(time: number): void {
    if (!this.sequence) return;
    // 시퀀스 시작 상태에서 time 까지의 각 단계 최종 상태를 누적 적용
    let acc = 0;
    const state = new Map<string, { pos: THREE.Vector3; rot: THREE.Euler; opacity: number }>();
    for (const [id, node] of this.parts) state.set(id, { pos: new THREE.Vector3(), rot: new THREE.Euler(), opacity: node.baseOpacity });
    for (const step of this.sequence.steps) {
      if (time < acc) break;
      const local = Math.min(step.durationMs, Math.max(0, time - acc));
      const t = step.durationMs > 0 ? easeInOut(local / step.durationMs) : 1;
      for (const action of step.actions) {
        const id = this.partOrder[action.part];
        if (!id) continue;
        const s = state.get(id);
        if (!s) continue;
        if (action.to) s.pos.lerp(new THREE.Vector3(...action.to), t);
        if (action.rotateTo) {
          s.rot.set(
            s.rot.x + (action.rotateTo[0] * DEG - s.rot.x) * t,
            s.rot.y + (action.rotateTo[1] * DEG - s.rot.y) * t,
            s.rot.z + (action.rotateTo[2] * DEG - s.rot.z) * t,
          );
        }
        if (action.spin) {
          const seconds = local / 1000;
          s.rot.set(s.rot.x + action.spin[0] * DEG * seconds, s.rot.y + action.spin[1] * DEG * seconds, s.rot.z + action.spin[2] * DEG * seconds);
        }
        if (action.opacityTo !== undefined) s.opacity = action.opacityTo;
      }
      acc += step.durationMs;
    }
    for (const [id, node] of this.parts) {
      const s = state.get(id);
      if (!s) continue;
      node.animOffset.copy(s.pos);
      node.animRotation.copy(s.rot);
      node.material.opacity = s.opacity;
      node.material.transparent = s.opacity < 1;
    }
    this.applyPartPositions();
  }

  private tickSequence(deltaMs: number): void {
    if (!this.sequence || !this.seqPlaying) return;
    this.seqTime += deltaMs * this.seqSpeed;
    if (this.seqTime >= this.sequence.durationMs) {
      this.seqTime = this.sequence.durationMs;
      this.seqPlaying = false;
    }
    const { index, localTime } = this.stepAt(this.seqTime);
    if (index !== this.seqStepIndex) {
      this.seqStepIndex = index;
      this.captureStepStart(index);
    }
    const step = this.sequence.steps[index];
    if (!step) return;
    const t = step.durationMs > 0 ? easeInOut(localTime / step.durationMs) : 1;
    const start = this.stepStart;
    for (const action of step.actions) {
      const id = this.partOrder[action.part];
      if (!id) continue;
      const node = this.parts.get(id);
      const from = start.get(id);
      if (!node || !from) continue;
      if (action.to) {
        node.animOffset.copy(from.pos).lerp(new THREE.Vector3(...action.to), t);
      }
      if (action.rotateTo) {
        const target = new THREE.Euler(action.rotateTo[0] * DEG, action.rotateTo[1] * DEG, action.rotateTo[2] * DEG);
        node.animRotation.set(
          from.rot.x + (target.x - from.rot.x) * t,
          from.rot.y + (target.y - from.rot.y) * t,
          from.rot.z + (target.z - from.rot.z) * t,
        );
      }
      if (action.spin) {
        const seconds = localTime / 1000;
        node.animRotation.set(
          from.rot.x + action.spin[0] * DEG * seconds,
          from.rot.y + action.spin[1] * DEG * seconds,
          from.rot.z + action.spin[2] * DEG * seconds,
        );
      }
      if (action.opacityTo !== undefined) {
        node.material.opacity = node.baseOpacity + (action.opacityTo - node.baseOpacity) * t;
        node.material.transparent = node.material.opacity < 1;
      }
    }
    this.applyPartPositions();
    this.emitSeqState();
  }

  private lastSeqEmit = 0;

  private emitSeqState(force = false): void {
    if (!this.sequence || !this.onSeqUpdate) return;
    const now = performance.now();
    if (!force && this.seqPlaying && now - this.lastSeqEmit < 90) return;
    this.lastSeqEmit = now;
    this.onSeqUpdate({
      playing: this.seqPlaying,
      stepIndex: this.seqStepIndex,
      progress: this.sequence.durationMs > 0 ? this.seqTime / this.sequence.durationMs : 0,
      time: this.seqTime,
      duration: this.sequence.durationMs,
    });
  }

  // ── 턴테이블 / 녹화 / 캡처 ───────────────────────────────
  startTurntable(durationMs = 8000): void {
    this.turntable = true;
    this.turntableStart = performance.now();
    this.turntableDuration = Math.max(1500, durationMs);
    const degPerSec = 360 / (this.turntableDuration / 1000);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = (degPerSec * 60) / 360;
  }

  stopTurntable(): void {
    this.turntable = false;
    this.controls.autoRotate = false;
  }

  async startRecording(durationMs = 8000): Promise<{ blob: Blob; mime: string; extension: string }> {
    const canvas = this.renderer.domElement;
    const stream = canvas.captureStream(30);
    const candidates = [
      { mime: "video/mp4;codecs=avc1.42E01E", extension: "mp4" },
      { mime: "video/mp4", extension: "mp4" },
      { mime: "video/webm;codecs=vp9", extension: "webm" },
      { mime: "video/webm;codecs=vp8", extension: "webm" },
      { mime: "video/webm", extension: "webm" },
    ];
    const supported = candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) ?? candidates[candidates.length - 1];
    if (typeof MediaRecorder === "undefined") throw new Error("이 브라우저는 MediaRecorder 를 지원하지 않습니다.");
    const recorder = new MediaRecorder(stream, { mimeType: supported.mime, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    this.recording = { recorder, chunks, mime: supported.mime };
    this.startTurntable(durationMs);
    recorder.start(200);
    await new Promise((resolve) => setTimeout(resolve, durationMs + 300));
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: supported.mime }));
      recorder.stop();
    });
    this.stopTurntable();
    this.recording = null;
    return { blob, mime: supported.mime, extension: supported.extension };
  }

  captureImage(options: { width?: number; height?: number; transparent?: boolean; format?: "png" | "jpeg"; quality?: number } = {}): string {
    const width = options.width ?? 1920;
    const height = options.height ?? 1080;
    const prevSize = new THREE.Vector2();
    this.renderer.getSize(prevSize);
    const prevRatio = this.renderer.getPixelRatio();
    const prevBackground = this.scene.background;
    const prevFloorVisible = this.floor?.visible ?? true;
    const prevGridVisible = this.floorGrid?.visible ?? true;
    const prevAspect = this.persp.aspect;
    const prevOrtho = { l: this.ortho.left, r: this.ortho.right, t: this.ortho.top, b: this.ortho.bottom };

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.persp.aspect = width / height;
    this.persp.updateProjectionMatrix();
    const halfH = (this.ortho.top - this.ortho.bottom) / 2;
    this.ortho.left = -halfH * (width / height);
    this.ortho.right = halfH * (width / height);
    this.ortho.updateProjectionMatrix();
    if (options.transparent) {
      this.scene.background = null;
      this.renderer.setClearColor(0x000000, 0);
      if (this.floor) this.floor.visible = false;
      if (this.floorGrid) this.floorGrid.visible = false;
    }
    this.highlightBox.visible = false;
    this.renderer.render(this.scene, this.camera);
    const data = this.renderer.domElement.toDataURL(options.format === "jpeg" ? "image/jpeg" : "image/png", options.quality ?? 0.95);

    this.renderer.setPixelRatio(prevRatio);
    this.renderer.setSize(prevSize.x, prevSize.y, false);
    this.persp.aspect = prevAspect;
    this.persp.updateProjectionMatrix();
    this.ortho.left = prevOrtho.l;
    this.ortho.right = prevOrtho.r;
    this.ortho.top = prevOrtho.t;
    this.ortho.bottom = prevOrtho.b;
    this.ortho.updateProjectionMatrix();
    this.scene.background = prevBackground;
    if (prevBackground instanceof THREE.Color) this.renderer.setClearColor(prevBackground, 1);
    else this.renderer.setClearColor(0x000000, 0);
    if (this.floor) this.floor.visible = prevFloorVisible;
    if (this.floorGrid) this.floorGrid.visible = prevGridVisible;
    this.highlightBox.visible = Boolean(this.selected);
    if (this.selected) this.syncHighlight();
    return data;
  }

  fullscreen(): void {
    if (!document.fullscreenElement) {
      this.container.requestFullscreen().catch(() => null);
    } else {
      document.exitFullscreen().catch(() => null);
    }
  }

  // ── 이벤트 ───────────────────────────────────────────────
  private onPointerDown = (event: PointerEvent): void => {
    this.pointerDownAt = { x: event.clientX, y: event.clientY, t: performance.now() };
  };

  private onPointerUp = (event: PointerEvent): void => {
    const moved = Math.hypot(event.clientX - this.pointerDownAt.x, event.clientY - this.pointerDownAt.y);
    if (moved > 6) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const annotationHits = this.raycaster.intersectObjects(this.annotationSprites.map((a) => a.sprite), false);
    if (annotationHits.length > 0) {
      const id = annotationHits[0].object.userData.annotationId as string;
      if (id) this.options.onAnnotationActivate?.(id);
      return;
    }
    if (this.dragMode) return;
    const partMeshes = this.visibleParts().filter((n) => n.group.visible).map((n) => n.mesh);
    const hits = this.raycaster.intersectObjects(partMeshes, false);
    if (hits.length > 0) {
      const partId = hits[0].object.userData.partId as string | undefined;
      if (partId && this.options.onSelect) this.select(partId);
      if (this.annotationMode) {
        const point = hits[0].point;
        this.options.onAnnotationCreate?.([point.x, point.y, point.z]);
        this.annotationMode = false;
        this.renderer.domElement.style.cursor = "grab";
      }
    } else if (this.annotationMode && this.floor) {
      const floorHit = this.raycaster.intersectObject(this.floor, false);
      if (floorHit.length > 0) {
        const point = floorHit[0].point;
        this.options.onAnnotationCreate?.([point.x, point.y, point.z]);
      }
    } else {
      this.select(null);
    }
  };

  private animate = (): void => {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    if (this.seqPlaying) this.tickSequence(delta * 1000);
    if (this.turntable) {
      const elapsed = performance.now() - this.turntableStart;
      if (elapsed >= this.turntableDuration) this.stopTurntable();
    }
    this.controls.update();
    if (this.transform && this.transform.object) this.highlightBox.visible = false;
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.controls.dispose();
    if (this.transform) {
      this.transform.detach();
      this.transform.dispose();
      if (this.transformHelper) this.scene.remove(this.transformHelper);
    }
    for (const node of this.parts.values()) {
      node.mesh.geometry.dispose();
      node.material.dispose();
      if (node.label) {
        node.label.material.map?.dispose();
        node.label.material.dispose();
      }
    }
    for (const item of this.annotationSprites) {
      item.sprite.material.map?.dispose();
      item.sprite.material.dispose();
    }
    this.envTexture?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
