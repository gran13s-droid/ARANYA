/**
 * Player-facing strings. Text must never be hard-coded in game code
 * (CLAUDE.md: Language). Move to per-locale JSON files once the UI grows.
 * Skill names follow GDD 5.2.
 */
const dictionaries = {
  th: {
    connecting: 'กำลังเชื่อมต่อเซิร์ฟเวอร์…',
    connected: 'เชื่อมต่อแล้ว · ผู้เล่นในช่องนี้ {count} คน',
    failed: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
    disconnected: 'หลุดจากเซิร์ฟเวอร์',
    hp: 'HP',
    resource: 'ปราณดาบ',
    dead: 'สลบ… ฟื้นที่จุดเกิดในไม่กี่วินาที',
    'skill.attack': 'ฟันกระแสไฟ',
    'skill.stance': 'ยืนม้าหยก',
    'skill.lunge': 'ทะยานพยัคฆ์',
    'skill.parry': 'ปัดป้องสวนกลับ',
    'skill.ultimate': 'ดาบเพลิงพิชิตมาร',
    'skill.dodge': 'หลบ',
    'skill.potion': 'ยา',
  },
  en: {
    connecting: 'Connecting to server…',
    connected: 'Connected · {count} players in this channel',
    failed: 'Could not connect to the server',
    disconnected: 'Disconnected from server',
    hp: 'HP',
    resource: 'Blade Qi',
    dead: 'Knocked out… respawning shortly',
    'skill.attack': 'Flame Slash',
    'skill.stance': 'Jade Horse Stance',
    'skill.lunge': 'Tiger Lunge',
    'skill.parry': 'Parry & Counter',
    'skill.ultimate': 'Demon-Slaying Flame Blade',
    'skill.dodge': 'Dodge',
    'skill.potion': 'Potion',
  },
} as const;

export type Locale = keyof typeof dictionaries;
export type MessageKey = keyof (typeof dictionaries)['th'];

let locale: Locale = navigator.language.startsWith('th') ? 'th' : 'en';

export function setLocale(next: Locale): void {
  locale = next;
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return dictionaries[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}
