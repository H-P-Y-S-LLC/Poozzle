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
  ultimate: { en: "ULT", zh: "大招" },
  ultimateReady: { en: "Ultimate ready — tap to arm, then tap a tile", zh: "大招就绪：点击选中，再点棋盘目标释放" },
  charge: { en: "Charge", zh: "充能" },
  coins: { en: "COINS", zh: "硬币" },
  coinsUsedUp: { en: "No tosses left this level", zh: "本次已用完" },
  shop: { en: "Shop", zh: "商店" },
  buy: { en: "Buy", zh: "购买" },
  close: { en: "Close", zh: "关闭" },
  loadout: { en: "Loadout", zh: "装配道具" },
  loadoutCap: { en: "carry at most", zh: "最多携带" },
  loadoutPieces: { en: "items", zh: "个道具" },
  selected: { en: "Selected", zh: "已选" },
  owned: { en: "Owned", zh: "拥有" },
  cap: { en: "Max", zh: "上限" },
  start: { en: "Start", zh: "开始" },
  cancel: { en: "Cancel", zh: "取消" },
  itemUseHint: { en: "Usable inside a level", zh: "关卡内可使用的道具" },
  itemRemaining: { en: "left this level", zh: "本关剩余" },
  play: { en: "PLAY", zh: "进入游戏" },
  homeTagline: { en: "Match-Face Match-3", zh: "变脸大作战" },
  installTitle: { en: "Play like an app", zh: "安装到主屏幕" },
  installHint: {
    en: "Add MatchFace to your home screen to play full-screen with a better experience.",
    zh: "把 MatchFace 添加到主屏幕，全屏畅玩，体验更好。",
  },
  addToHome: { en: "Add to Home Screen", zh: "添加到主屏幕" },
  installIos: { en: "Tap Share, then “Add to Home Screen”.", zh: "点击「分享」，选择「添加到主屏幕」。" },
  installAndroid: { en: "Tap the menu, then “Add to Home screen”.", zh: "点击浏览器菜单，选择「添加到主屏幕」。" },
  dontShowAgain: { en: "Don't show again", zh: "不再提示" },
  home: { en: "Home", zh: "首页" },
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
