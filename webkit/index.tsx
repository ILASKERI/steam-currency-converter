import { callable } from '@steambrew/webkit';
import { SYMBOL_KEYS, SYMBOL_TO_CODE, CURRENCY_BY_CODE, ZERO_DECIMAL, CURRENCIES } from '../shared/currencies';

const getRateRpc = callable<[{ from_currency: string; to_currency: string }], number>('get_rate');
const getSettingsRpc = callable<[], string>('get_settings');
const setSettingRpc = callable<[{ key: string; value: unknown }], boolean>('set_setting');
const checkUpdatesRpc = callable<[], string>('check_updates');

interface Settings {
	enabled: boolean;
	targetCurrency: string;
	displayMode: 'next' | 'replace';
	steamPricing?: boolean;
}

interface NodeState {
	original: string;
	converted: string;
	signature: string;
	span?: HTMLElement;
	oldParentTitle?: string;
}

const DEFAULT_SETTINGS: Settings = { enabled: true, targetCurrency: 'RUB', displayMode: 'next' };

const CONVERTED_CLASS = 'mcc-converted';
const MAX_TEXT_LENGTH = 80;
const RATE_FAIL_TTL = 60_000;
const MCC_VERSION = '1.1.0';

let cachedSettings: Settings = { ...DEFAULT_SETTINGS };
const rateCache = new Map<string, number>();
const rateFailAt = new Map<string, number>();
const nodeState = new WeakMap<Text, NodeState>();

function settingsSignature(s: Settings): string {
	return `${s.enabled}|${s.targetCurrency}|${s.displayMode}|${s.steamPricing ?? false}`;
}

function getSettings(): Settings {
	return cachedSettings;
}

async function loadSettings(): Promise<Settings> {
	try {
		const raw = await getSettingsRpc();
		const parsed = JSON.parse(raw) as Partial<Settings>;
		cachedSettings = {
			enabled: parsed.enabled ?? DEFAULT_SETTINGS.enabled,
			targetCurrency: parsed.targetCurrency ?? DEFAULT_SETTINGS.targetCurrency,
			displayMode: parsed.displayMode ?? DEFAULT_SETTINGS.displayMode,
			steamPricing: parsed.steamPricing ?? false,
		};
	} catch (e) {
		console.warn('[mcc] get_settings failed, using cached/defaults', e);
	}
	return cachedSettings;
}

async function getRateCached(from: string, to: string): Promise<number> {
	if (from === to) {
		return 1;
	}
	const key = `${from}->${to}`;
	if (rateCache.has(key)) {
		return rateCache.get(key)!;
	}
	const failedAt = rateFailAt.get(key);
	if (failedAt !== undefined && Date.now() - failedAt < RATE_FAIL_TTL) {
		return 0;
	}
	try {
		const raw = await getRateRpc({ from_currency: from, to_currency: to });
		// Millennium IPC may deliver numbers as strings
		const rate = typeof raw === 'string' ? parseFloat(raw) : (raw as number);
		if (typeof rate === 'number' && isFinite(rate) && rate > 0) {
			rateCache.set(key, rate);
			return rate;
		}
		rateFailAt.set(key, Date.now());
	} catch (e) {
		console.error('[mcc] get_rate failed', e);
		rateFailAt.set(key, Date.now());
	}
	return 0;
}

function normalizeText(text: string): string {
	return text.replace(/[\u00A0\u202F\u2009\u2007]/g, ' ').trim();
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary matchers (no adjacent letters) so "Br" won't match "Brothers", "руб" won't match "рубашка" */
const SYMBOL_MATCHERS: { re: RegExp; code: string }[] = SYMBOL_KEYS.map((sym) => ({
	re: new RegExp(`(?<!\\p{L})${escapeRegExp(sym)}(?!\\p{L})`, 'u'),
	code: SYMBOL_TO_CODE[sym],
}));

function parsePrice(rawText: string): { amount: number; currency: string } | null {
	const text = normalizeText(rawText);
	if (!text || text.length > MAX_TEXT_LENGTH) {
		return null;
	}

	if (/^(free|free to play|бесплатно|бесплатный|тегiн|тегін|演示|무료)/i.test(text)) {
		return null;
	}

	let currency: string | null = null;
	let rest = text;

	for (const { re, code } of SYMBOL_MATCHERS) {
		if (re.test(rest)) {
			currency = code;
			rest = rest.replace(re, ' ');
			break;
		}
	}

	if (!currency) {
		const codeMatch = rest.match(
			/\b(RUB|KZT|USD|EUR|UAH|BYN|AMD|AZN|UZS|KGS|GEL|TRY|CNY|GBP|JPY|CHF|KRW|INR|BRL|AUD|CAD|NZD|HKD|SGD|MXN|ARS|CLP|COP|PLN|CZK|RON|BGN|HUF|SEK|NOK|DKK|ZAR|ILS|THB|IDR|MYR|PHP|VND|TWD|MDL|TJS)\b/i,
		);
		if (codeMatch) {
			currency = codeMatch[1].toUpperCase();
			rest = rest.replace(codeMatch[0], ' ');
		}
	}

	if (!currency) {
		return null;
	}

	// strip percentages so "−75% $14.99" doesn't parse as 75
	rest = rest.replace(/\d[\d.,]*\s*%/g, ' ');

	const numMatch = rest.match(/\d[\d\s.,'’]*/);
	if (!numMatch) {
		return null;
	}

	const parsed = parseNumber(numMatch[0]);
	if (parsed === null) {
		return null;
	}

	return { amount: parsed, currency };
}

function parseNumber(raw: string): number | null {
	let s = raw.replace(/[\s\u00A0\u202F\u2009'’]/g, '');
	if (!s) {
		return null;
	}

	const lastComma = s.lastIndexOf(',');
	const lastDot = s.lastIndexOf('.');

	if (lastComma >= 0 && lastDot >= 0) {
		if (lastComma > lastDot) {
			s = s.replace(/\./g, '').replace(',', '.');
		} else {
			s = s.replace(/,/g, '');
		}
	} else if (lastComma >= 0) {
		const after = s.length - lastComma - 1;
		const commas = s.split(',').length - 1;
		if (commas > 1 || (commas === 1 && after === 3 && s.length >= 5)) {
			s = s.replace(/,/g, '');
		} else if (commas === 1 && after <= 2) {
			s = s.replace(',', '.');
		} else {
			s = s.replace(/,/g, '');
		}
	} else if (lastDot >= 0) {
		const after = s.length - lastDot - 1;
		const dots = s.split('.').length - 1;
		if (dots > 1 || (dots === 1 && after === 3 && s.length >= 5)) {
			s = s.replace(/\./g, '');
		}
	}

	const n = parseFloat(s);
	return isFinite(n) && n > 0 ? n : null;
}

/** Steam-style .99 endings */
function steamRound(amount: number): number {
	const floor = Math.floor(amount);
	const lower = floor - 0.01;
	const upper = floor + 0.99;
	const pick = amount - lower <= upper - amount ? lower : upper;
	return Math.max(0.99, pick);
}

function formatConverted(amount: number, currencyCode: string, steamPricing = false): string {
	const info = CURRENCY_BY_CODE[currencyCode];
	const symbol = info?.symbol ?? currencyCode;
	const zeroDec = ZERO_DECIMAL.has(currencyCode);

	if (steamPricing) {
		amount = steamRound(amount);
	}

	let numStr: string;
	if (zeroDec) {
		const rounded = Math.round(amount);
		numStr = rounded >= 1 ? String(rounded) : amount.toFixed(2);
	} else {
		numStr = amount.toFixed(2).replace(/\.00$/, '');
	}

	const parts = numStr.split('.');
	parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
	numStr = parts.join(info?.prefix ? '.' : ',');

	if (info?.prefix) {
		return `${symbol}${numStr}`;
	}
	return `${numStr} ${symbol}`;
}

function isSkippedNode(node: Text): boolean {
	const parent = node.parentElement;
	if (!parent) {
		return true;
	}
	const tag = parent.tagName;
	if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA' || tag === 'INPUT') {
		return true;
	}
	if (parent.closest(`.${CONVERTED_CLASS}`)) {
		return true;
	}
	return false;
}

async function processTextNode(node: Text): Promise<void> {
	if (isSkippedNode(node)) {
		return;
	}

	const state = nodeState.get(node);
	const current = node.textContent ?? '';
	const settings = getSettings();
	const sig = settingsSignature(settings);

	if (state && state.signature === sig) {
		// replace mode: text already holds our conversion
		if (settings.displayMode === 'replace' && current === state.converted) {
			return;
		}
		// next mode: our own span is still attached
		if (settings.displayMode === 'next' && current === state.original && state.span && state.span.isConnected) {
			return;
		}
		// cached as non-price / already in target currency
		if (!state.converted && current === state.original) {
			return;
		}
	}

	let original: string;
	if (state && (current === state.original || current === state.converted)) {
		restoreNode(node, state);
		original = state.original;
	} else {
		// node shows foreign content (React reused it): drop stale state, never overwrite it
		if (state) {
			if (state.span && state.span.isConnected) {
				state.span.remove();
			}
			nodeState.delete(node);
		}
		original = current;
	}

	if (!original || original.length > 500) {
		return;
	}

	const parsed = parsePrice(original);
	if (!parsed) {
		if (isFreeLabel(normalizeText(original)) || isZeroPrice(original)) {
			markFreeTooltip(node);
		}
		nodeState.set(node, { original, converted: '', signature: sig });
		return;
	}

	if (parsed.currency === settings.targetCurrency) {
		nodeState.set(node, { original, converted: '', signature: sig });
		return;
	}

	const rate = await getRateCached(parsed.currency, settings.targetCurrency);
	if (!rate) {
		return;
	}

	if (!node.isConnected) {
		return;
	}
	if (node.textContent !== original) {
		return;
	}

	const fresh = getSettings();
	if (!fresh.enabled) {
		return;
	}

	// someone converted this node while we awaited the rate
	if (fresh.displayMode !== 'replace') {
		const next = node.nextSibling;
		if (next instanceof HTMLElement && next.classList.contains(CONVERTED_CLASS)) {
			return;
		}
	}

	const converted = formatConverted(parsed.amount * rate, fresh.targetCurrency, fresh.steamPricing ?? false);
	const rateTitle = `1 ${parsed.currency} = ${rate.toFixed(4)} ${fresh.targetCurrency} · Steam Currency Converter`;

	if (fresh.displayMode === 'replace') {
		const parent = node.parentElement;
		nodeState.set(node, {
			original,
			converted,
			signature: settingsSignature(fresh),
			oldParentTitle: parent?.getAttribute('title'),
		});
		node.textContent = converted;
		if (parent) {
			parent.setAttribute('title', rateTitle);
		}
	} else {
		const span = document.createElement('span');
		span.className = CONVERTED_CLASS;
		span.textContent = ` ≈ ${converted}`;
		span.title = rateTitle;
		span.style.cssText = 'opacity:.65;font-size:.85em;margin-left:2px;white-space:nowrap;cursor:help;';
		node.after(span);
		nodeState.set(node, { original, converted, signature: settingsSignature(fresh), span });
	}
}

function restoreNode(node: Text, state: NodeState): void {
	if (state.span) {
		if (state.span.isConnected) {
			state.span.remove();
		}
	} else {
		const prev = node.previousSibling;
		if (prev instanceof HTMLElement && prev.classList.contains(CONVERTED_CLASS)) {
			prev.remove();
		}
		const next = node.nextSibling;
		if (next instanceof HTMLElement && next.classList.contains(CONVERTED_CLASS)) {
			next.remove();
		}
		const parent = node.parentElement;
		if (parent) {
			if (state.oldParentTitle === undefined || state.oldParentTitle === null) {
				parent.removeAttribute('title');
			} else {
				parent.setAttribute('title', state.oldParentTitle);
			}
		}
	}
	node.textContent = state.original;
}

function collectTextNodes(root: ParentNode): Text[] {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			if (isSkippedNode(node as Text)) {
				return NodeFilter.FILTER_REJECT;
			}
			return NodeFilter.FILTER_ACCEPT;
		},
	});
	const nodes: Text[] = [];
	let current = walker.nextNode();
	while (current) {
		nodes.push(current as Text);
		current = walker.nextNode();
	}
	return nodes;
}

let scanning = false;
let rescanRequested = false;

async function scan(): Promise<void> {
	if (scanning) {
		rescanRequested = true;
		return;
	}
	scanning = true;
	try {
		const settings = getSettings();

		if (!settings.enabled) {
			document.querySelectorAll(`.${CONVERTED_CLASS}`).forEach((n) => n.remove());
			const all = collectTextNodes(document.body);
			for (const n of all) {
				const st = nodeState.get(n);
				if (st) {
					restoreNode(n, st);
					nodeState.delete(n);
				}
			}
			return;
		}

		const nodes = collectTextNodes(document.body);
		const BATCH = 40;
		for (let i = 0; i < nodes.length; i += BATCH) {
			await Promise.all(nodes.slice(i, i + BATCH).map((n) => processTextNode(n)));
		}

		if (location.pathname.startsWith('/account/history/')) {
			void buildHistorySummary();
		}
	} finally {
		scanning = false;
		if (rescanRequested) {
			rescanRequested = false;
			scheduleScan();
		}
	}
}

let scanScheduled = false;
function scheduleScan(): void {
	if (scanScheduled) {
		return;
	}
	scanScheduled = true;
	setTimeout(() => {
		scanScheduled = false;
		void scan();
	}, 300);
}

function hookHistory(): void {
	const origPush = history.pushState;
	const origReplace = history.replaceState;
	history.pushState = function (...args) {
		const r = origPush.apply(this, args);
		scheduleScan();
		return r;
	};
	history.replaceState = function (...args) {
		const r = origReplace.apply(this, args);
		scheduleScan();
		return r;
	};
	window.addEventListener('popstate', () => scheduleScan());
}

// ---------------------------------------------------------------------------
// "Free = paid with 100% discount" tooltip
// ---------------------------------------------------------------------------

const FREE_TIP_CLASS = 'mcc-freetip';
const freeHoverSet = new WeakSet<Element>();
let freeTipEl: HTMLElement | null = null;

function detectSteamLanguage(): string {
	const m = document.cookie.match(/(?:^|;\s*)Steam_Language=([^;]+)/);
	return m ? decodeURIComponent(m[1]).toLowerCase() : 'en';
}

/** Pick a string by Steam client language */
function t(ru: string, en: string): string {
	return detectSteamLanguage() === 'russian' ? ru : en;
}

function freeTooltipText(): string {
	return detectSteamLanguage() === 'russian'
		? 'Бесплатно — это платно, но со скидкой 100%'
		: 'Free is just paid with a 100% discount';
}

function isFreeLabel(text: string): boolean {
	return /^(free|free to play|бесплатно|бесплатный|тегiн|тегін)/i.test(text);
}

function isZeroPrice(text: string): boolean {
	const norm = normalizeText(text);
	for (const { re } of SYMBOL_MATCHERS) {
		if (re.test(norm)) {
			const rest = norm.replace(re, ' ');
			const m = rest.match(/\d[\d\s.,]*/);
			if (!m) {
				return false;
			}
			const digits = m[0].replace(/[^\d]/g, '');
			return digits.length > 0 && /^0+$/.test(digits);
		}
	}
	return false;
}

function ensureFreeTip(): HTMLElement {
	if (freeTipEl && freeTipEl.isConnected) {
		return freeTipEl;
	}
	const tip = document.createElement('div');
	tip.className = FREE_TIP_CLASS;
	document.body.appendChild(tip);
	freeTipEl = tip;
	return tip;
}

function showFreeTip(anchor: Element, e: MouseEvent): void {
	const tip = ensureFreeTip();
	tip.textContent = freeTooltipText();
	tip.classList.add('mcc-show');
	moveFreeTip(e);
	void anchor;
}

function moveFreeTip(e: MouseEvent): void {
	const tip = freeTipEl;
	if (!tip) {
		return;
	}
	const w = tip.offsetWidth || 180;
	const h = tip.offsetHeight || 30;
	const x = Math.min(window.innerWidth - w - 8, e.clientX + 14);
	const y = Math.min(window.innerHeight - h - 8, e.clientY + 18);
	tip.style.left = `${x}px`;
	tip.style.top = `${y}px`;
}

function hideFreeTip(): void {
	freeTipEl?.classList.remove('mcc-show');
}

function markFreeTooltip(node: Text): void {
	const parent = node.parentElement;
	if (!parent || freeHoverSet.has(parent)) {
		return;
	}
	freeHoverSet.add(parent);
	parent.addEventListener('mouseenter', (e) => showFreeTip(parent, e as MouseEvent));
	parent.addEventListener('mousemove', (e) => moveFreeTip(e as MouseEvent));
	parent.addEventListener('mouseleave', hideFreeTip);
}

// ---------------------------------------------------------------------------
// Purchase history summary (store.steampowered.com/account/history/)
// ---------------------------------------------------------------------------

const HISTORY_MARKER = 'mcc-history-summary';
let lastHistoryRowCount = 0;

interface YearTotal {
	year: string;
	amount: number;
	currency: string;
}

async function buildHistorySummary(): Promise<void> {
	if (!location.pathname.startsWith('/account/history/')) {
		return;
	}
	const rowCount = document.querySelectorAll('table.wallet_history_table tbody tr').length;
	const existing = document.querySelector(`.${HISTORY_MARKER}`);
	if (existing && rowCount === lastHistoryRowCount) {
		return; // nothing new since the last build
	}

	const tables = document.querySelectorAll('table.wallet_history_table');
	const trs = document.querySelectorAll('table.wallet_history_table tbody tr');
	if (!trs.length) {
		return;
	}
	lastHistoryRowCount = trs.length;
	existing?.remove();

	const settings = getSettings();
	const totals = new Map<string, { total: number; currency: string }>();

	for (const tr of trs) {
		const typeEl = tr.querySelector('.wht_type');
		const type = (typeEl?.firstElementChild?.textContent ?? typeEl?.textContent ?? '').trim();
		if (!/purchase|покупк/i.test(type)) {
			continue; // skip refunds, gifts, top-ups, market ops
		}
		const year = (tr.querySelector('.wht_date')?.textContent ?? '').match(/\d{4}/)?.[0];
		if (!year) {
			continue;
		}
		// the grand total of the transaction (note: wht_total, Steam alternates wht_/wth_ prefixes)
		const text = (tr.querySelector('.wht_total')?.textContent ?? '').trim();
		const parsed = parsePrice(text);
		if (!parsed) {
			continue;
		}
		const cur = totals.get(year);
		if (cur && cur.currency === parsed.currency) {
			cur.total += parsed.amount;
		} else if (!cur) {
			totals.set(year, { total: parsed.amount, currency: parsed.currency });
		}
	}

	if (!totals.size) {
		return;
	}

	const years: YearTotal[] = [...totals.entries()]
		.map(([year, v]) => ({ year, amount: v.total, currency: v.currency }))
		.sort((a, b) => a.year.localeCompare(b.year));

	const grand = years.reduce((acc, y) => acc + y.amount, 0);
	const grandCurrency = years[0].currency;

	let grandConverted = '';
	if (settings.enabled && grandCurrency !== settings.targetCurrency) {
		const rate = await getRateCached(grandCurrency, settings.targetCurrency);
		if (rate > 0) {
			grandConverted = ` ≈ ${formatConverted(grand * rate, settings.targetCurrency)}`;
		}
	}

	const box = document.createElement('div');
	box.className = HISTORY_MARKER;
	box.style.cssText =
		'margin:16px 0;padding:16px 20px;border-radius:10px;background:linear-gradient(180deg,rgba(16,18,27,.72),rgba(38,46,68,.72));backdrop-filter:blur(16px) saturate(150%);-webkit-backdrop-filter:blur(16px) saturate(150%);border:1px solid rgba(140,160,190,.28);box-shadow:0 12px 32px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.07);color:#c6d4df;font-family:Inter,\'Motiva Sans\',\'Segoe UI\',Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;letter-spacing:-.01em;position:relative;overflow:hidden;';

	const decor = document.createElement('div');
	decor.style.cssText =
		'position:absolute;right:26px;top:22px;font-size:74px;font-weight:700;opacity:.09;color:#66c0f4;pointer-events:none;line-height:1;font-family:Georgia,serif;';
	decor.textContent = '\u03A3';
	const glow = document.createElement('div');
	glow.style.cssText =
		'position:absolute;left:-40px;top:-40px;width:220px;height:220px;background:radial-gradient(circle,rgba(255,117,26,.10) 0%,transparent 70%);pointer-events:none;';

	const title = document.createElement('div');
	title.style.cssText = 'font-size:17px;font-weight:700;color:#eef1f8;letter-spacing:-.02em;margin-bottom:4px;';
	title.textContent = t('Всего потрачено в Steam', 'Total spent on Steam');
	const accent = document.createElement('div');
	accent.style.cssText = 'width:64px;height:3px;background:#ff751a;border-radius:2px;margin:0 0 12px 0;';

	const grandLine = document.createElement('div');
	grandLine.style.cssText = 'font-size:26px;font-weight:700;color:#66c0f4;margin-bottom:10px;';
	grandLine.textContent = `${formatConverted(grand, grandCurrency)}${grandConverted}`;

	const loadMoreBtn = document.createElement('button');
	loadMoreBtn.type = 'button';
	loadMoreBtn.textContent = t('↓ Загрузить ещё транзакции', '↓ Load more transactions');
	loadMoreBtn.style.cssText =
		'margin-top:12px;display:block;margin-left:auto;margin-right:auto;width:fit-content;padding:7px 18px;border-radius:999px;background:rgba(13,19,28,.7);color:#66c0f4;border:1px solid #2a475e;font-family:inherit;font-size:12.5px;font-weight:500;letter-spacing:-.01em;cursor:pointer;transition:background .12s ease,color .12s ease;-webkit-font-smoothing:antialiased;';
	loadMoreBtn.addEventListener('mouseenter', () => (loadMoreBtn.style.background = '#2a475e'));
	loadMoreBtn.addEventListener('mouseleave', () => (loadMoreBtn.style.background = 'rgba(13,19,28,.7)'));
	loadMoreBtn.addEventListener('click', () => {
		const before = document.querySelectorAll('table.wallet_history_table tbody tr').length;
		const candidates = Array.from(document.querySelectorAll('a, button, div')).filter((el) => {
			const text = (el.textContent ?? '').trim();
			return (
				text.length < 60 &&
				(/^загруз/i.test(text) || /^(load|show) more/i.test(text)) &&
				el !== loadMoreBtn &&
				!loadMoreBtn.contains(el) &&
				(el as HTMLElement).offsetParent !== null
			);
		});
		console.log(
			'[mcc] load-more clicking:',
			JSON.stringify(candidates.map((el) => `${el.tagName}.${(el.className || '').toString().slice(0, 30)}`)),
		);
		for (const el of candidates) {
			(el as HTMLElement).click();
		}
		loadMoreBtn.textContent = t('…загружаем', '…loading');
		setTimeout(() => {
			const after = document.querySelectorAll('table.wallet_history_table tbody tr').length;
			console.log(`[mcc] load-more result: rows ${before} -> ${after}`);
			loadMoreBtn.textContent = t('↓ Загрузить ещё транзакции', '↓ Load more transactions');
		}, 2500);
	});

	const chart = document.createElement('div');
	chart.style.cssText =
		'display:flex;align-items:flex-end;gap:14px;height:130px;margin-top:14px;padding:8px 4px 0;border-top:1px solid rgba(140,160,190,.15);';
	const maxTotal = Math.max(...years.map((y) => y.amount));
	for (const y of years) {
		const col = document.createElement('div');
		col.style.cssText =
			'flex:1;max-width:110px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;';
		const amount = document.createElement('div');
		amount.style.cssText = 'font-size:10.5px;color:#8f98a0;margin-bottom:4px;white-space:nowrap;';
		amount.textContent = formatConverted(y.amount, y.currency);
		const bar = document.createElement('div');
		const barHeight = Math.max(4, Math.round((y.amount / maxTotal) * 78));
		bar.style.cssText = `width:68%;min-width:26px;height:${barHeight}px;background:linear-gradient(180deg,#66c0f4 0%,#1a68a2 100%);border-radius:3px 3px 0 0;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);transition:filter .12s ease;cursor:default;`;
		bar.addEventListener('mouseenter', () => (bar.style.filter = 'brightness(1.25)'));
		bar.addEventListener('mouseleave', () => (bar.style.filter = ''));
		const yearLabel = document.createElement('div');
		yearLabel.style.cssText = 'font-size:12px;color:#67c1f5;margin-top:5px;';
		yearLabel.textContent = y.year;
		col.appendChild(amount);
		col.appendChild(bar);
		col.appendChild(yearLabel);
		chart.appendChild(col);
	}

	box.appendChild(decor);
	box.appendChild(glow);

	const content = document.createElement('div');
	content.style.cssText = 'position:relative;';
	box.appendChild(content);
	content.appendChild(title);
	content.appendChild(accent);
	content.appendChild(grandLine);
	content.appendChild(chart);
	content.appendChild(loadMoreBtn);

	const container = document.querySelector('.accountbilling_content') ?? tables[0].parentElement;
	if (container) {
		container.insertBefore(box, container.firstChild);
	}
}

function injectStyle(): void {
	const style = document.createElement('style');
	style.textContent = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
.${CONVERTED_CLASS}{opacity:.65;font-size:.85em;margin-left:2px;white-space:nowrap;}
.mcc-cursel{position:fixed;top:56px;right:16px;z-index:999999;background:linear-gradient(180deg,rgba(16,18,27,.72) 0%,rgba(38,46,68,.72) 100%);backdrop-filter:blur(16px) saturate(150%);-webkit-backdrop-filter:blur(16px) saturate(150%);border:1px solid rgba(140,160,190,.28);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07);font-family:'Inter','Motiva Sans','Segoe UI',Arial,sans-serif;color:#c6d4df;width:290px;padding:12px;overflow:hidden;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;letter-spacing:-.01em;animation:mcc-in .22s cubic-bezier(.2,.7,.3,1);}
@keyframes mcc-in{from{opacity:0;transform:translateY(-10px) scale(.97);}to{opacity:1;transform:none;}}
@keyframes mcc-out{to{opacity:0;transform:translateY(-8px) scale(.97);}}
.mcc-cursel.mcc-closing{animation:mcc-out .16s ease-in forwards;pointer-events:none;}
.mcc-cursel::before{content:'\\20B8\\20AC';position:absolute;right:-8px;top:-34px;font-size:92px;font-weight:700;opacity:.07;color:#a7aec0;pointer-events:none;}
.mcc-cursel::after{content:'\\20BD\\0024';position:absolute;right:14px;bottom:-46px;font-size:74px;font-weight:700;opacity:.05;color:#a7aec0;pointer-events:none;}
.mcc-cursel>*{position:relative;z-index:1;}
.mcc-cursel .mcc-title{font-size:15px;font-weight:700;color:#eef1f8;letter-spacing:-.02em;margin-bottom:3px;}
.mcc-cursel .mcc-underline{width:64px;height:3px;background:#ff751a;border-radius:2px;margin-bottom:10px;}
.mcc-cursel input{width:100%;box-sizing:border-box;background:rgba(13,19,28,.7);color:#fff;border:1px solid #2a475e;border-radius:3px;padding:7px 9px;font-size:14px;outline:none;margin-bottom:8px;}
.mcc-cursel input:focus{border-color:#66c0f4;}
.mcc-cursel ul{list-style:none;margin:0;padding:0;max-height:280px;overflow-y:auto;}
.mcc-cursel li{padding:6px 9px;border-radius:6px;cursor:pointer;font-size:13px;display:flex;justify-content:space-between;gap:8px;transition:background .12s ease;}
.mcc-cursel li:hover{background:#2a475e;color:#fff;}
.mcc-cursel li.active{background:#3d4450;color:#66c0f4;}
.mcc-cursel .mcc-quickrow{display:flex;gap:6px;margin-bottom:8px;}
.mcc-cursel .mcc-btn{flex:1;background:rgba(13,19,28,.7);color:#66c0f4;border:1px solid #2a475e;border-radius:6px;padding:6px 8px;font-size:12.5px;font-weight:500;cursor:pointer;transition:background .12s ease,color .12s ease;}
.mcc-cursel .mcc-btn:hover{background:#2a475e;color:#fff;}
.mcc-cursel .mcc-btn.mcc-off{color:#ff6b6b;}
.mcc-cursel .mcc-footer{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:11px;color:#67c1f5;}
.mcc-cursel .mcc-ver{opacity:.9;}
.mcc-cursel .mcc-ver-status{cursor:pointer;text-decoration:underline dotted;}
.mcc-cursel .mcc-ver-status.mcc-upd{color:#ff751a;font-weight:700;text-decoration:none;}
.mcc-cursel .mcc-note{font-size:11px;color:#67c1f5;margin-top:6px;text-align:center;opacity:.8;}
.mcc-cursel .mcc-title{cursor:grab;user-select:none;touch-action:none;-webkit-user-drag:none;}
.mcc-cursel .mcc-title:active{cursor:grabbing;}
body.mcc-dragging{user-select:none !important;cursor:grabbing !important;}
body.mcc-dragging a{pointer-events:none;}
.mcc-freetip{position:fixed;z-index:1000000;pointer-events:none;padding:8px 12px;border-radius:8px;background:rgba(16,18,27,.88);backdrop-filter:blur(12px) saturate(140%);-webkit-backdrop-filter:blur(12px) saturate(140%);border:1px solid rgba(140,160,190,.3);color:#eef1f8;font-family:'Inter','Motiva Sans',Arial,sans-serif;font-size:12.5px;font-weight:500;letter-spacing:-.01em;box-shadow:0 8px 24px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08);opacity:0;transform:translateY(4px);transition:opacity .12s ease,transform .12s ease;-webkit-font-smoothing:antialiased;}
.mcc-freetip.mcc-show{opacity:1;transform:none;}
.mcc-fab{position:fixed;right:14px;bottom:120px;z-index:999998;width:42px;height:42px;border-radius:50%;background:linear-gradient(180deg,rgba(38,46,68,.85),rgba(16,18,27,.85));backdrop-filter:blur(10px) saturate(140%);-webkit-backdrop-filter:blur(10px) saturate(140%);border:1px solid rgba(140,160,190,.3);box-shadow:0 6px 18px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-family:'Inter',Arial,sans-serif;font-size:17px;font-weight:600;color:#66c0f4;cursor:grab;user-select:none;touch-action:none;-webkit-user-drag:none;opacity:.55;transition:opacity .15s ease,box-shadow .15s ease;}
.mcc-fab:hover{opacity:1;box-shadow:0 8px 24px rgba(0,0,0,.6),0 0 0 2px rgba(102,192,244,.3),inset 0 1px 0 rgba(255,255,255,.1);}
.mcc-fab:active{cursor:grabbing;}`;
	if (document.head) {
		document.head.appendChild(style);
	} else {
		document.addEventListener('DOMContentLoaded', () => document.head?.appendChild(style), { once: true });
	}
}

let currencyPanel: HTMLElement | null = null;
let fabEl: HTMLElement | null = null;

function clampToViewport(x: number, y: number, w: number, h: number): { x: number; y: number } {
	return {
		x: Math.max(0, Math.min(window.innerWidth - w, x)),
		y: Math.max(0, Math.min(window.innerHeight - h, y)),
	};
}

function savePos(key: string, x: number, y: number): void {
	try {
		localStorage.setItem(key, JSON.stringify({ x, y }));
	} catch {
		/* private mode etc */
	}
}

function loadPos(key: string): { x: number; y: number } | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) {
			return null;
		}
		return JSON.parse(raw) as { x: number; y: number };
	} catch {
		return null;
	}
}

/**
 * Makes an element draggable by `handle`. Interactive children are excluded.
 * `onClick` fires on pointerup if it was a click, not a drag.
 */
function makeDraggable(el: HTMLElement, handle: HTMLElement, key: string, onClick?: () => void): void {
	handle.addEventListener('dragstart', (e) => e.preventDefault());
	handle.addEventListener('pointerdown', (e) => {
		if (e.button !== 0) {
			return;
		}
		if ((e.target as HTMLElement).closest('button, input, li, a, .mcc-ver-status')) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		try {
			handle.setPointerCapture(e.pointerId);
		} catch {
			/* pointer already gone */
		}

		const rect = el.getBoundingClientRect();
		const offX = e.clientX - rect.left;
		const offY = e.clientY - rect.top;
		const startX = e.clientX;
		const startY = e.clientY;
		let moved = false;

		const move = (ev: PointerEvent): void => {
			if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) {
				moved = true;
				document.body.classList.add('mcc-dragging');
			}
			if (!moved) {
				return;
			}
			const pos = clampToViewport(ev.clientX - offX, ev.clientY - offY, rect.width, rect.height);
			el.style.left = `${pos.x}px`;
			el.style.top = `${pos.y}px`;
			el.style.right = 'auto';
			el.style.bottom = 'auto';
		};
		const finish = (): void => {
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', finish);
			handle.removeEventListener('pointercancel', finish);
			document.body.classList.remove('mcc-dragging');
			if (moved) {
				const r = el.getBoundingClientRect();
				savePos(key, r.left, r.top);
			} else if (onClick) {
				onClick();
			}
		};

		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', finish);
		handle.addEventListener('pointercancel', finish);
	});
}

function updateFabSymbol(): void {
	if (!fabEl) {
		return;
	}
	const info = CURRENCY_BY_CODE[cachedSettings.targetCurrency];
	fabEl.textContent = info?.symbol ?? cachedSettings.targetCurrency;
}

function createFloatingButton(): void {
	if (fabEl || !document.body) {
		return;
	}
	const fab = document.createElement('div');
	fab.className = 'mcc-fab';
	fab.title = 'Steam Currency Converter — Alt+C';
	const saved = loadPos('mcc_fab_pos');
	if (saved) {
		const pos = clampToViewport(saved.x, saved.y, 42, 42);
		fab.style.left = `${pos.x}px`;
		fab.style.top = `${pos.y}px`;
		fab.style.right = 'auto';
		fab.style.bottom = 'auto';
	}
	document.body.appendChild(fab);
	fabEl = fab;
	makeDraggable(fab, fab, 'mcc_fab_pos', () => openCurrencyPanel());
	updateFabSymbol();
}

function closeCurrencyPanel(): void {
	if (currencyPanel) {
		const panel = currencyPanel;
		currencyPanel = null;
		panel.classList.add('mcc-closing');
		setTimeout(() => panel.remove(), 170);
	}
}

async function applyQuickSetting(key: 'enabled' | 'displayMode' | 'targetCurrency', value: unknown): Promise<void> {
	try {
		await setSettingRpc({ key, value });
		if (key === 'enabled') {
			cachedSettings.enabled = value as boolean;
		} else if (key === 'displayMode') {
			cachedSettings.displayMode = value as Settings['displayMode'];
		} else {
			cachedSettings.targetCurrency = value as string;
			updateFabSymbol();
		}
		if (currencyPanel) {
			renderQuickHeader();
			renderCurrencyList(currencyPanel.querySelector('input')?.value ?? '');
		}
		scheduleScan();
	} catch (e) {
		console.error('[mcc] set_setting failed', e);
	}
}

function renderQuickHeader(): void {
	if (!currencyPanel) {
		return;
	}
	const onBtn = currencyPanel.querySelector('.mcc-btn-enabled');
	const modeBtn = currencyPanel.querySelector('.mcc-btn-mode');
	if (onBtn) {
		onBtn.textContent = cachedSettings.enabled ? t('● Вкл', '● ON') : t('○ Выкл', '○ OFF');
		onBtn.classList.toggle('mcc-off', !cachedSettings.enabled);
	}
	if (modeBtn) {
		modeBtn.textContent =
			cachedSettings.displayMode === 'replace'
				? t('Режим: замена', 'Mode: Replace')
				: t('Режим: рядом', 'Mode: Next');
	}
}

function renderCurrencyList(filter: string): void {
	if (!currencyPanel) {
		return;
	}
	const list = currencyPanel.querySelector('ul');
	if (!list) {
		return;
	}
	const q = filter.trim().toLowerCase();
	const current = cachedSettings.targetCurrency;
	list.innerHTML = '';
	for (const c of CURRENCIES) {
		if (q && !c.code.toLowerCase().includes(q) && !c.name.toLowerCase().includes(q) && !c.nameEn.toLowerCase().includes(q)) {
			continue;
		}
		const li = document.createElement('li');
		li.textContent = `${c.code} (${c.symbol})`;
		const name = document.createElement('span');
		name.style.opacity = '.6';
		name.textContent = t(c.name, c.nameEn);
		li.appendChild(name);
		if (c.code === current) {
			li.classList.add('active');
		}
		li.addEventListener('click', (ev) => {
			ev.stopPropagation();
			void applyQuickSetting('targetCurrency', c.code);
		});
		list.appendChild(li);
	}
}

function versionToNum(v: string): number {
	return v
		.replace(/^v/, '')
		.split('.')
		.map((p) => parseInt(p, 10) || 0)
		.reduce((acc, part) => acc * 1000 + part, 0);
}

async function checkForUpdate(statusEl: HTMLElement): Promise<void> {
	statusEl.textContent = t('…проверяем', 'Checking…');
	statusEl.classList.remove('mcc-upd');
	try {
		const tag = await checkUpdatesRpc();
		const latest = (tag ?? '').replace(/^v/, '');
		if (latest && versionToNum(latest) > versionToNum(MCC_VERSION)) {
			statusEl.textContent = t(`доступна v${latest} →`, `v${latest} available →`);
			statusEl.classList.add('mcc-upd');
		} else if (latest) {
			statusEl.textContent = t('актуальна ✓', 'Up to date ✓');
		} else {
			statusEl.textContent = t('ошибка проверки', 'Check failed');
		}
	} catch {
		statusEl.textContent = t('ошибка проверки', 'Check failed');
	}
}

function openCurrencyPanel(): void {
	if (currencyPanel) {
		closeCurrencyPanel();
		return;
	}
	const panel = document.createElement('div');
	panel.className = 'mcc-cursel';

	const title = document.createElement('div');
	title.className = 'mcc-title';
	title.textContent = 'Steam Currency Converter';
	const underline = document.createElement('div');
	underline.className = 'mcc-underline';

	const header = document.createElement('div');
	header.className = 'mcc-quickrow';
	const onBtn = document.createElement('button');
	onBtn.className = 'mcc-btn mcc-btn-enabled';
	onBtn.type = 'button';
	const modeBtn = document.createElement('button');
	modeBtn.className = 'mcc-btn mcc-btn-mode';
	modeBtn.type = 'button';
	header.appendChild(onBtn);
	header.appendChild(modeBtn);

	const input = document.createElement('input');
	input.type = 'text';
	input.placeholder = t('Поиск валюты…', 'Search currency…');
	const list = document.createElement('ul');

	const footer = document.createElement('div');
	footer.className = 'mcc-footer';
	const ver = document.createElement('span');
	ver.className = 'mcc-ver';
	ver.textContent = `v${MCC_VERSION}`;
	const status = document.createElement('span');
	status.className = 'mcc-ver-status';
	status.textContent = t('проверить обновление', 'Check for updates');
	status.addEventListener('click', (e) => {
		e.stopPropagation();
		void checkForUpdate(status);
	});
	footer.appendChild(ver);
	footer.appendChild(status);

	const note = document.createElement('div');
	note.className = 'mcc-note';
	note.textContent = t('Alt+C — переключить · Esc — закрыть', 'Alt+C — toggle · Esc — close');
	panel.appendChild(title);
	panel.appendChild(underline);
	panel.appendChild(header);
	panel.appendChild(input);
	panel.appendChild(list);
	panel.appendChild(footer);
	panel.appendChild(note);
	document.body.appendChild(panel);
	currencyPanel = panel;

	onBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		void applyQuickSetting('enabled', !cachedSettings.enabled);
	});
	modeBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		void applyQuickSetting('displayMode', cachedSettings.displayMode === 'replace' ? 'next' : 'replace');
	});
	panel.addEventListener('click', (e) => e.stopPropagation());
	panel.addEventListener('keydown', (e) => {
		e.stopPropagation();
		if (e.key === 'Escape') {
			closeCurrencyPanel();
		}
	});
	input.addEventListener('input', () => renderCurrencyList(input.value));
	input.addEventListener('keydown', (e) => {
		e.stopPropagation();
		if (e.key === 'Enter') {
			const first = list.querySelector('li');
			if (first) {
				first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			}
		}
	});

	renderQuickHeader();
	renderCurrencyList('');
	const saved = loadPos('mcc_panel_pos');
	if (saved) {
		const pos = clampToViewport(saved.x, saved.y, panel.offsetWidth || 290, panel.offsetHeight || 400);
		panel.style.left = `${pos.x}px`;
		panel.style.top = `${pos.y}px`;
		panel.style.right = 'auto';
	}
	makeDraggable(panel, title, 'mcc_panel_pos');
	input.focus();
}

function hookQuickSwitch(): void {
	document.addEventListener('keydown', (e) => {
		if (e.altKey && !e.ctrlKey && !e.shiftKey && (e.code === 'KeyC' || e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'с')) {
			e.preventDefault();
			openCurrencyPanel();
		} else if (e.key === 'Escape' && currencyPanel) {
			closeCurrencyPanel();
		}
	});
	document.addEventListener('click', (e) => {
		const target = e.target as Node;
		if (currencyPanel && !currencyPanel.contains(target) && !(fabEl && fabEl.contains(target))) {
			closeCurrencyPanel();
		}
	});
}

export default async function main(): Promise<void> {
	console.log('[mcc] attached to', window.location.href);

	await loadSettings();
	console.log('[mcc] settings:', JSON.stringify(cachedSettings));

	// poll settings periodically; compare signature captured BEFORE the load,
	// otherwise the change check compares the object against itself and never fires
	setInterval(() => {
		const before = settingsSignature(cachedSettings);
		void loadSettings().then(() => {
			if (settingsSignature(cachedSettings) !== before) {
				console.log('[mcc] settings changed, rescanning');
				scheduleScan();
			}
		});
	}, 3000);

	// periodic refresh is exposed for future use
	injectStyle();
	hookHistory();
	hookQuickSwitch();

	const observer = new MutationObserver((mutations) => {
		const relevant = mutations.some((m) => {
			const t = m.target;
			if (t instanceof Element) {
				return !t.closest(`.${CONVERTED_CLASS}`);
			}
			if (t instanceof Text) {
				const p = t.parentElement;
				return !(p && p.closest(`.${CONVERTED_CLASS}`));
			}
			return true;
		});
		if (relevant) {
			scheduleScan();
		}
	});

	const start = () => {
		observer.observe(document.body, { childList: true, subtree: true, characterData: true });
		createFloatingButton();
		scheduleScan();
	};

	if (document.body) {
		start();
	} else {
		document.addEventListener('DOMContentLoaded', start, { once: true });
	}
}
