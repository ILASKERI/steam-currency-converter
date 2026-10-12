local logger     = require("logger")
local millennium = require("millennium")

require("rpc_functions")

local function ensure_defaults()
	if millennium.config.get("enabled") == nil then
		millennium.config.set("enabled", true)
	end
	if millennium.config.get("targetCurrency") == nil then
		millennium.config.set("targetCurrency", "RUB")
	end
	if millennium.config.get("displayMode") == nil then
		millennium.config.set("displayMode", "next")
	end
end

local function on_load()
	logger:info("steam-currency-converter loaded, Millennium " .. millennium.version())
	ensure_defaults()
	millennium.ready()
end

local function on_unload()
	logger:info("steam-currency-converter unloaded")
end

return {
	on_load = on_load,
	on_unload = on_unload,
}
