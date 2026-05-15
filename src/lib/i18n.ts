export type Language = 'en' | 'zh'

export const languageLabels: Record<Language, string> = {
  en: 'English',
  zh: '中文',
}

export const translations = {
  en: {
    appEyebrow: 'Single-image bypass',
    appTitle: 'HDR HEIC Gain Map Lab',
    swiftReference: 'Swift reference',
    chooseImage: 'Choose JPEG/PNG',
    encoderChecking: 'Checking local HEIC encoder files...',
    encoderReady: 'HEIC encoder ready. All processing runs locally in your browser.',
    encoderMissing: 'HEIC encoder files are missing. Export is unavailable.',
    controlsHeading: 'Bypass Controls',
    hdrStrength: 'HDR strength',
    highlightThreshold: 'Highlight threshold',
    transitionSoftness: 'Transition softness',
    peakHeadroom: 'Peak headroom',
    colorProtection: 'Color protection',
    extremeGainDebug: 'Extreme gain map debug',
    heicQuality: 'HEIC quality',
    exportHeic: 'Export Apple HDR HEIC',
    downloadHeic: 'Download HEIC',
    downloadDebugPackage: 'Download debug package',
    sdrBase: 'SDR base',
    gainMap: 'Gain map',
    hdrReference: 'HDR reference',
    canvas: 'Canvas',
    activePixels: 'Active pixels',
    headroom: 'Headroom',
    stops: 'stops',
    statusDrop: 'Drop or choose a JPEG/PNG to begin',
    statusGeneratingGainMap: 'Generating Apple-style gain map',
    statusEncodingHeic: 'Encoding HEIC payload',
    statusProcessingFailed: 'Processing failed',
    statusPreviewUpdated: 'Preview updated',
    statusDecodingSource: 'Decoding source image',
    statusImageDecodedLowLuminance: 'Image decoded. Low luminance detected; use a stronger headroom if needed.',
    statusImageDecodedPreview: 'Image decoded. Building bypass preview.',
    statusCouldNotLoadImage: 'Could not load image',
    statusExportUnavailable: 'Export unavailable',
    errorBrowserEncoderUnavailable: 'Browser HEIC encoder is not available',
    encodedHeicLocal: 'Encoded Apple HDR gain map HEIC locally in your browser.',
  },
  zh: {
    appEyebrow: '单图 HDR 绕行',
    appTitle: 'HDR HEIC 增益图实验室',
    swiftReference: 'Swift 参考实现',
    chooseImage: '选择 JPEG/PNG',
    encoderChecking: '正在检查本地 HEIC 编码器文件...',
    encoderReady: 'HEIC 编码器已就绪。所有处理都在你的浏览器本地完成。',
    encoderMissing: '缺少 HEIC 编码器文件，暂时无法导出。',
    controlsHeading: '绕行参数',
    hdrStrength: 'HDR 强度',
    highlightThreshold: '高光阈值',
    transitionSoftness: '过渡柔和度',
    peakHeadroom: '峰值余量',
    colorProtection: '颜色保护',
    extremeGainDebug: '极端增益图调试',
    heicQuality: 'HEIC 质量',
    exportHeic: '导出 Apple HDR HEIC',
    downloadHeic: '下载 HEIC',
    downloadDebugPackage: '下载调试包',
    sdrBase: 'SDR 基图',
    gainMap: '增益图',
    hdrReference: 'HDR 参考',
    canvas: '画布',
    activePixels: '生效像素',
    headroom: '余量',
    stops: '档',
    statusDrop: '拖入或选择 JPEG/PNG 开始',
    statusGeneratingGainMap: '正在生成 Apple 风格增益图',
    statusEncodingHeic: '正在编码 HEIC',
    statusProcessingFailed: '处理失败',
    statusPreviewUpdated: '预览已更新',
    statusDecodingSource: '正在解码源图',
    statusImageDecodedLowLuminance: '图片已解码。检测到亮度较低，需要时可提高峰值余量。',
    statusImageDecodedPreview: '图片已解码。正在生成绕行预览。',
    statusCouldNotLoadImage: '无法加载图片',
    statusExportUnavailable: '无法导出',
    errorBrowserEncoderUnavailable: '浏览器 HEIC 编码器不可用',
    encodedHeicLocal: '已在浏览器本地编码 Apple HDR 增益图 HEIC。',
  },
} satisfies Record<Language, Record<string, string>>

export type TranslationKey = keyof typeof translations.en

export function getInitialLanguage(): Language {
  const saved = window.localStorage.getItem('hdr-heic-bypass-language')
  if (saved === 'en' || saved === 'zh') return saved
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function saveLanguage(language: Language) {
  window.localStorage.setItem('hdr-heic-bypass-language', language)
}
