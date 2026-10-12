export interface CurrencyInfo {
	code: string;
	name: string;
	symbol: string;
	/** true if the symbol goes before the amount ($19.99), false if after (999 ₽) */
	prefix: boolean;
}

export const CURRENCIES: CurrencyInfo[] = [
	{ code: 'RUB', name: 'Российский рубль', symbol: '₽', prefix: false },
	{ code: 'KZT', name: 'Казахстанский тенге', symbol: '₸', prefix: false },
	{ code: 'USD', name: 'Доллар США', symbol: '$', prefix: true },
	{ code: 'EUR', name: 'Евро', symbol: '€', prefix: true },
	{ code: 'UAH', name: 'Украинская гривна', symbol: '₴', prefix: false },
	{ code: 'BYN', name: 'Белорусский рубль', symbol: 'Br', prefix: false },
	{ code: 'AMD', name: 'Армянский драм', symbol: '֏', prefix: false },
	{ code: 'AZN', name: 'Азербайджанский манат', symbol: '₼', prefix: false },
	{ code: 'UZS', name: 'Узбекский сум', symbol: 'сўм', prefix: false },
	{ code: 'KGS', name: 'Киргизский сом', symbol: 'сом', prefix: false },
	{ code: 'TJS', name: 'Таджикский сомони', symbol: 'sm', prefix: false },
	{ code: 'GEL', name: 'Грузинский лари', symbol: '₾', prefix: false },
	{ code: 'MDL', name: 'Молдавский лей', symbol: 'L', prefix: false },
	{ code: 'TRY', name: 'Турецкая лира', symbol: '₺', prefix: true },
	{ code: 'CNY', name: 'Китайский юань', symbol: 'CN¥', prefix: true },
	{ code: 'GBP', name: 'Фунт стерлингов', symbol: '£', prefix: true },
	{ code: 'JPY', name: 'Японская иена', symbol: '¥', prefix: true },
	{ code: 'CHF', name: 'Швейцарский франк', symbol: 'CHF', prefix: true },
	{ code: 'KRW', name: 'Южнокорейская вона', symbol: '₩', prefix: true },
	{ code: 'INR', name: 'Индийская рупия', symbol: '₹', prefix: true },
	{ code: 'BRL', name: 'Бразильский реал', symbol: 'R$', prefix: true },
	{ code: 'AUD', name: 'Австралийский доллар', symbol: 'A$', prefix: true },
	{ code: 'CAD', name: 'Канадский доллар', symbol: 'C$', prefix: true },
	{ code: 'NZD', name: 'Новозеландский доллар', symbol: 'NZ$', prefix: true },
	{ code: 'HKD', name: 'Гонконгский доллар', symbol: 'HK$', prefix: true },
	{ code: 'SGD', name: 'Сингапурский доллар', symbol: 'S$', prefix: true },
	{ code: 'MXN', name: 'Мексиканское песо', symbol: 'Mex$', prefix: true },
	{ code: 'ARS', name: 'Аргентинское песо', symbol: 'AR$', prefix: true },
	{ code: 'CLP', name: 'Чилийское песо', symbol: 'CLP', prefix: true },
	{ code: 'COP', name: 'Колумбийское песо', symbol: 'COL$', prefix: true },
	{ code: 'PLN', name: 'Польский злотый', symbol: 'zł', prefix: false },
	{ code: 'CZK', name: 'Чешская крона', symbol: 'Kč', prefix: false },
	{ code: 'RON', name: 'Румынский лей', symbol: 'lei', prefix: false },
	{ code: 'BGN', name: 'Болгарский лев', symbol: 'лв', prefix: false },
	{ code: 'RSD', name: 'Сербский динар', symbol: 'дин', prefix: false },
	{ code: 'HUF', name: 'Венгерский форинт', symbol: 'Ft', prefix: false },
	{ code: 'SEK', name: 'Шведская крона', symbol: 'kr', prefix: false },
	{ code: 'NOK', name: 'Норвежская крона', symbol: 'kr', prefix: false },
	{ code: 'DKK', name: 'Датская крона', symbol: 'kr', prefix: false },
	{ code: 'ZAR', name: 'Южноафриканский рэнд', symbol: 'R', prefix: false },
	{ code: 'ILS', name: 'Израильский шекель', symbol: '₪', prefix: true },
	{ code: 'AED', name: 'Дирхам ОАЭ', symbol: 'AED', prefix: true },
	{ code: 'SAR', name: 'Саудовский риял', symbol: 'SAR', prefix: true },
	{ code: 'THB', name: 'Тайский бат', symbol: '฿', prefix: true },
	{ code: 'IDR', name: 'Индонезийская рупия', symbol: 'Rp', prefix: true },
	{ code: 'MYR', name: 'Малайзийский ринггит', symbol: 'RM', prefix: true },
	{ code: 'PHP', name: 'Филиппинское песо', symbol: '₱', prefix: true },
	{ code: 'VND', name: 'Вьетнамский донг', symbol: '₫', prefix: true },
	{ code: 'TWD', name: 'Новый тайваньский доллар', symbol: 'NT$', prefix: true },
];

export const CURRENCY_BY_CODE: Record<string, CurrencyInfo> = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

/** Currencies typically shown without decimal places */
export const ZERO_DECIMAL = new Set(['KZT', 'RUB', 'JPY', 'KRW', 'VND', 'CLP', 'IDR', 'ISK', 'HUF', 'TWD']);

/**
 * Symbol/text -> ISO code, longest match first so "CN¥" wins over "¥".
 * Only unambiguous mappings — ambiguous ones (kr, R, L) are intentionally skipped.
 * Includes Cyrillic Steam formats: "руб." (RUB), "тг"/"тенге" (KZT).
 */
export const SYMBOL_TO_CODE: Record<string, string> = {
	'CN¥': 'CNY',
	'Mex$': 'MXN',
	'COL$': 'COP',
	'NT$': 'TWD',
	'AED': 'AED',
	'SAR': 'SAR',
	'CLP': 'CLP',
	'AR$': 'ARS',
	'A$': 'AUD',
	'C$': 'CAD',
	'NZ$': 'NZD',
	'HK$': 'HKD',
	'S$': 'SGD',
	'R$': 'BRL',
	'руб.': 'RUB',
	'руб': 'RUB',
	'pуб.': 'RUB',
	'pуб': 'RUB',
	'тенге': 'KZT',
	'тг': 'KZT',
	'сўм': 'UZS',
	'сом': 'KGS',
	'лв': 'BGN',
	'дин': 'RSD',
	'zł': 'PLN',
	'Kč': 'CZK',
	'lei': 'RON',
	'Ft': 'HUF',
	'CHF': 'CHF',
	'Rp': 'IDR',
	'RM': 'MYR',
	'Br': 'BYN',
	'₸': 'KZT',
	'₽': 'RUB',
	'₴': 'UAH',
	'₾': 'GEL',
	'֏': 'AMD',
	'₼': 'AZN',
	'₺': 'TRY',
	'₩': 'KRW',
	'₹': 'INR',
	'₪': 'ILS',
	'฿': 'THB',
	'₱': 'PHP',
	'₫': 'VND',
	'£': 'GBP',
	'€': 'EUR',
	'$': 'USD',
	'¥': 'JPY',
};

/** Ordered symbol keys, longest first for correct matching */
export const SYMBOL_KEYS = Object.keys(SYMBOL_TO_CODE).sort((a, b) => b.length - a.length);
