import type { Language } from "./types";

export type OnboardingStage = "welcome" | "language" | "interaction" | "support";

type PresentationCopy = {
  lab: string;
  hello: string;
  friend: string;
  invitation: string;
  about: string;
  signature: string;
  chapters: Record<OnboardingStage, string>;
};

export const presentationCopy: Record<Language, PresentationCopy> = {
  "zh-CN": {
    lab: "南极星实验室", hello: "你好，", friend: "我的朋友。",
    invitation: "不必一次弄懂所有事情。我们一起，一步一步来。",
    about: "关于这段旅程", signature: "云端与本地，在此相遇。",
    chapters: { welcome: "初次见面", language: "用你的语言", interaction: "找到你的节奏", support: "一点小小的心意" },
  },
  "zh-Hant": {
    lab: "南極星實驗室", hello: "你好，", friend: "我的朋友。",
    invitation: "不必一次弄懂所有事情。我們一起，一步一步來。",
    about: "關於這段旅程", signature: "雲端與本機，在此相遇。",
    chapters: { welcome: "初次見面", language: "用你的語言", interaction: "找到你的節奏", support: "一點小小的心意" },
  },
  en: {
    lab: "Antarctic Star Lab", hello: "Hello,", friend: "my friend.",
    invitation: "No need to know everything yet. Let's take this one step at a time.",
    about: "About this journey", signature: "Where cloud meets local.",
    chapters: { welcome: "A new beginning", language: "In your language", interaction: "Find your rhythm", support: "A little appreciation" },
  },
  fr: {
    lab: "Laboratoire de l’Étoile australe", hello: "Bonjour,", friend: "cher ami.",
    invitation: "Pas besoin de tout comprendre dès maintenant. Avançons ensemble, pas à pas.",
    about: "À propos de ce voyage", signature: "Le cloud et le local se rencontrent.",
    chapters: { welcome: "Une première rencontre", language: "Dans votre langue", interaction: "Trouvez votre rythme", support: "Une petite attention" },
  },
  ja: {
    lab: "南極星ラボ", hello: "こんにちは、", friend: "ようこそ。",
    invitation: "すべてを一度に理解しなくても大丈夫。一緒に、一歩ずつ進みましょう。",
    about: "この旅について", signature: "クラウドとローカルが、ここで出会う。",
    chapters: { welcome: "はじめまして", language: "あなたの言葉で", interaction: "あなたのペースで", support: "ささやかな応援" },
  },
  ru: {
    lab: "Лаборатория Южной звезды", hello: "Здравствуй,", friend: "мой друг.",
    invitation: "Не нужно разбираться во всём сразу. Давай двигаться вместе, шаг за шагом.",
    about: "Об этом путешествии", signature: "Здесь встречаются облако и локальная среда.",
    chapters: { welcome: "Первое знакомство", language: "На твоём языке", interaction: "В твоём ритме", support: "Немного благодарности" },
  },
  de: {
    lab: "Labor des südlichen Sterns", hello: "Hallo,", friend: "mein Freund.",
    invitation: "Du musst noch nicht alles verstehen. Gehen wir gemeinsam einen Schritt nach dem anderen.",
    about: "Über diese Reise", signature: "Hier treffen Cloud und lokales Arbeiten aufeinander.",
    chapters: { welcome: "Ein erster Anfang", language: "In deiner Sprache", interaction: "Finde deinen Rhythmus", support: "Ein kleines Dankeschön" },
  },
};

// Every pose has matching path commands, so Motion can interpolate the actual
// shapes. The scene is ornamental: it must never be used as a readiness signal.
export const onboardingScenes = {
  welcome: {
    paper: "M 0 0 H 1000 C 938 183 811 342 835 531 C 856 696 764 804 708 900 H 0 Z",
    veil: "M 982 -80 C 1530 140 1480 650 1200 1020 C 977 1002 778 738 867 468 C 944 232 851 67 982 -80 Z",
    ink: "#252a3c", lavender: "#bfc0d8", rotation: -28, spread: 1, moonX: 34, moonY: -17,
    starX: 1137, starY: 518, arcRotation: -8,
  },
  language: {
    paper: "M 0 0 H 945 C 768 228 917 335 819 538 C 748 685 767 812 720 900 H 0 Z",
    veil: "M 1140 -80 C 1565 230 1438 787 1030 1020 C 901 871 931 692 840 455 C 737 187 1014 26 1140 -80 Z",
    ink: "#303149", lavender: "#c7c3dc", rotation: 22, spread: 1.13, moonX: -18, moonY: 6,
    starX: 1032, starY: 340, arcRotation: 7,
  },
  interaction: {
    paper: "M 0 0 H 980 C 890 104 755 337 801 520 C 851 723 744 814 698 900 H 0 Z",
    veil: "M 1085 -80 C 1418 74 1460 595 1348 1020 C 981 1056 812 627 908 434 C 1028 191 829 43 1085 -80 Z",
    ink: "#26313d", lavender: "#bec9d3", rotation: 68, spread: .94, moonX: -67, moonY: 1,
    starX: 1201, starY: 420, arcRotation: 18,
  },
  support: {
    paper: "M 0 0 H 980 C 1042 181 775 337 829 546 C 866 692 779 827 724 900 H 0 Z",
    veil: "M 1005 -80 C 1487 69 1511 788 1131 1020 C 860 1006 941 710 840 474 C 749 261 977 36 1005 -80 Z",
    ink: "#343044", lavender: "#d0c3d7", rotation: 112, spread: 1.04, moonX: -220, moonY: 0,
    starX: 1060, starY: 580, arcRotation: 27,
  },
} as const satisfies Record<OnboardingStage, object>;

export const onboardingLanguages: readonly { value: Language; label: string; marker: string }[] = [
  { value: "zh-CN", label: "简体中文", marker: "中" },
  { value: "zh-Hant", label: "繁體中文", marker: "繁" },
  { value: "en", label: "English", marker: "EN" },
  { value: "fr", label: "Français", marker: "FR" },
  { value: "ja", label: "日本語", marker: "日" },
  { value: "ru", label: "Русский", marker: "RU" },
  { value: "de", label: "Deutsch", marker: "DE" },
];

export function languageFromKey(current: Language, key: string): Language | null {
  const index = onboardingLanguages.findIndex(option => option.value === current);
  if (key === "Home") return onboardingLanguages[0]!.value;
  if (key === "End") return onboardingLanguages.at(-1)!.value;
  const delta = key === "ArrowRight" || key === "ArrowDown" ? 1
    : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;
  return delta ? onboardingLanguages[(index + delta + onboardingLanguages.length) % onboardingLanguages.length]!.value : null;
}
