import type { Language } from './i18n'

export type ParameterHelpCopy = {
  title: string
  summary: string
  effect: string
  recommended?: string
  warning?: string
}

export type ParameterHelpKey =
  | 'inputMode'
  | 'preset'
  | 'exposure'
  | 'highlights'
  | 'whites'
  | 'shadows'
  | 'blacks'
  | 'hdrStrength'
  | 'peakHeadroom'
  | 'glow'
  | 'protection'
  | 'highlightStart'
  | 'highlightEnd'
  | 'shadowProtect'
  | 'saturationProtect'
  | 'skinProtect'
  | 'edgeSmoothRadius'
  | 'smallHighlightPreserve'
  | 'gainMapResolution'
  | 'heicQuality'

export const parameterHelp: Record<Language, Record<ParameterHelpKey, ParameterHelpCopy>> = {
  en: {
    inputMode: {
      title: 'Input mode',
      summary: 'Choose between generating a gain map from one image or using a separate base image and grayscale gain map.',
      effect: 'Single Image Enhance creates a synthetic gain map in the browser. Base + Gain Map uses your supplied pair directly.',
      recommended: 'Use Single Image Enhance for normal photos. Use Base + Gain Map when you already have a prepared gain map.',
      warning: 'Base + Gain Map needs both files.',
    },
    preset: {
      title: 'Preset',
      summary: 'Starts from a tuned parameter set for common HDR looks.',
      effect: 'Presets set headroom, strength, protection, glow, and resolution together, then you can still edit every control.',
      recommended: 'Natural is the safest starting point for most images.',
    },
    exposure: {
      title: 'Exposure',
      summary: 'Shifts the overall brightness before gain-map generation.',
      effect: 'Higher exposure can make more of the image enter the HDR range. Lower exposure keeps the result darker and more restrained.',
      recommended: 'Stay near 0 unless the source is clearly too dark or too bright.',
    },
    highlights: {
      title: 'Highlights',
      summary: 'Adjusts the brightest mid-to-high tones.',
      effect: 'Higher values push more highlight detail into the gain map, which can make bright areas pop more.',
      recommended: 'Small positive values are usually enough.',
    },
    whites: {
      title: 'Whites',
      summary: 'Adjusts the very bright tones near pure white.',
      effect: 'Higher values expand the bright end of the image, but too much can flatten highlight texture.',
      recommended: 'Use small changes around neutral.',
    },
    shadows: {
      title: 'Shadows',
      summary: 'Adjusts darker tones above black.',
      effect: 'Higher values can lift dark detail, but too much can reduce contrast and make the image look flat.',
      recommended: 'Use sparingly for underexposed images.',
    },
    blacks: {
      title: 'Blacks',
      summary: 'Adjusts the deepest dark tones.',
      effect: 'Higher values lift the darkest areas and reveal shadow detail, but can wash out blacks.',
      recommended: 'Keep near neutral unless the image is too crushed.',
    },
    hdrStrength: {
      title: 'HDR strength',
      summary: 'Controls how strongly bright regions are boosted by the gain map.',
      effect: 'Higher values create more visible HDR highlights, but can look unnatural when overused.',
      recommended: 'Around 0.6-0.8 for natural results.',
    },
    peakHeadroom: {
      title: 'Peak headroom',
      summary: 'Sets how far the HDR output can extend above the SDR base image.',
      effect: 'Higher values preserve stronger highlights on compatible HDR/EDR displays, but need more careful tuning.',
      recommended: 'Use about 2-4 for most photos.',
    },
    glow: {
      title: 'Glow',
      summary: 'Adds a soft spread around bright areas.',
      effect: 'Higher values can make highlights feel smoother, but too much glow can blur fine contrast.',
      recommended: 'Keep low unless you want a softer look.',
    },
    protection: {
      title: 'Protection',
      summary: 'Protects shadows, skin, and colors from being pushed too hard.',
      effect: 'Higher values keep the HDR effect focused on highlights and reduce color shifts in the rest of the image.',
      recommended: 'Use higher protection for portraits and mixed scenes.',
    },
    highlightStart: {
      title: 'Highlight start',
      summary: 'Sets where the highlight roll-off begins.',
      effect: 'Lower values move more of the image into the HDR treatment; higher values keep the effect confined to brighter tones.',
      recommended: 'Leave near the preset unless highlights need earlier or later treatment.',
    },
    highlightEnd: {
      title: 'Highlight end',
      summary: 'Sets where highlight boosting reaches its strongest point.',
      effect: 'A wider gap between start and end makes the transition smoother; a smaller gap makes the effect more abrupt.',
      recommended: 'Keep it above Highlight start.',
    },
    shadowProtect: {
      title: 'Shadow protect',
      summary: 'Protects dark areas from being lifted too aggressively.',
      effect: 'Higher values keep shadows darker and reduce unwanted HDR spill into low-light detail.',
      recommended: 'Useful when the image starts to look flat.',
    },
    saturationProtect: {
      title: 'Saturation protect',
      summary: 'Keeps colors from becoming too intense as HDR strength rises.',
      effect: 'Higher values preserve more natural color, but can reduce punch in vivid highlights.',
      recommended: 'Raise it for colorful scenes or strong HDR settings.',
    },
    skinProtect: {
      title: 'Skin protect',
      summary: 'Helps keep skin tones natural during HDR boosting.',
      effect: 'Higher values reduce face over-brightening and color shifts, but may slightly weaken the effect on portraits.',
      recommended: 'Useful for people in the frame.',
    },
    edgeSmoothRadius: {
      title: 'Edge smooth radius',
      summary: 'Smooths gain-map edges around bright details.',
      effect: 'Higher values reduce halos and blocky transitions, but can soften very sharp highlight boundaries.',
      recommended: 'Increase if you see ringing or edge artifacts.',
    },
    smallHighlightPreserve: {
      title: 'Small highlight preserve',
      summary: 'Keeps tiny bright details from being averaged away.',
      effect: 'Higher values help preserve sparkle and small specular highlights, but can retain more noise in busy areas.',
      recommended: 'Raise for reflective scenes and fine highlight detail.',
    },
    gainMapResolution: {
      title: 'Gain-map resolution',
      summary: 'Controls how much detail the gain map keeps.',
      effect: 'Lower values reduce file size; higher values preserve more local detail and cleaner highlight boundaries.',
      recommended: 'Auto or 720p is a good default for most images.',
      warning: 'Custom is currently reserved in the data model.',
    },
    heicQuality: {
      title: 'HEIC quality',
      summary: 'Controls the final HEIC compression quality.',
      effect: 'Higher values reduce compression artifacts, but make export files larger and can take a bit longer to encode.',
      recommended: '80-90 is a good general range.',
    },
  },
  zh: {
    inputMode: {
      title: '输入模式',
      summary: '在“单图生成增益图”和“使用单独基图 + 灰度增益图”之间切换。',
      effect: '单图增强会在浏览器中合成增益图。基图 + 增益图会直接使用你提供的图片对。',
      recommended: '普通照片建议用单图增强。已有增益图时再用基图 + 增益图。',
      warning: '基图 + 增益图需要同时提供两张图。',
    },
    preset: {
      title: '预设',
      summary: '从一组适合常见 HDR 风格的参数开始。',
      effect: '预设会一起设定 headroom、强度、保护、glow 和分辨率，但之后仍可继续手动调整。',
      recommended: 'Natural 是大多数图片最稳妥的起点。',
    },
    exposure: {
      title: '曝光',
      summary: '在生成增益图前整体平移亮度。',
      effect: '提高曝光会让更多区域进入 HDR 范围；降低曝光会让结果更暗、更克制。',
      recommended: '除非源图明显过暗或过亮，否则尽量接近 0。',
    },
    highlights: {
      title: '高光',
      summary: '调整最亮的中高亮区域。',
      effect: '数值越高，更多高光细节会进入增益图，明亮区域会更突出。',
      recommended: '通常只需要小幅正向调整。',
    },
    whites: {
      title: '白色',
      summary: '调整接近纯白的亮部。',
      effect: '数值越高，亮部范围越大；过高会让高光纹理变平。',
      recommended: '在中性附近小幅调整即可。',
    },
    shadows: {
      title: '阴影',
      summary: '调整黑位以上的暗部。',
      effect: '数值越高，暗部细节越容易被抬起；过高会压低对比度，让画面变平。',
      recommended: '过暗的图片可以少量提高。',
    },
    blacks: {
      title: '黑位',
      summary: '调整最深的暗部。',
      effect: '数值越高，最暗区域会被抬起并露出更多细节，但也更容易发灰。',
      recommended: '除非图片压黑太重，否则尽量靠近中性。',
    },
    hdrStrength: {
      title: 'HDR 强度',
      summary: '控制高亮区域被增益图抬升的力度。',
      effect: '数值越高，HDR 高光越明显；过度使用时画面会更不自然。',
      recommended: '自然效果通常在 0.6-0.8 左右。',
    },
    peakHeadroom: {
      title: '峰值余量',
      summary: '设置 HDR 输出相对 SDR 基图能延伸多远。',
      effect: '数值越高，在兼容 HDR/EDR 显示上越能保留强高光，但也需要更仔细地调节。',
      recommended: '大多数照片建议用 2-4 左右。',
    },
    glow: {
      title: '辉光',
      summary: '在亮部周围加一点柔和扩散。',
      effect: '数值越高，亮部会更柔顺；过高会冲淡细节对比。',
      recommended: '想要更柔和的效果时再提高。',
    },
    protection: {
      title: '保护',
      summary: '保护阴影、肤色和颜色，不让它们被推得太猛。',
      effect: '数值越高，HDR 效果会更集中在高光上，其余区域的颜色变化也更少。',
      recommended: '人像或混合场景建议使用较高保护。',
    },
    highlightStart: {
      title: '高光起点',
      summary: '设置高光滚降开始的位置。',
      effect: '数值越低，更多区域会进入 HDR 处理；数值越高，效果越集中在更亮的部分。',
      recommended: '通常保持在预设附近即可。',
    },
    highlightEnd: {
      title: '高光终点',
      summary: '设置高光增强达到最强的位置。',
      effect: '起点和终点之间的间距越大，过渡越柔和；间距越小，效果越突然。',
      recommended: '保持它高于高光起点。',
    },
    shadowProtect: {
      title: '阴影保护',
      summary: '防止暗部被抬得过头。',
      effect: '数值越高，阴影越容易保持在较暗状态，也能减少 HDR 溢出到低照度细节里。',
      recommended: '画面开始发平时很有用。',
    },
    saturationProtect: {
      title: '饱和度保护',
      summary: '防止 HDR 强度升高时颜色过饱和。',
      effect: '数值越高，颜色越自然；但 vivid 高光的冲劲会稍弱。',
      recommended: '彩色场景或强 HDR 设置时可以提高。',
    },
    skinProtect: {
      title: '肤色保护',
      summary: '帮助肤色在 HDR 增强中保持自然。',
      effect: '数值越高，脸部不容易被抬得过亮，颜色偏移也更少；但人像上的 HDR 感会稍弱。',
      recommended: '画面里有人物时很实用。',
    },
    edgeSmoothRadius: {
      title: '边缘平滑半径',
      summary: '平滑亮部周围的增益图边缘。',
      effect: '数值越高，光晕和块状过渡越少；但非常锐利的高光边界也会变软。',
      recommended: '看到 ringing 或边缘伪影时再提高。',
    },
    smallHighlightPreserve: {
      title: '小高光保留',
      summary: '保留容易被平均掉的小亮点。',
      effect: '数值越高，闪点和细小镜面高光越容易保住，但忙乱区域也可能保留更多噪点。',
      recommended: '反光场景和细小高光细节可以提高。',
    },
    gainMapResolution: {
      title: '增益图分辨率',
      summary: '控制增益图保留多少细节。',
      effect: '数值越低，文件越小；数值越高，局部细节和高光边界越清楚。',
      recommended: 'Auto 或 720p 对大多数图片都很合适。',
      warning: 'Custom 目前只在数据模型里预留。',
    },
    heicQuality: {
      title: 'HEIC 质量',
      summary: '控制最终 HEIC 的压缩质量。',
      effect: '数值越高，压缩伪影越少，但导出文件会更大，编码也可能稍慢一点。',
      recommended: '80-90 是比较通用的范围。',
    },
  },
}

export function getParameterHelp(language: Language, key: ParameterHelpKey) {
  return parameterHelp[language][key]
}
