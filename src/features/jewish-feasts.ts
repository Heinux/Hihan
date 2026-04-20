export interface JewishFeast {
  readonly name: string;
  readonly icon: string;
  readonly month: number;
  readonly day: number;
  readonly context: string;
}

const FEASTS: readonly JewishFeast[] = [
  { name: "Pessa'h",     icon: "\u2726",       month: 1,  day: 14, context: "14 au soir, F\u00EAte des pains sans levain (du 14e au 21e jour)" },
  { name: "Shavuot",     icon: "\u2605",       month: 3,  day: 6,  context: "F\u00EAte des Semaines \u2014 arriv\u00E9e au d\u00E9sert de Sina\u00EF" },
  { name: "Roch Hachana", icon: "\uD83D\uDCF4", month: 7,  day: 1,  context: "Jour du son de la trompette \u2014 Nouvel An juif" },
  { name: "Yom Kippour", icon: "\u2727",       month: 7,  day: 10, context: "Jour de l\u2019expiation \u2014 je\u00FBne et affliction des \u00E2mes" },
  { name: "Souccot",     icon: "\uD83C\uDF3F", month: 7,  day: 15, context: "F\u00EAte des cabanes \u2014 sept jours" },
] as const;

export function getJewishFeastsForEnochDay(enochMonthIdx: number, enochDayInMonth: number): JewishFeast[] {
  const bibMonth = enochMonthIdx + 1;
  return FEASTS.filter(f => f.month === bibMonth && f.day === enochDayInMonth);
}

export function getJewishFeastsForHebrewDay(hebrewMonth: number, hebrewDay: number): JewishFeast[] {
  return FEASTS.filter(f => f.month === hebrewMonth && f.day === hebrewDay);
}
