export const MAX_PHOTOS = 5;

const PHOTO_MAX_SIDE  = 1280;
const PHOTO_MAX_BYTES = 700 * 1024;
const PHOTO_QUALITY   = 0.76;

const COVER_MAX_SIDE  = 120;
const COVER_QUALITY   = 0.6;

const INPUT_MAX_BYTES = 25 * 1024 * 1024;

export async function compressPhoto(file) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('이미지 파일만 넣을 수 있어요.');
  }
  if (file.size > INPUT_MAX_BYTES) {
    throw new Error('사진이 너무 커요. (25MB 이하)');
  }

  const src = await loadImage(file);
  try {
    let { w, h } = fitInto(src.width, src.height, PHOTO_MAX_SIDE);
    let quality = PHOTO_QUALITY;
    let dataUrl = drawToDataUrl(src.source, w, h, quality);

    let guard = 0;
    while (dataUrl.length > PHOTO_MAX_BYTES && guard++ < 10) {
      if (quality > 0.42) {
        quality -= 0.1;
      } else {
        w = Math.max(320, Math.round(w * 0.8));
        h = Math.max(320, Math.round(h * 0.8));
      }
      dataUrl = drawToDataUrl(src.source, w, h, quality);
    }

    if (dataUrl.length > PHOTO_MAX_BYTES) {
      throw new Error('사진 용량을 줄이지 못했어요. 다른 사진으로 시도해주세요.');
    }
    return { dataUrl, w, h };
  } finally {
    src.close();
  }
}

export async function makeCover(dataUrl) {
  if (!dataUrl) return '';
  try {
    const src = await loadImage(dataUrl);
    try {
      const { w, h } = fitInto(src.width, src.height, COVER_MAX_SIDE);
      return drawToDataUrl(src.source, w, h, COVER_QUALITY);
    } finally {
      src.close();
    }
  } catch (_) {
    return '';
  }
}

async function loadImage(input) {
  if (typeof createImageBitmap === 'function' && typeof input !== 'string') {
    try {
      const bmp = await createImageBitmap(input, { imageOrientation: 'from-image' });
      return {
        width: bmp.width,
        height: bmp.height,
        source: bmp,
        close: () => { try { bmp.close(); } catch (_) {  } }
      };
    } catch (_) {

    }
  }

  const isBlob = typeof input !== 'string';
  const url = isBlob ? URL.createObjectURL(input) : input;
  const revoke = () => { if (isBlob) URL.revokeObjectURL(url); };

  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload  = () => resolve(i);
      i.onerror = () => reject(new Error('이미지를 읽지 못했어요.'));
      i.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      source: img,
      close: revoke
    };
  } catch (err) {
    revoke();
    throw err;
  }
}

function fitInto(width, height, maxSide) {
  const long = Math.max(width, height);
  if (!long) return { w: 1, h: 1 };

  const scale = Math.min(1, maxSide / long);
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale))
  };
}

function drawToDataUrl(source, w, h, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);

  const url = canvas.toDataURL('image/jpeg', quality);

  canvas.width = 0;
  canvas.height = 0;

  return url;
}
