import { callable } from '@steambrew/webkit';
import { SYMBOL_KEYS, SYMBOL_TO_CODE, CURRENCY_BY_CODE, ZERO_DECIMAL } from '../shared/currencies';

const getRateRpc = callable<[{ from_currency: string; to_currency: string }], number>('get_rate');
const getSettingsRpc = callable<[], string>('get_settings');
const refreshRatesRpc = callable<[], boolean>('refresh_rates');

interface Settings {
	enabled: boolean;
	targetCurrency: string;
	displayMode: 'next' | 'replace';
}

interface NodeState {
	original: string;
	converted: string;
	signature: string;
	span?: HTMLElement;
}

const DEFAULT_SETTINGS: Settings = { enabled: true, targetCurrency: 'RUB', displayMode: 'next' };

const CONVERTED_CLASS = 'mcc-converted';
const MAX_TEXT_LENGTH = 80;
const RATE_FAIL_TTL = 60_000;

let cachedSettings: Settings = { ...DEFAULT_SETTINGS };
const rateCache = new Map<string, number>();
const rateFailAt = new Map<string, number>();
const nodeState = new WeakMap<Text, NodeState>();

function settingsSignature(s: Settings): string {
	return `${s.enabled}|${s.targetCurrency}|${s.displayMode}`;
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

function formatConverted(amount: number, currencyCode: string): string {
	const info = CURRENCY_BY_CODE[currencyCode];
	const symbol = info?.symbol ?? currencyCode;
	const zeroDec = ZERO_DECIMAL.has(currencyCode);

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

	const converted = formatConverted(parsed.amount * rate, fresh.targetCurrency);

	if (fresh.displayMode === 'replace') {
		nodeState.set(node, { original, converted, signature: settingsSignature(fresh) });
		node.textContent = converted;
	} else {
		const span = document.createElement('span');
		span.className = CONVERTED_CLASS;
		span.textContent = ` ≈ ${converted}`;
		span.style.cssText = 'opacity:.65;font-size:.85em;margin-left:2px;white-space:nowrap;';
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

function injectStyle(): void {
	const style = document.createElement('style');
	style.textContent = `.${CONVERTED_CLASS}{opacity:.65;font-size:.85em;margin-left:2px;white-space:nowrap;}`;
	if (document.head) {
		document.head.appendChild(style);
	} else {
		document.addEventListener('DOMContentLoaded', () => document.head?.appendChild(style), { once: true });
	}
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
	void refreshRatesRpc;

	injectStyle();
	hookHistory();

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
		scheduleScan();
	};

	if (document.body) {
		start();
	} else {
		document.addEventListener('DOMContentLoaded', start, { once: true });
	}
}
