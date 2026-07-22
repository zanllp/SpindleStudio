import { computed, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import antdZhCN from 'ant-design-vue/es/locale/zh_CN'
import antdEnUS from 'ant-design-vue/es/locale/en_US'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

export type LocalePreference = 'auto' | 'zh-CN' | 'en-US'
export type ResolvedLocale = 'zh-CN' | 'en-US'

// localStorage key storing the user's language preference ('auto' follows the OS/browser)
const STORAGE_KEY = 'app_locale'

function detectSystemLocale(): ResolvedLocale {
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function readPreference(): LocalePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'zh-CN' || stored === 'en-US' ? stored : 'auto'
}

function resolve(pref: LocalePreference): ResolvedLocale {
  return pref === 'auto' ? detectSystemLocale() : pref
}

// Current preference as shown in Settings (general section); 'auto' = follow system
export const localePreference = ref<LocalePreference>(readPreference())

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: resolve(localePreference.value),
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
})

export function setLocale(pref: LocalePreference) {
  localePreference.value = pref
  const resolved = resolve(pref)
  i18n.global.locale.value = resolved
  localStorage.setItem(STORAGE_KEY, pref)
  document.documentElement.lang = resolved
}

// Sync <html lang> on boot
document.documentElement.lang = i18n.global.locale.value

// ant-design-vue component texts (popconfirm/modal buttons, empty states…) follow the locale
export const antdLocale = computed(() =>
  i18n.global.locale.value === 'zh-CN' ? antdZhCN : antdEnUS,
)

// t() for non-component code (stores, api layer) where useI18n() is unavailable
export const t = i18n.global.t

// Server-created default conversation titles in every supported language.
// Used to detect "still unnamed" conversations regardless of which language
// the conversation was created under.
export const DEFAULT_CONVERSATION_TITLES: string[] = [
  zhCN.common.newConversation,
  enUS.common.newConversation,
]
