/**
 * Minimal bilingual text helper. Real strings come from localization/*.json later.
 */
export type Lang = "en" | "zh";

const TEXT: Record<string, { en: string; zh: string }> = {
  score: { en: "SCORE", zh: "分数" },
  moves: { en: "MOVES", zh: "步数" },
  target: { en: "TARGET", zh: "目标" },
  level: { en: "LEVEL", zh: "关卡" },
  win: { en: "LEVEL CLEAR", zh: "过关" },
  lose: { en: "OUT OF MOVES", zh: "步数用尽" },
  retry: { en: "Retry", zh: "重玩" },
  next: { en: "Next", zh: "下一关" },
  map: { en: "Levels", zh: "关卡" },
  back: { en: "Back", zh: "返回" },
  loading: { en: "Loading…", zh: "加载中…" },
  selectLevel: { en: "Select Level", zh: "选择关卡" },
  stars: { en: "Stars", zh: "星级" },
};

export function detectLang(): Lang {
  const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "en";
  return nav.startsWith("zh") ? "zh" : "en";
}

export class I18n {
  lang: Lang;
  constructor(lang: Lang = detectLang()) {
    this.lang = lang;
  }
  t(key: string): string {
    const entry = TEXT[key];
    if (!entry) return key;
    return entry[this.lang] ?? entry.en;
  }
  toggle(): Lang {
    this.lang = this.lang === "en" ? "zh" : "en";
    return this.lang;
  }
}
