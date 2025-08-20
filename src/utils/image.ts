// Image-related utilities

export const resizeImageTo296x152 = (imageDataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建canvas上下文'));
        return;
        }

      canvas.width = 296;
      canvas.height = 152;
      ctx.drawImage(img, 0, 0, 296, 152);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = imageDataUrl;
  });
};

export const generateTemplate = (width: number, height: number, color: 'black' | 'white') => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = color === 'black' ? '#000000' : '#ffffff';
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL('image/png');
};
