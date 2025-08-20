// Font-related utilities

export const truncateFontName = (fontName: string, maxLength: number = 20): string => {
  if (fontName.length <= maxLength) return fontName;
  return fontName.substring(0, maxLength - 3) + '...';
};

export const isFontAvailable = (fontName: string): boolean => {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return false;
    const testString = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const testSize = '12px';
    const fallbackFonts = ['serif', 'sans-serif', 'monospace'];

    const measurements = fallbackFonts.map((fallback) => {
      context.font = `${testSize} ${fallback}`;
      return context.measureText(testString).width;
    });

    const targetMeasurements = fallbackFonts.map((fallback) => {
      context.font = `${testSize} "${fontName}", ${fallback}`;
      return context.measureText(testString).width;
    });

    return measurements.some((width, i) => Math.abs(width - targetMeasurements[i]) > 0.1);
  } catch {
    return false;
  }
};

export const getSystemFonts = async (): Promise<string[]> => {
  try {
    if ('queryLocalFonts' in window) {
      const fonts = await (window as any).queryLocalFonts();
      const fontFamilies = [...new Set(fonts.map((font: any) => font.family))]
        .filter((family): family is string => typeof family === 'string')
        .sort();
      return fontFamilies;
    }
  } catch {}

  const testFonts = [
    'Arial', 'Helvetica', 'Times New Roman', 'Times', 'Courier New', 'Courier',
    'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
    'Trebuchet MS', 'Arial Black', 'Impact',
    'Microsoft YaHei', '微软雅黑', 'SimSun', '宋体', 'SimHei', '黑体',
    'KaiTi', '楷体', 'FangSong', '仿宋', 'PingFang SC', 'Hiragino Sans GB',
    'STHeiti', 'STKaiti', 'STSong', 'STFangsong',
    'San Francisco', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Avenir',
    'Menlo', 'Monaco', 'Lucida Grande', 'Apple Color Emoji',
    'Segoe UI', 'Tahoma', 'Calibri', 'Consolas', 'Cambria', 'Arial Unicode MS',
    'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans Pro', 'Noto Sans'
  ];

  return testFonts.filter(isFontAvailable);
};
