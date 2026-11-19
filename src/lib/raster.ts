// 래스터 도면(PNG/JPG/TIFF, PDF 렌더 결과)을 서버에서 직접 디코딩·분석한다.
// 이미지마다 다른 결과가 나오도록 밝기·윤곽·색상 분포를 실제 픽셀에서 계산하고,
// 3D 릴리프(돌출) 메시를 만들 수 있는 사각형(run) 목록까지 뽑아 둔다.

import { createHash } from "node:crypto";
import sharp from "sharp";

export type RasterRect = {
  /** 그리드 열 시작(포함) */
  x0: number;
  /** 그리드 열 끝(미포함) */
  x1: number;
  /** 그리드 행 시작(포함) */
  y0: number;
  /** 그리드 행 끝(미포함) */
  y1: number;
  /** 잉크 강도 0..1 (배경과의 밝기 차이) */
  weight: number;
};

export type RasterComponent = {
  label: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  meanLuma: number;
  rects: RasterRect[];
};

export type RasterImage = {
  /** 분석 그리드 크기 */
  width: number;
  height: number;
  /** 원본 픽셀 크기 */
  sourceWidth: number;
  sourceHeight: number;
  gray: Uint8Array;
  inkRatio: number;
  backgroundLuma: number;
  meanLuma: number;
  /** 잉크가 배경보다 어두운지(일반 도면) 여부 */
  darkInk: boolean;
  threshold: number;
  /** 잉크(도면 선) 평균 색 */
  inkColor: [number, number, number];
  /** 배경 평균 색 */
  background: [number, number, number];
  /** 주요 형상 컴포넌트 (면적 내림차순) */
  components: RasterComponent[];
  /** 프레임(내용 외곽) 박스: 전체 셀 기준 */
  contentBox: { x0: number; y0: number; x1: number; y1: number } | null;
  signature: string;
  hasInk: boolean;
};

function toGray(rgb: Uint8Array, pixels: number): Uint8Array {
  const gray = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    gray[i] = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
  }
  return gray;
}

function otsu(gray: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]] += 1;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best;
}

/** 이미지를 분석용 그리드(최대 maxSide)로 디코딩하고 잉크 마스크·컴포넌트를 계산한다. */
export async function decodeRaster(buffer: Buffer, maxSide = 384): Promise<RasterImage> {
  const meta = await sharp(buffer, { failOn: "none", limitInputPixels: 268402689 }).metadata();
  const sourceWidth = meta.autoOrient?.width ?? meta.width ?? 0;
  const sourceHeight = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!sourceWidth || !sourceHeight) throw new Error("이미지 크기를 확인하지 못했습니다.");

  const { data, info } = await sharp(buffer, { failOn: "none", limitInputPixels: 268402689 })
    .rotate()
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .removeAlpha()
    .resize({ width: maxSide, height: maxSide, fit: "inside", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const pixels = width * height;
  const channels = info.channels;
  const rgb = new Uint8Array(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    const src = i * channels;
    rgb[i * 3] = data[src];
    rgb[i * 3 + 1] = data[src + (channels > 1 ? 1 : 0)];
    rgb[i * 3 + 2] = data[src + (channels > 2 ? 2 : 0)];
  }
  const gray = toGray(rgb, pixels);

  // 테두리 밝기로 배경/잉크 극성 판단 (흰 도면 vs. 검은 배경 도면)
  let borderSum = 0;
  let borderCount = 0;
  for (let x = 0; x < width; x++) {
    borderSum += gray[x] + gray[(height - 1) * width + x];
    borderCount += 2;
  }
  for (let y = 0; y < height; y++) {
    borderSum += gray[y * width] + gray[y * width + width - 1];
    borderCount += 2;
  }
  const backgroundLuma = Math.round(borderSum / Math.max(1, borderCount));
  const darkInk = backgroundLuma >= 128;
  const t = otsu(gray);
  const threshold = darkInk
    ? Math.max(24, Math.min(t, backgroundLuma - 24))
    : Math.min(232, Math.max(t, backgroundLuma + 24));

  const mask = new Uint8Array(pixels);
  let inkCount = 0;
  let meanSum = 0;
  let inkR = 0;
  let inkG = 0;
  let inkB = 0;
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (let i = 0; i < pixels; i++) {
    meanSum += gray[i];
    const isInk = darkInk ? gray[i] <= threshold : gray[i] >= threshold;
    if (isInk) {
      mask[i] = 1;
      inkCount += 1;
      inkR += rgb[i * 3];
      inkG += rgb[i * 3 + 1];
      inkB += rgb[i * 3 + 2];
    } else {
      bgR += rgb[i * 3];
      bgG += rgb[i * 3 + 1];
      bgB += rgb[i * 3 + 2];
    }
  }
  const bgCount = Math.max(1, pixels - inkCount);
  const background: [number, number, number] = [bgR / bgCount / 255, bgG / bgCount / 255, bgB / bgCount / 255];
  const inkColor: [number, number, number] = inkCount > 0 ? [inkR / inkCount / 255, inkG / inkCount / 255, inkB / inkCount / 255] : [0.2, 0.24, 0.3];

  // 연결 요소(잉크 덩어리) 라벨링 — 4-이웃
  const labels = new Int32Array(pixels);
  const areas: number[] = [0];
  const sums: number[] = [0];
  const minX: number[] = [0];
  const minY: number[] = [0];
  const maxX: number[] = [0];
  const maxY: number[] = [0];
  const stack: number[] = [];
  let label = 0;
  for (let start = 0; start < pixels; start++) {
    if (!mask[start] || labels[start] !== 0) continue;
    label += 1;
    labels[start] = label;
    areas.push(0);
    sums.push(0);
    minX.push(width);
    minY.push(height);
    maxX.push(-1);
    maxY.push(-1);
    stack.push(start);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const x = cur % width;
      const y = (cur - x) / width;
      areas[label] += 1;
      sums[label] += gray[cur];
      if (x < minX[label]) minX[label] = x;
      if (y < minY[label]) minY[label] = y;
      if (x > maxX[label]) maxX[label] = x;
      if (y > maxY[label]) maxY[label] = y;
      if (x + 1 < width && mask[cur + 1] && labels[cur + 1] === 0) {
        labels[cur + 1] = label;
        stack.push(cur + 1);
      }
      if (x > 0 && mask[cur - 1] && labels[cur - 1] === 0) {
        labels[cur - 1] = label;
        stack.push(cur - 1);
      }
      if (y + 1 < height && mask[cur + width] && labels[cur + width] === 0) {
        labels[cur + width] = label;
        stack.push(cur + width);
      }
      if (y > 0 && mask[cur - width] && labels[cur - width] === 0) {
        labels[cur - width] = label;
        stack.push(cur - width);
      }
    }
  }

  // 행 단위 run 을 세로로 병합해 사각형 목록으로 만든다 (라벨별).
  const rectsByLabel = new Map<number, RasterRect[]>();
  const open = new Map<string, RasterRect>();
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    let x = 0;
    const nextOpen = new Map<string, RasterRect>();
    while (x < width) {
      const lab = labels[rowStart + x];
      if (lab === 0) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < width && labels[rowStart + x] === lab) x += 1;
      const key = `${lab}:${start}:${x}`;
      const prev = open.get(key);
      if (prev) {
        prev.y1 = y + 1;
        nextOpen.set(key, prev);
      } else {
        const rect: RasterRect = { x0: start, x1: x, y0: y, y1: y + 1, weight: 0 };
        const list = rectsByLabel.get(lab) ?? [];
        list.push(rect);
        rectsByLabel.set(lab, list);
        nextOpen.set(key, rect);
      }
    }
    open.clear();
    for (const [key, rect] of nextOpen) open.set(key, rect);
  }
  for (const [lab, rects] of rectsByLabel) {
    for (const rect of rects) {
      let sum = 0;
      let count = 0;
      for (let y = rect.y0; y < rect.y1; y++) {
        for (let x = rect.x0; x < rect.x1; x++) {
          const idx = y * width + x;
          if (labels[idx] !== lab) continue;
          sum += gray[idx];
          count += 1;
        }
      }
      const mean = count > 0 ? sum / count : backgroundLuma;
      const delta = Math.abs(mean - backgroundLuma);
      rect.weight = Math.max(0.15, Math.min(1, delta / Math.max(1, darkInk ? backgroundLuma : 255 - backgroundLuma)));
    }
  }

  const components: RasterComponent[] = [];
  for (let lab = 1; lab <= label; lab++) {
    const area = areas[lab];
    if (area <= 0) continue;
    components.push({
      label: lab,
      area,
      minX: minX[lab],
      minY: minY[lab],
      maxX: maxX[lab],
      maxY: maxY[lab],
      meanLuma: sums[lab] / area,
      rects: rectsByLabel.get(lab) ?? [],
    });
  }
  components.sort((a, b) => b.area - a.area);

  const minArea = Math.max(3, Math.round(pixels * 0.00002));
  const kept = components.filter((c) => c.area >= minArea);
  const contentBox = kept.length > 0
    ? {
        x0: Math.min(...kept.map((c) => c.minX)),
        y0: Math.min(...kept.map((c) => c.minY)),
        x1: Math.max(...kept.map((c) => c.maxX)) + 1,
        y1: Math.max(...kept.map((c) => c.maxY)) + 1,
      }
    : null;

  const step = Math.max(1, Math.floor(Math.sqrt(pixels / 4096)));
  const sample: number[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) sample.push(gray[y * width + x]);
  }
  const signature = createHash("sha256")
    .update(Buffer.from(sample))
    .update(`${width}x${height}`)
    .digest("hex")
    .slice(0, 16);

  return {
    width,
    height,
    sourceWidth,
    sourceHeight,
    gray,
    inkRatio: inkCount / pixels,
    backgroundLuma,
    meanLuma: meanSum / pixels,
    darkInk,
    threshold,
    inkColor,
    background,
    components: kept,
    contentBox,
    signature,
    hasInk: kept.length > 0 && inkCount > 0,
  };
}

/** 참고 텍스처·미리보기용 PNG 로 정규화한다(회전 보정 + 흰 배경 + 크기 제한). */
export async function rasterPreviewPng(buffer: Buffer, maxSide = 1600): Promise<Buffer> {
  return sharp(buffer, { failOn: "none", limitInputPixels: 268402689 })
    .rotate()
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

/** 썸네일 임베드용 소형 JPEG */
export async function rasterThumbJpeg(buffer: Buffer, width = 640): Promise<Buffer> {
  return sharp(buffer, { failOn: "none", limitInputPixels: 268402689 })
    .rotate()
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .resize({ width, height: Math.round(width * 0.62), fit: "cover", position: "centre" })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}
