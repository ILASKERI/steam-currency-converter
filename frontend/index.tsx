import {
	definePlugin,
	Field,
	Dropdown,
	ToggleField,
	usePluginConfig,
	ChromeDevToolsProtocol,
	callable,
} from '@steambrew/client';
import { SYMBOL_KEYS, SYMBOL_TO_CODE, CURRENCY_BY_CODE, ZERO_DECIMAL, CURRENCIES } from '../shared/currencies';

const getSettingsRpc = callable<[], string>('get_settings');
const getRateRpc = callable<[{ from_currency: string; to_currency: string }], number>('get_rate');

interface Settings {
	enabled: boolean;
	targetCurrency: string;
	displayMode: 'next' | 'replace';
}

let cdpSessionId: string | null = null;
let lastApplied = '';
let lastSettingsSig = '';
let originalRaw = '';
const rateCache: Map<string, number> = new Map();

async function evalInMain(expression: string): Promise<any> {
	try {
		if (!cdpSessionId) {
			const res: any = await ChromeDevToolsProtocol.send('Target.getTargets');
			const main = (res?.targetInfos ?? []).find((t: any) => t.type === 'page' && t.title === 'Steam');
			if (!main) {
				return null;
			}
			const attach: any = await ChromeDevToolsProtocol.send('Target.attachToTarget', { targetId: main.targetId, flatten: true });
			cdpSessionId = attach.sessionId;
		}
		const r: any = await ChromeDevToolsProtocol.send(
			'Runtime.evaluate',
			{ expression, returnByValue: true, awaitPromise: true },
			cdpSessionId,
		);
		if (r?.exceptionDetails) {
			cdpSessionId = null;
			return null;
		}
		return r?.result?.value ?? null;
	} catch {
		cdpSessionId = null;
		return null;
	}
}

function parseNum(raw: string): number | null {
	let s = raw.replace(/[\s\u00A0\u202F'’]/g, '');
	if (!s) {
		return null;
	}
	const lastComma = s.lastIndexOf(',');
	const lastDot = s.lastIndexOf('.');
	if (lastComma >= 0 && lastDot >= 0) {
		s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
	} else if (lastComma >= 0) {
		const after = s.length - lastComma - 1;
		s = after > 0 && after <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
	}
	const n = parseFloat(s);
	return isFinite(n) && n > 0 ? n : null;
}

function parseBalance(raw: string): { amount: number; currency: string } | null {
	const text = raw.replace(/[\u00A0\u202F\u2009]/g, ' ').trim();
	if (!text || text.length > 30) {
		return null;
	}
	for (const sym of SYMBOL_KEYS) {
		if (text.includes(sym)) {
			const numMatch = text.split(sym).join(' ').match(/\d[\d\s.,]*/);
			if (!numMatch) {
				return null;
			}
			const amount = parseNum(numMatch[0]);
			if (amount === null) {
				return null;
			}
			return { amount, currency: SYMBOL_TO_CODE[sym] };
		}
	}
	return null;
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
	return info?.prefix ? `${symbol}${numStr}` : `${numStr} ${symbol}`;
}

async function getRate(from: string, to: string): Promise<number> {
	if (from === to) {
		return 1;
	}
	const key = `${from}->${to}`;
	if (rateCache.has(key)) {
		return rateCache.get(key)!;
	}
	try {
		const raw = await getRateRpc({ from_currency: from, to_currency: to });
		const rate = typeof raw === 'string' ? parseFloat(raw) : (raw as number);
		if (typeof rate === 'number' && isFinite(rate) && rate > 0) {
			rateCache.set(key, rate);
			return rate;
		}
	} catch (e) {
		console.log('[mcc-fe] get_rate failed:', String(e).slice(0, 150));
	}
	return 0;
}

async function applyBalance(original: string, settings: Settings): Promise<void> {
	const parsed = parseBalance(original);
	if (!parsed) {
		return;
	}
	if (parsed.currency === settings.targetCurrency) {
		if (lastApplied && lastApplied !== original) {
			await evalInMain(
				`(function(){var e=document.querySelector('.WalletBalance');if(e){e.textContent=${JSON.stringify(original)}}})()`,
			);
		}
		lastApplied = original;
		return;
	}
	const rate = await getRate(parsed.currency, settings.targetCurrency);
	if (!rate) {
		return;
	}
	const converted = formatConverted(parsed.amount * rate, settings.targetCurrency);
	const applied = settings.displayMode === 'replace' ? converted : `${original} ≈ ${converted}`;
	await evalInMain(
		`(function(){var e=document.querySelector('.WalletBalance');if(e){e.textContent=${JSON.stringify(applied)}}})()`,
	);
	lastApplied = applied;
}

async function balanceTick(): Promise<void> {
	const cur = await evalInMain(`(document.querySelector('.WalletBalance')||{textContent:''}).textContent || ''`);
	if (cur === null || cur === '') {
		return;
	}
	const text = cur.trim();

	let settings: Settings = { enabled: true, targetCurrency: 'RUB', displayMode: 'next' };
	try {
		settings = { ...settings, ...(JSON.parse(await getSettingsRpc()) as Partial<Settings>) };
	} catch {
		/* keep defaults */
	}
	const sig = `${settings.enabled}|${settings.targetCurrency}|${settings.displayMode}`;

	if (text === lastApplied) {
		// our text is still in place; only act when settings changed
		if (sig === lastSettingsSig || !originalRaw) {
			return;
		}
		lastSettingsSig = sig;
		if (!settings.enabled) {
			await evalInMain(
				`(function(){var e=document.querySelector('.WalletBalance');if(e){e.textContent=${JSON.stringify(originalRaw)}}})()`,
			);
			lastApplied = '';
		} else {
			await applyBalance(originalRaw, settings);
		}
		return;
	}

	if (!settings.enabled) {
		lastApplied = '';
		return;
	}

	// fresh (or React-reverted) native text
	const parsed = parseBalance(text);
	if (!parsed) {
		return;
	}
	originalRaw = text;
	lastSettingsSig = sig;
	await applyBalance(originalRaw, settings);
}

function startBalanceScanner(): void {
	console.log('[mcc-fe] frontend loaded');
	const tick = (): void => void balanceTick();
	setInterval(tick, 4000);
	setTimeout(tick, 1500);
}

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({
	data: c.code,
	label: `${c.code} (${c.symbol}) — ${c.nameEn} / ${c.name}`,
}));

const DISPLAY_MODE_OPTIONS = [
	{ data: 'next', label: 'Рядом с оригиналом / Next to original (1 499 ₸ ≈ 275 ₽)' },
	{ data: 'replace', label: 'Заменить цену / Replace price (275 ₽)' },
];

const SettingsContent = () => {
	const [enabled, setEnabled] = usePluginConfig<boolean>('enabled');
	const [targetCurrency, setTargetCurrency] = usePluginConfig<string>('targetCurrency');
	const [displayMode, setDisplayMode] = usePluginConfig<string>('displayMode');

	const currentCurrency = targetCurrency ?? 'RUB';
	const currentMode = displayMode ?? 'next';

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }}>
			<ToggleField
				label="Конвертировать цены / Convert prices"
				description="Показывать цены магазина Steam в выбранной валюте — Show Steam store prices in the selected currency"
				checked={enabled ?? true}
				onChange={(value: boolean) => setEnabled(value)}
			/>
			<Field
				label="Целевая валюта / Target currency"
				description="Валюта, в которую конвертируются цены — The currency prices are converted into"
				bottomSeparator="standard"
			>
				<Dropdown
					rgOptions={CURRENCY_OPTIONS}
					selectedOption={CURRENCY_OPTIONS.findIndex((opt) => opt.data === currentCurrency)}
					onChange={(e: { data: string }) => setTargetCurrency(e.data)}
					strDefaultLabel={CURRENCY_OPTIONS.find((opt) => opt.data === currentCurrency)?.label}
				/>
			</Field>
			<Field
				label="Режим отображения / Display mode"
				description="Как показывать конвертированную цену — How the converted price is shown"
				bottomSeparator="standard"
			>
				<Dropdown
					rgOptions={DISPLAY_MODE_OPTIONS}
					selectedOption={DISPLAY_MODE_OPTIONS.findIndex((opt) => opt.data === currentMode)}
					onChange={(e: { data: string }) => setDisplayMode(e.data)}
					strDefaultLabel={DISPLAY_MODE_OPTIONS.find((opt) => opt.data === currentMode)?.label}
				/>
			</Field>
		</div>
	);
};

const Icon = () => (
	<div
		style={{
			width: '16px',
			height: '16px',
			marginRight: '5px',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			fontSize: '12px',
			fontWeight: 'bold',
		}}
	>
		₺
	</div>
);

export default definePlugin(() => {
	startBalanceScanner();
	return {
		title: 'Currency Converter',
		icon: <Icon />,
		content: <SettingsContent />,
	};
});
