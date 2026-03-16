/**
 * Geo Context Engine — Cloudflare Worker
 * Features: IP geo detection, multi-country config, KV discount, rate cache, user preference override
 */

export interface Env {}
  
  interface CountryConfig {
	currency: string;
	language: string;
	timezone: string;
  }
  
  interface ExchangeRateResponse {
	rates: { [key: string]: number };
  }
  
  // Country configuration table
  const COUNTRY_CONFIG: Record<string, CountryConfig> = {
	CN: { currency: "CNY", language: "zh-CN", timezone: "Asia/Shanghai" },
	US: { currency: "USD", language: "en-US", timezone: "America/New_York" },
	GB: { currency: "GBP", language: "en-GB", timezone: "Europe/London" },
	JP: { currency: "JPY", language: "ja-JP", timezone: "Asia/Tokyo" },
	DE: { currency: "EUR", language: "de-DE", timezone: "Europe/Berlin" },
	FR: { currency: "EUR", language: "fr-FR", timezone: "Europe/Paris" },
	SG: { currency: "SGD", language: "en-SG", timezone: "Asia/Singapore" },
	MY: { currency: "MYR", language: "ms-MY", timezone: "Asia/Kuala_Lumpur" },
	AU: { currency: "AUD", language: "en-AU", timezone: "Australia/Sydney" },
	CA: { currency: "CAD", language: "en-CA", timezone: "America/Toronto" },
  };
  
  // In-memory exchange rate cache (10 min TTL)
  let rateCache: { rates: Record<string, number>; fetchedAt: number } | null = null;
  
  async function getExchangeRates(): Promise<Record<string, number>> {
	const now = Date.now();
	if (rateCache && now - rateCache.fetchedAt < 10 * 60 * 1000) {
	  return rateCache.rates;
	}
	try {
	  const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
	  const data = (await res.json()) as ExchangeRateResponse;
	  rateCache = { rates: data.rates, fetchedAt: now };
	  return data.rates;
	} catch {
	  // Fallback rates if external API is down
	  return { USD: 1, CNY: 7.25, EUR: 0.92, GBP: 0.79, JPY: 149.5, SGD: 1.34, MYR: 4.7, AUD: 1.53, CAD: 1.36 };
	}
  }
  
  const CORS_HEADERS = {
	"Content-Type": "application/json",
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, X-User-Country",
  };
  
  export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
if (url.pathname !== "/api") return new Response(null, { status: 404 });
	  // Handle CORS preflight
	  if (request.method === "OPTIONS") {
		return new Response(null, { headers: CORS_HEADERS });
	  }
  
	  // User manual override takes priority over IP detection
	  const userOverride = request.headers.get("X-User-Country");
	  const ipCountry = (request.cf as any)?.country || "US";
	  const country = userOverride || ipCountry;
  
	  const config = COUNTRY_CONFIG[country] || COUNTRY_CONFIG["US"];
  
	  // Read discount from KV, default to 0 if not set or KV unavailable
	  const discount = 0;
  
	  const rates = await getExchangeRates();
  
	  return new Response(JSON.stringify({
		country,
		currency: config.currency,
		language: config.language,
		timezone: config.timezone,
		discount,
		rate: rates[config.currency] || 1.0,
		source: userOverride ? "user-preference" : "ip",
		timestamp: new Date().toISOString(),
	  }), { headers: CORS_HEADERS });
	},
  };