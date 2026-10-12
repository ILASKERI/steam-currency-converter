local logger     = require("logger")
local millennium = require("millennium")
local http       = require("http")
local json       = require("json")

local RATES_URL = "https://open.er-api.com/v6/latest/USD"
local CACHE_TTL = 24 * 3600

local rates = nil
local fetched_at = 0
local last_attempt = 0
local FETCH_COOLDOWN = 60

local function count_rates(tbl)
	local n = 0
	for _ in pairs(tbl) do
		n = n + 1
	end
	return n
end

local function fetch_rates(force)
	local now = os.time()
	-- don't hammer the API when offline: retry at most once per cooldown
	if not force and (now - last_attempt) < FETCH_COOLDOWN then
		return rates ~= nil
	end
	last_attempt = now

	local res, err = http.get(RATES_URL, {
		headers = { ["Accept"] = "application/json" },
		timeout = 15,
		user_agent = "Mozilla/5.0 (Millennium steam-currency-converter)",
	})

	if not res then
		logger:error("rates request failed: " .. tostring(err))
		-- stale rates are better than nothing
		return rates ~= nil
	end

	if res.status ~= 200 then
		logger:error("rates request returned status " .. tostring(res.status))
		return rates ~= nil
	end

	local ok, data = pcall(json.decode, res.body)
	if not ok or type(data) ~= "table" or type(data.rates) ~= "table" then
		logger:error("failed to parse rates JSON")
		return rates ~= nil
	end

	rates = data.rates
	fetched_at = os.time()
	logger:info("rates updated, " .. count_rates(rates) .. " currencies")
	return true
end

local function ensure_rates()
	if rates and (os.time() - fetched_at) < CACHE_TTL then
		return true
	end
	return fetch_rates()
end

---@ffi
--- Get exchange rate: how many units of to_currency per 1 unit of from_currency.
---@param from_currency string ISO 4217 code
---@param to_currency string ISO 4217 code
---@return number rate (0 = error)
function get_rate(from_currency, to_currency)
	logger:info(string.format("get_rate called: arg1=%s(%s) arg2=%s(%s)",
		tostring(from_currency), type(from_currency), tostring(to_currency), type(to_currency)))
	if type(from_currency) ~= "string" or type(to_currency) ~= "string" then
		return 0
	end

	from_currency = from_currency:upper()
	to_currency = to_currency:upper()

	if from_currency == to_currency then
		return 1
	end

	if not ensure_rates() then
		return 0
	end

	local from = rates[from_currency]
	local to = rates[to_currency]

	if type(from) ~= "number" or type(to) ~= "number" or from == 0 then
		logger:error("missing rate for " .. from_currency .. " or " .. to_currency)
		return 0
	end

	return to / from
end

---@ffi
--- Force-refresh the rates cache.
---@return boolean success
function refresh_rates()
	return fetch_rates(true)
end

---@ffi
--- Current plugin settings as a JSON string (for webkit).
---@return string
function get_settings()
	local ok, out = pcall(json.encode, {
		enabled = millennium.config.get("enabled"),
		targetCurrency = millennium.config.get("targetCurrency"),
		displayMode = millennium.config.get("displayMode"),
	})
	if not ok then
		logger:error("get_settings encode failed: " .. tostring(out))
		return '{"enabled":true,"targetCurrency":"RUB","displayMode":"next"}'
	end
	return out
end

logger:info("RPC functions registered")
