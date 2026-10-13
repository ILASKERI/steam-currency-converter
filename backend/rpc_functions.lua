local logger     = require("logger")
local millennium = require("millennium")
local http       = require("http")
local json       = require("json")
local fs         = require("fs")
local utils      = require("utils")

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
		steamPricing = millennium.config.get("steamPricing"),
	})
	if not ok then
		logger:error("get_settings encode failed: " .. tostring(out))
		return '{"enabled":true,"targetCurrency":"RUB","displayMode":"next","steamPricing":false}'
	end
	return out
end

---@ffi
--- Quick currency switch from webkit (Alt+C popup).
---@param target_currency string ISO 4217 code
---@return boolean success
function set_currency(target_currency)
	if type(target_currency) ~= "string" or #target_currency ~= 3 then
		return false
	end
	millennium.config.set("targetCurrency", target_currency:upper())
	return true
end

---@ffi
--- Generic settings setter for the webkit quick panel.
---@param key string setting key (enabled / displayMode / targetCurrency)
---@param value any new value
---@return boolean success
function set_setting(key, value)
	local allowed = { enabled = "boolean", targetCurrency = "string", displayMode = "string" }
	local expected = allowed[key]
	if not expected or type(value) ~= expected then
		return false
	end
	if key == "displayMode" and value ~= "next" and value ~= "replace" then
		return false
	end
	if key == "targetCurrency" and (#value ~= 3) then
		return false
	end
	millennium.config.set(key, value)
	return true
end

---@ffi
--- Check GitHub for the latest release tag (CSP blocks webkit fetches).
---@return string latest version tag, empty string on failure
function check_updates()
	local res = http.get("https://api.github.com/repos/ILASKERI/steam-currency-converter/releases/latest", {
		headers = { ["Accept"] = "application/vnd.github+json" },
		timeout = 10,
		user_agent = "steam-currency-converter-plugin",
	})
	if not res or res.status ~= 200 then
		return ""
	end
	local ok, data = pcall(json.decode, res.body)
	if not ok or type(data) ~= "table" or type(data.tag_name) ~= "string" then
		return ""
	end
	return data.tag_name
end

local UPDATE_FILES = {
	"plugin.json",
	"backend/main.lua",
	"backend/rpc_functions.lua",
	".millennium/Dist/index.js",
	".millennium/Dist/webkit.js",
}

local function find_plugin_base()
	local candidates = { ".", fs.current_path() }
	for _, cand in ipairs(candidates) do
		if cand and fs.exists(fs.join(cand, "plugin.json")) then
			return fs.absolute(cand)
		end
	end
	return nil
end

---@ffi
--- One-click self-update: download release files from GitHub and swap them in.
---@return string "ok <tag>" on success, "err <reason>" on failure
function self_update()
	local tag = check_updates()
	if not tag or tag == "" then
		return "err: could not fetch latest release"
	end
	tag = tag:gsub("^v", "")

	local base = find_plugin_base()
	if not base then
		return "err: plugin directory not found"
	end
	logger:info("self_update: base=" .. tostring(base) .. " tag=" .. tag)

	local list = table.concat(
		(function()
			local t = {}
			for _, f in ipairs(UPDATE_FILES) do
				t[#t + 1] = "'" .. f .. "'"
			end
			return t
		end)(),
		","
	)

	local ps = [[powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $files=@(]]
		.. list
		.. [[); foreach($x in $files){ $u='https://raw.githubusercontent.com/ILASKERI/steam-currency-converter/v]]
		.. tag
		.. [[' + '/' + $x; $o=Join-Path ']]
		.. base
		.. [[' ($x + '.mccnew'); New-Item -ItemType Directory -Force -Path (Split-Path $o) | Out-Null; Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing; if((Get-Item $o).Length -eq 0){ throw ('empty download: ' + $x) } }"]]

	local output, status = utils.exec(ps)
	logger:info("self_update: download status=" .. tostring(status) .. " out=" .. tostring(output):sub(1, 200))
	if status ~= 0 then
		return "err: download failed (" .. tostring(status) .. ")"
	end

	-- verify all staged files exist, then swap atomically
	for _, f in ipairs(UPDATE_FILES) do
		local staged = fs.join(base, f .. ".mccnew")
		if not fs.exists(staged) then
			return "err: staged file missing " .. f
		end
	end
	for _, f in ipairs(UPDATE_FILES) do
		local staged = fs.join(base, f .. ".mccnew")
		local target = fs.join(base, f)
		fs.remove(target)
		local ok, err = fs.rename(staged, target)
		if not ok then
			logger:error("self_update: rename failed for " .. f .. ": " .. tostring(err))
			return "err: swap failed " .. f
		end
	end

	logger:info("self_update: updated to v" .. tag)
	return "ok v" .. tag
end
logger:info("RPC functions registered")
