import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ThemeConfig } from 'ant-design-vue/es/config-provider/context'

export type ThemeId = 'chatgpt' | 'frutiger-aero' | 'vista' | 'xp'

export const THEME_OPTIONS: Array<{ value: ThemeId; label: string }> = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'frutiger-aero', label: 'Frutiger Aero' },
  { value: 'vista', label: 'Windows Vista' },
  { value: 'xp', label: 'Windows XP' },
]

const STORAGE_KEY = 'app_theme'

// antd 组件级 token：跟随 CSS 变量主题一起切换（主色、圆角、Segmented 轨道等）
const ANTD_THEMES: Record<ThemeId, ThemeConfig> = {
  // ChatGPT：贴近官方黑白灰，primary 近黑
  chatgpt: {
    token: {
      colorPrimary: '#0d0d0d',
      colorInfo: '#0d0d0d',
      colorLink: '#0d0d0d',
    },
    components: {
      Select: {
        colorBgElevated: '#ffffff',
        controlItemBgActive: 'rgba(0, 0, 0, 0.06)',
        controlItemBgHover: 'rgba(0, 0, 0, 0.04)',
      },
    },
  },
  // Frutiger Aero：aero 蓝主色 + 大圆角 + 半透明白 Segmented 轨道
  // （antd-vue 4.2 的 Segmented 无专属 token，用别名 token colorBgLayout/colorBgElevated/colorTextLabel 调）
  // Popover/Modal token 让 popconfirm 与确认弹窗面板跟上玻璃质感；
  // 默认按钮配色、面板模糊、箭头配色 token 覆盖不到，在 themes.css 里补
  'frutiger-aero': {
    token: {
      colorPrimary: '#2f8fce',
      colorInfo: '#2f8fce',
      colorLink: '#1f74ad',
      borderRadius: 10,
    },
    components: {
      Segmented: {
        colorBgLayout: 'rgba(255, 255, 255, 0.55)',
        colorBgElevated: '#ffffff',
        colorTextLabel: '#14455f',
      },
      Popover: {
        colorBgElevated: 'rgba(255, 255, 255, 0.88)',
      },
      // antd Select 下拉默认无 token，玻璃主题下文字和背景都是灰色，补高不透明底
      Select: {
        colorBgElevated: 'rgba(255, 255, 255, 0.98)',
        controlItemBgActive: 'rgba(44, 138, 202, 0.14)',
        controlItemBgHover: 'rgba(0, 0, 0, 0.04)',
      },
      // Modal 无配色 token，但 modalContentBg 派生自 alias token colorBgElevated，组件级覆盖即可
      Modal: {
        colorBgElevated: 'rgba(255, 255, 255, 0.92)',
      },
    },
  },
  // Windows Vista：Vista 蓝主色 + 小圆角 + 暗玻璃上的蓝色辉光 Segmented
  vista: {
    token: {
      colorPrimary: '#1f6fb2',
      colorInfo: '#1f6fb2',
      colorLink: '#185a92',
      borderRadius: 4,
    },
    components: {
      Segmented: {
        colorBgLayout: 'rgba(255, 255, 255, 0.16)',
        colorBgElevated: 'rgba(110, 170, 220, 0.45)',
        colorTextLabel: '#d5e2ee',
      },
      Select: {
        colorBgElevated: 'rgba(255, 255, 255, 0.97)',
        controlItemBgActive: 'rgba(31, 111, 178, 0.14)',
        controlItemBgHover: 'rgba(0, 0, 0, 0.04)',
      },
      Popover: {
        colorBgElevated: 'rgba(244, 248, 252, 0.94)',
      },
      Modal: {
        colorBgElevated: 'rgba(244, 248, 252, 0.96)',
      },
    },
  },
  // Windows XP (Luna)：皇家蓝主色 + 蓝色标题栏上半透明白 Segmented
  xp: {
    token: {
      colorPrimary: '#316ac5',
      colorInfo: '#316ac5',
      colorLink: '#2456a8',
      borderRadius: 6,
    },
    components: {
      Segmented: {
        colorBgLayout: 'rgba(255, 255, 255, 0.2)',
        colorBgElevated: 'rgba(255, 255, 255, 0.4)',
        colorTextLabel: '#ffffff',
      },
      Select: {
        colorBgElevated: 'rgba(255, 255, 255, 0.98)',
        controlItemBgActive: 'rgba(49, 106, 197, 0.14)',
        controlItemBgHover: 'rgba(0, 0, 0, 0.04)',
      },
      Popover: {
        colorBgElevated: 'rgba(255, 255, 255, 0.96)',
      },
      Modal: {
        colorBgElevated: 'rgba(255, 255, 255, 0.97)',
      },
    },
  },
}

function readStoredTheme(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEY)
  return THEME_OPTIONS.some(t => t.value === stored) ? (stored as ThemeId) : 'chatgpt'
}

export const useThemeStore = defineStore('theme', () => {
  const themeId = ref<ThemeId>(readStoredTheme())

  const antdTheme = computed<ThemeConfig>(() => ANTD_THEMES[themeId.value])

  // 同步到 <html data-theme>，themes.css 据此切换变量
  function apply(id: ThemeId) {
    document.documentElement.dataset.theme = id
  }

  function setTheme(id: ThemeId) {
    themeId.value = id
    localStorage.setItem(STORAGE_KEY, id)
    apply(id)
  }

  // store 首次创建时兜底应用一次（index.html 的内联脚本已先行设置，防刷新闪烁）
  apply(themeId.value)

  return { themeId, antdTheme, setTheme }
})
