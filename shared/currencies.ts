export interface CurrencyInfo {
	code: string;
	name: string;
	nameEn: string;
	symbol: string;
	/** true if the symbol goes before the amount ($19.99), false if after (999 ₽) */
	prefix: boolean;
}

export const CURRENCIES: CurrencyInfo[] = [
	{ code: 'RUB', name: 'Российский рубль', nameEn: 'Russian ruble', symbol: '₽', prefix: false },
	{ code: 'KZT', name: 'Казахстанский тенге', nameEn: 'Kazakhstani tenge', symbol: '₸', prefix: false },
	{ code: 'USD', name: 'Доллар США', nameEn: 'US dollar', symbol: '$', prefix: true },
	{ code: 'EUR', name: 'Евро', nameEn: 'Euro', symbol: '€', prefix: true },
	{ code: 'UAH', name: 'Украинская гривна', nameEn: 'Ukrainian hryvnia', symbol: '₴', prefix: false },
	{ code: 'BYN', name: 'Белорусский рубль', nameEn: 'Belarusian ruble', symbol: 'Br', prefix: false },
	{ code: 'AMD', name: 'Армянский драм', nameEn: 'Armenian dram', symbol: '֏', prefix: false },
	{ code: 'AZN', name: 'Азербайджанский манат', nameEn: 'Azerbaijani manat', symbol: '₼', prefix: false },
	{ code: 'UZS', name: 'Узбекский сум', nameEn: 'Uzbekistani som', symbol: 'сўм', prefix: false },
	{ code: 'KGS', name: 'Киргизский сом', nameEn: 'Kyrgyzstani som', symbol: 'сом', prefix: false },
	{ code: 'TJS', name: 'Таджикский сомони', nameEn: 'Tajikistani somoni', symbol: 'sm', prefix: false },
	{ code: 'GEL', name: 'Грузинский лари', nameEn: 'Georgian lari', symbol: '₾', prefix: false },
	{ code: 'MDL', name: 'Молдавский лей', nameEn: 'Moldovan leu', symbol: 'L', prefix: false },
	{ code: 'TRY', name: 'Турецкая лира', nameEn: 'Turkish lira', symbol: '₺', prefix: true },
	{ code: 'CNY', name: 'Китайский юань', nameEn: 'Chinese yuan', symbol: 'CN¥', prefix: true },
	{ code: 'GBP', name: 'Фунт стерлингов', nameEn: 'Pound sterling', symbol: '£', prefix: true },
	{ code: 'JPY', name: 'Японская иена', nameEn: 'Japanese yen', symbol: '¥', prefix: true },
	{ code: 'CHF', name: 'Швейцарский франк', nameEn: 'Swiss franc', symbol: 'CHF', prefix: true },
	{ code: 'KRW', name: 'Южнокорейская вона', nameEn: 'South Korean won', symbol: '₩', prefix: true },
	{ code: 'INR', name: 'Индийская рупия', nameEn: 'Indian rupee', symbol: '₹', prefix: true },
	{ code: 'BRL', name: 'Бразильский реал', nameEn: 'Brazilian real', symbol: 'R$', prefix: true },
	{ code: 'AUD', name: 'Австралийский доллар', nameEn: 'Australian dollar', symbol: 'A$', prefix: true },
	{ code: 'CAD', name: 'Канадский доллар', nameEn: 'Canadian dollar', symbol: 'C$', prefix: true },
	{ code: 'NZD', name: 'Новозеландский доллар', nameEn: 'New Zealand dollar', symbol: 'NZ$', prefix: true },
	{ code: 'HKD', name: 'Гонконгский доллар', nameEn: 'Hong Kong dollar', symbol: 'HK$', prefix: true },
	{ code: 'SGD', name: 'Сингапурский доллар', nameEn: 'Singapore dollar', symbol: 'S$', prefix: true },
	{ code: 'MXN', name: 'Мексиканское песо', nameEn: 'Mexican peso', symbol: 'Mex$', prefix: true },
	{ code: 'ARS', name: 'Аргентинское песо', nameEn: 'Argentine peso', symbol: 'AR$', prefix: true },
	{ code: 'CLP', name: 'Чилийское песо', nameEn: 'Chilean peso', symbol: 'CLP', prefix: true },
	{ code: 'COP', name: 'Колумбийское песо', nameEn: 'Colombian peso', symbol: 'COL$', prefix: true },
	{ code: 'PLN', name: 'Польский злотый', nameEn: 'Polish złoty', symbol: 'zł', prefix: false },
	{ code: 'CZK', name: 'Чешская крона', nameEn: 'Czech koruna', symbol: 'Kč', prefix: false },
	{ code: 'RON', name: 'Румынский лей', nameEn: 'Romanian leu', symbol: 'lei', prefix: false },
	{ code: 'BGN', name: 'Болгарский лев', nameEn: 'Bulgarian lev', symbol: 'лв', prefix: false },
	{ code: 'RSD', name: 'Сербский динар', nameEn: 'Serbian dinar', symbol: 'дин', prefix: false },
	{ code: 'HUF', name: 'Венгерский форинт', nameEn: 'Hungarian forint', symbol: 'Ft', prefix: false },
	{ code: 'SEK', name: 'Шведская крона', nameEn: 'Swedish krona', symbol: 'kr', prefix: false },
	{ code: 'NOK', name: 'Норвежская крона', nameEn: 'Norwegian krone', symbol: 'kr', prefix: false },
	{ code: 'DKK', name: 'Датская крона', nameEn: 'Danish krone', symbol: 'kr', prefix: false },
	{ code: 'ZAR', name: 'Южноафриканский рэнд', nameEn: 'South African rand', symbol: 'R', prefix: false },
	{ code: 'ILS', name: 'Израильский шекель', nameEn: 'Israeli shekel', symbol: '₪', prefix: true },
	{ code: 'AED', name: 'Дирхам ОАЭ', nameEn: 'UAE dirham', symbol: 'AED', prefix: true },
	{ code: 'SAR', name: 'Саудовский риял', nameEn: 'Saudi riyal', symbol: 'SAR', prefix: true },
	{ code: 'THB', name: 'Тайский бат', nameEn: 'Thai baht', symbol: '฿', prefix: true },
	{ code: 'IDR', name: 'Индонезийская рупия', nameEn: 'Indonesian rupiah', symbol: 'Rp', prefix: true },
	{ code: 'MYR', name: 'Малайзийский ринггит', nameEn: 'Malaysian ringgit', symbol: 'RM', prefix: true },
	{ code: 'PHP', name: 'Филиппинское песо', nameEn: 'Philippine peso', symbol: '₱', prefix: true },
	{ code: 'VND', name: 'Вьетнамский донг', nameEn: 'Vietnamese dong', symbol: '₫', prefix: true },
	{ code: 'TWD', name: 'Новый тайваньский доллар', nameEn: 'New Taiwan dollar', symbol: 'NT$', prefix: true },
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
