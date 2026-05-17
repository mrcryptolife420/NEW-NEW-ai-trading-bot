import crypto from "node:crypto";

function createQueryString(params = {}) {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => {
      const normalized = Array.isArray(value) ? JSON.stringify(value) : `${value}`;
      return [key, normalized];
    });
  const search = new URLSearchParams(pairs);
  return search.toString();
}

function createSortedQueryString(params = {}) {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => `${left}`.localeCompare(`${right}`))
    .map(([key, value]) => {
      const normalized = Array.isArray(value) ? JSON.stringify(value) : `${value}`;
      return `${key}=${normalized}`;
    });
  return pairs.join("&");
}

function isRetriableStatus(status) {
  return status >= 500 || status === 429;
}

function isRetriableNetworkError(error) {
  return ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "EACCES"].includes(error?.cause?.code) || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(error?.code);
}

function isSafeRetryMethod(method) {
  return ["GET", "HEAD"].includes(`${method || ""}`.toUpperCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePayload(text) {
  if (!text || !`${text}`.trim()) {
    return null;
  }
  return JSON.parse(text);
}

function buildResponseError(response, payload, rawBody, fallbackMessage) {
  const error = new Error(payload?.msg || fallbackMessage || `Binance request failed with ${response.status}`);
  error.status = response.status;
  error.payload = payload;
  error.rawBody = rawBody;
  return error;
}

function average(values = []) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values = []) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildUserDataHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-MBX-APIKEY": apiKey } : {})
  };
}

function readHeader(headers, name) {
  if (!headers || !name) {
    return null;
  }
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  const headerName = `${name}`.toLowerCase();
  const entries = typeof headers.entries === "function"
    ? [...headers.entries()]
    : Object.entries(headers || {});
  const match = entries.find(([key]) => `${key}`.toLowerCase() === headerName);
  return match ? match[1] : null;
}

function parseHeaderNumber(headers, name) {
  const value = Number(readHeader(headers, name));
  return Number.isFinite(value) ? value : null;
}

function parseRetryAfterMs(headers, payload = null) {
  const headerValue = Number(readHeader(headers, "retry-after"));
  if (Number.isFinite(headerValue) && headerValue >= 0) {
    return headerValue * 1000;
  }
  const payloadValue = Number(payload?.retryAfter ?? payload?.data?.retryAfter ?? Number.NaN);
  if (Number.isFinite(payloadValue) && payloadValue >= 0) {
    return payloadValue > 1000 ? payloadValue : payloadValue * 1000;
  }
  return null;
}

function parseBanExpiryMs(payload = null, rawBody = "") {
  const fromPayload = Number(
    payload?.retryAfter ??
    payload?.data?.retryAfter ??
    payload?.until ??
    payload?.data?.until ??
    Number.NaN
  );
  if (Number.isFinite(fromPayload) && fromPayload > 0) {
    return fromPayload > 1000 ? fromPayload : fromPayload * 1000;
  }
  const text = `${payload?.msg || rawBody || ""}`;
  const match = text.match(/until\s+(\d{10,13})/i);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed > 1000 ? parsed : parsed * 1000;
}

function toRequestCallerKey({ scope = "spot", method = "GET", pathname = "", requestMeta = {} } = {}) {
  const explicitCaller = `${requestMeta?.caller || ""}`.trim();
  if (explicitCaller) {
    return explicitCaller;
  }
  return `${scope}:${`${method || "GET"}`.toUpperCase()} ${pathname || "/"}`;
}

function estimateRequestWeight({ pathname = "", params = {} } = {}) {
  const normalized = `${pathname || ""}`.toLowerCase();
  if (normalized.includes("/api/v3/depth")) {
    const limit = Number(params?.limit || 100);
    if (limit > 1000) return 250;
    if (limit > 500) return 50;
    if (limit > 100) return 25;
    return 5;
  }
  if (normalized.includes("/api/v3/ticker/24hr") && !params?.symbol) {
    return 80;
  }
  if (normalized.includes("/api/v3/openorders") && !params?.symbol) {
    return 80;
  }
  if (normalized.includes("/api/v3/exchangeinfo")) {
    return 20;
  }
  if (normalized.includes("/api/v3/mytrades")) {
    return 20;
  }
  return 1;
}

function cloneTopCallerMap(map = {}) {
  return Object.fromEntries(
    Object.entries(map || {})
      .sort((left, right) => (Number(right[1]?.weight || 0) - Number(left[1]?.weight || 0)) || (Number(right[1]?.count || 0) - Number(left[1]?.count || 0)))
      .slice(0, 16)
      .map(([key, value]) => [key, {
        count: Number(value?.count || 0),
        weight: Number(value?.weight || 0),
        lastAt: value?.lastAt || null,
        scope: value?.scope || null,
        endpoint: value?.endpoint || null,
        cacheKey: value?.cacheKey || null,
        ttlMs: value?.ttlMs ?? null,
        cacheHits: Number(value?.cacheHits || 0),
        cacheMisses: Number(value?.cacheMisses || 0),
        coalescedCount: Number(value?.coalescedCount || 0),
        fallbackCount: Number(value?.fallbackCount || 0),
        fallbackReason: value?.fallbackReason || null
      }])
  );
}

function normalizeBaseUrl(baseUrl, apiPrefix = "") {
  const trimmed = `${baseUrl || ""}`.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  if (!apiPrefix) {
    return trimmed;
  }
  const normalizedPrefix = `${apiPrefix}`.replace(/^\/+/, "");
  return trimmed.replace(new RegExp(`/${normalizedPrefix}$`, "i"), "");
}

export class BinanceClient {
  constructor({
    apiKey,
    apiSecret,
    baseUrl,
    futuresBaseUrl = "https://fapi.binance.com",
    recvWindow = 5000,
    logger,
    fetchImpl,
    nowFn,
    clockSyncSampleCount = 5,
    clockSyncMaxAgeMs = 5 * 60_000,
    clockSyncMaxRttMs = 1500,
    exchangeInfoCacheMs = 6 * 60 * 60_000,
    futuresPublicCacheMs = 30_000,
    requestWeightBackoffMaxMs = 60_000,
    requestWeightWarnThreshold1m = 4800,
    onRequestWeightUpdate = null
  }) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = normalizeBaseUrl(baseUrl, "api");
    this.futuresBaseUrl = normalizeBaseUrl(futuresBaseUrl, "fapi");
    this.recvWindow = recvWindow;
    this.logger = logger;
    this.fetchImpl = fetchImpl || fetch;
    this.nowFn = nowFn || (() => Date.now());
    this.clockOffsetMs = 0;
    this.clockSyncSampleCount = Math.max(1, Number(clockSyncSampleCount || 1));
    this.clockSyncMaxAgeMs = Math.max(1_000, Number(clockSyncMaxAgeMs || 5 * 60_000));
    this.clockSyncMaxRttMs = Math.max(100, Number(clockSyncMaxRttMs || 1500));
    this.exchangeInfoCacheMs = Math.max(60_000, Number(exchangeInfoCacheMs || 6 * 60 * 60_000));
    this.futuresPublicCacheMs = Math.max(1_000, Number(futuresPublicCacheMs || 30_000));
    this.requestWeightBackoffMaxMs = Math.max(1_000, Number(requestWeightBackoffMaxMs || 60_000));
    this.requestWeightWarnThreshold1m = Math.max(100, Number(requestWeightWarnThreshold1m || 4800));
    this.onRequestWeightUpdate = typeof onRequestWeightUpdate === "function" ? onRequestWeightUpdate : null;
    this.clockState = {
      offsetMs: 0,
      estimatedDriftMs: Number.POSITIVE_INFINITY,
      bestRttMs: null,
      medianRttMs: null,
      averageRttMs: null,
      offsetSpreadMs: null,
      sampleCount: 0,
      totalSampleCount: 0,
      lastSyncAt: null,
      stale: true,
      syncAgeMs: null
    };
    this.exchangeInfoCache = new Map();
    this.exchangeInfoInflight = new Map();
    this.futuresPublicCache = new Map();
    this.requestWeightState = {
      lastUpdatedAt: null,
      usedWeight: null,
      usedWeight1m: null,
      orderCount10s: null,
      retryAfterMs: null,
      backoffUntil: null,
      banUntil: null,
      lastRateLimitStatus: null,
      lastRateLimitAt: null,
      lastBanMessage: null,
      consecutiveRateLimitHits: 0,
      totalRateLimitHits: 0,
      totalRequests: 0,
      warningActive: false,
      lastRequest: null,
      topRestCallers: {}
    };
    this.maxRetries = 3;
  }

  emitRequestWeightUpdate(event = {}) {
    if (!this.onRequestWeightUpdate) {
      return;
    }
    try {
      this.onRequestWeightUpdate({
        at: new Date(this.nowFn()).toISOString(),
        event,
        state: this.getRateLimitState()
      });
    } catch (error) {
      this.logger?.debug?.("Request weight callback failed", { error: error?.message || `${error}` });
    }
  }

  getStreamBaseUrl() {
    if (this.baseUrl.includes("demo-api.binance.com")) {
      return "wss://demo-stream.binance.com";
    }
    if (this.baseUrl.includes("testnet.binance.vision")) {
      return "wss://stream.testnet.binance.vision";
    }
    return "wss://stream.binance.com:9443";
  }

  getWsApiBaseUrl() {
    if (this.baseUrl.includes("demo-api.binance.com")) {
      return "wss://demo-ws-api.binance.com/ws-api/v3";
    }
    if (this.baseUrl.includes("testnet.binance.vision")) {
      return "wss://ws-api.testnet.binance.vision/ws-api/v3";
    }
    return "wss://ws-api.binance.com/ws-api/v3";
  }

  getFuturesStreamBaseUrl() {
    if (this.futuresBaseUrl.includes("demo-fapi.binance.com") || this.futuresBaseUrl.includes("testnet")) {
      return "wss://fstream.binancefuture.com";
    }
    return "wss://fstream.binance.com";
  }

  sign(queryString) {
    return crypto.createHmac("sha256", this.apiSecret).update(queryString).digest("hex");
  }

  signWebSocketParams(params = {}) {
    return this.sign(createSortedQueryString(params));
  }

  getClockOffsetMs() {
    return this.clockOffsetMs;
  }

  getClockSyncState() {
    const lastSyncAtMs = this.clockState.lastSyncAt ? new Date(this.clockState.lastSyncAt).getTime() : NaN;
    const syncAgeMs = Number.isFinite(lastSyncAtMs) ? Math.max(0, this.nowFn() - lastSyncAtMs) : null;
    const stale = !this.clockState.lastSyncAt || (syncAgeMs != null && syncAgeMs > this.clockSyncMaxAgeMs);
    return {
      ...this.clockState,
      stale,
      syncAgeMs
    };
  }

  getRateLimitState() {
    const now = this.nowFn();
    const backoffUntil = Number(this.requestWeightState.backoffUntil || 0);
    const banUntil = Number(this.requestWeightState.banUntil || 0);
    return {
      ...this.requestWeightState,
      backoffActive: backoffUntil > now,
      backoffRemainingMs: backoffUntil > now ? backoffUntil - now : 0,
      banActive: banUntil > now,
      banRemainingMs: banUntil > now ? banUntil - now : 0,
      topRestCallers: cloneTopCallerMap(this.requestWeightState.topRestCallers)
    };
  }

  isRateLimitBanActive() {
    return Number(this.requestWeightState.banUntil || 0) > this.nowFn();
  }

  noteRequestDiagnostics({ scope = "spot", method = "GET", pathname = "", requestMeta = {}, params = {} } = {}) {
    const key = toRequestCallerKey({ scope, method, pathname, requestMeta });
    const state = this.requestWeightState;
    const next = state.topRestCallers[key] || {
      count: 0,
      weight: 0,
      lastAt: null,
      scope,
      endpoint: `${`${method || "GET"}`.toUpperCase()} ${pathname || "/"}`
    };
    next.count += 1;
    next.weight += estimateRequestWeight({ pathname, params });
    next.lastAt = new Date(this.nowFn()).toISOString();
    next.scope = scope;
    state.topRestCallers[key] = next;
    state.totalRequests += 1;
    state.lastRequest = {
      at: next.lastAt,
      caller: key,
      scope,
      endpoint: next.endpoint
    };
    this.emitRequestWeightUpdate({
      type: "request_observed",
      scope,
      method: `${method || "GET"}`.toUpperCase(),
      pathname,
      caller: key,
      estimatedWeight: estimateRequestWeight({ pathname, params })
    });
  }

  noteCacheDiagnostics({ caller = "", cacheKey = "unknown", type = "cache_hit", ttlMs = null, fallbackReason = null } = {}) {
    if (!caller) return;
    const state = this.requestWeightState;
    const next = state.topRestCallers[caller] || {
      count: 0,
      weight: 0,
      lastAt: null,
      scope: "cache",
      endpoint: cacheKey
    };
    next.lastAt = new Date(this.nowFn()).toISOString();
    next.scope = next.scope || "cache";
    next.endpoint = next.endpoint || cacheKey;
    next.cacheKey = cacheKey;
    if (ttlMs != null) next.ttlMs = Number(ttlMs);
    if (type === "cache_hit") next.cacheHits = Number(next.cacheHits || 0) + 1;
    if (type === "cache_miss") next.cacheMisses = Number(next.cacheMisses || 0) + 1;
    if (type === "coalesced") next.coalescedCount = Number(next.coalescedCount || 0) + 1;
    if (type === "fallback") next.fallbackCount = Number(next.fallbackCount || 0) + 1;
    if (fallbackReason) next.fallbackReason = fallbackReason;
    state.topRestCallers[caller] = next;
    this.emitRequestWeightUpdate({ type: "cache_telemetry", caller, cacheKey, cacheEvent: type, ttlMs, fallbackReason });
  }

  updateRequestWeightFromResponse(response, { status = null, payload = null, rawBody = "", scope = "spot", method = "GET", pathname = "", requestMeta = {} } = {}) {
    const state = this.requestWeightState;
    const nowIso = new Date(this.nowFn()).toISOString();
    state.lastUpdatedAt = nowIso;
    state.usedWeight = parseHeaderNumber(response?.headers, "x-mbx-used-weight") ?? state.usedWeight;
    state.usedWeight1m = parseHeaderNumber(response?.headers, "x-mbx-used-weight-1m") ?? state.usedWeight1m;
    state.orderCount10s = parseHeaderNumber(response?.headers, "x-mbx-order-count-10s") ?? state.orderCount10s;
    state.warningActive = Number(state.usedWeight1m || 0) >= this.requestWeightWarnThreshold1m;
    if (state.warningActive) {
      this.emitRequestWeightUpdate({
        type: "request_weight_warning",
        scope,
        method: `${method || "GET"}`.toUpperCase(),
        pathname,
        caller: toRequestCallerKey({ scope, method, pathname, requestMeta }),
        usedWeight1m: state.usedWeight1m,
        threshold: this.requestWeightWarnThreshold1m
      });
    }
    const retryAfterMs = parseRetryAfterMs(response?.headers, payload);
    if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
      state.retryAfterMs = retryAfterMs;
    }
    if (status === 429) {
      const backoffMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : Math.min(this.requestWeightBackoffMaxMs, 1000 * Math.max(1, 2 ** Math.max(0, state.consecutiveRateLimitHits)));
      state.consecutiveRateLimitHits += 1;
      state.totalRateLimitHits += 1;
      state.lastRateLimitStatus = 429;
      state.lastRateLimitAt = nowIso;
      state.backoffUntil = this.nowFn() + backoffMs;
      this.logger?.warn?.("Binance REST rate limit hit", {
        scope,
        endpoint: `${`${method || "GET"}`.toUpperCase()} ${pathname || "/"}`,
        caller: toRequestCallerKey({ scope, method, pathname, requestMeta }),
        retryAfterMs: backoffMs,
        usedWeight1m: state.usedWeight1m,
        usedWeight: state.usedWeight
      });
      this.emitRequestWeightUpdate({
        type: "rate_limit_429",
        scope,
        method: `${method || "GET"}`.toUpperCase(),
        pathname,
        caller: toRequestCallerKey({ scope, method, pathname, requestMeta }),
        retryAfterMs: backoffMs,
        usedWeight1m: state.usedWeight1m
      });
      return;
    }
    if (status === 418) {
      const banUntil = parseBanExpiryMs(payload, rawBody);
      state.consecutiveRateLimitHits += 1;
      state.totalRateLimitHits += 1;
      state.lastRateLimitStatus = 418;
      state.lastRateLimitAt = nowIso;
      state.banUntil = banUntil || state.banUntil;
      state.lastBanMessage = payload?.msg || rawBody || "binance_ip_ban_active";
      this.logger?.error?.("Binance REST IP ban active", {
        scope,
        endpoint: `${`${method || "GET"}`.toUpperCase()} ${pathname || "/"}`,
        caller: toRequestCallerKey({ scope, method, pathname, requestMeta }),
        banUntil: state.banUntil,
        usedWeight1m: state.usedWeight1m,
        message: state.lastBanMessage
      });
      this.emitRequestWeightUpdate({
        type: "rate_limit_418",
        scope,
        method: `${method || "GET"}`.toUpperCase(),
        pathname,
        caller: toRequestCallerKey({ scope, method, pathname, requestMeta }),
        banUntil: state.banUntil,
        usedWeight1m: state.usedWeight1m,
        message: state.lastBanMessage
      });
      return;
    }
    if (status && status < 400) {
      state.consecutiveRateLimitHits = 0;
      state.lastRateLimitStatus = state.lastRateLimitStatus === 418 && this.isRateLimitBanActive()
        ? 418
        : null;
      if (!this.isRateLimitBanActive()) {
        state.backoffUntil = Number(state.backoffUntil || 0) > this.nowFn() ? state.backoffUntil : null;
      }
      this.emitRequestWeightUpdate({
        type: "response_observed",
        scope,
        method: `${method || "GET"}`.toUpperCase(),
        pathname,
        caller: toRequestCallerKey({ scope, method, pathname, requestMeta }),
        usedWeight1m: state.usedWeight1m,
        usedWeight: state.usedWeight
      });
    }
  }

  async respectActiveRateLimits() {
    const state = this.getRateLimitState();
    if (state.banActive) {
      const error = new Error(`Binance REST banned until ${state.banUntil}`);
      error.status = 418;
      error.rateLimitState = state;
      throw error;
    }
    if (state.backoffActive && state.backoffRemainingMs > 0) {
      await sleep(Math.min(state.backoffRemainingMs, this.requestWeightBackoffMaxMs));
    }
  }

  async request(method, pathname, params = {}, signed = false, extraHeaders = {}, requestMeta = {}) {
    let lastError = null;
    const safeToRetry = !signed || isSafeRetryMethod(method);
    const scope = signed ? "signed" : "spot_public";
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        await this.respectActiveRateLimits();
        if (signed && (!this.apiKey || !this.apiSecret)) {
          throw new Error("Missing Binance API credentials for signed request.");
        }

        const payload = signed
          ? {
              ...params,
              recvWindow: this.recvWindow,
              timestamp: this.nowFn() + this.clockOffsetMs
            }
          : params;
        const queryString = createQueryString(payload);
        const signature = signed ? this.sign(queryString) : null;
        const url = `${this.baseUrl}${pathname}${queryString ? `?${queryString}` : ""}${signature ? `${queryString ? "&" : "?"}signature=${signature}` : ""}`;
        this.noteRequestDiagnostics({ scope, method, pathname, requestMeta, params });

        const response = await this.fetchImpl(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(signed ? { "X-MBX-APIKEY": this.apiKey } : {}),
            ...extraHeaders
          },
          signal: AbortSignal.timeout(10_000)
        });

        const text = await response.text();
        let responsePayload = null;
        try {
          responsePayload = parsePayload(text);
        } catch (parseError) {
          if (response.ok) {
            parseError.status = response.status;
            parseError.rawBody = text;
            throw parseError;
          }
        }
        this.updateRequestWeightFromResponse(response, {
          status: response.status,
          payload: responsePayload,
          rawBody: text,
          scope,
          method,
          pathname,
          requestMeta
        });
        if (!response.ok) {
          throw buildResponseError(response, responsePayload, text, `Binance request failed with ${response.status}`);
        }
        return responsePayload;
      } catch (error) {
        lastError = error;
        const binanceCode = error?.payload?.code;
        if (signed && binanceCode === -1021) {
          await this.syncServerTime(true);
        }
        const shouldRetry = attempt < this.maxRetries && (
          binanceCode === -1021 ||
          (safeToRetry && (isRetriableStatus(error.status || 0) || isRetriableNetworkError(error)))
        );
        if (!shouldRetry) {
          break;
        }
        await sleep(200 * attempt);
      }
    }
    throw lastError;
  }

  async requestToBase(baseUrl, method, pathname, params = {}, extraHeaders = {}, requestMeta = {}) {
    let lastError = null;
    const cleanBaseUrl = `${baseUrl}`.replace(/\/$/, "");
    const scope = cleanBaseUrl === this.futuresBaseUrl ? "futures_public" : "external_public";
    const methodName = `${method || "GET"}`.toUpperCase();
    const cacheableFuturesPublic = scope === "futures_public" && methodName === "GET" && requestMeta?.skipCache !== true;
    const caller = requestMeta?.caller || `${scope}:${methodName} ${pathname}`;
    const cacheMs = Math.max(1_000, Number(requestMeta?.cacheMs || this.futuresPublicCacheMs));
    const cacheKey = cacheableFuturesPublic ? `${pathname}?${createSortedQueryString(params)}` : null;
    if (cacheableFuturesPublic) {
      const cached = this.futuresPublicCache.get(cacheKey);
      if (cached?.payload !== undefined && this.nowFn() - cached.cachedAtMs <= cacheMs) {
        this.noteCacheDiagnostics({ caller, cacheKey: "futures_public_context", type: "cache_hit", ttlMs: cacheMs });
        return cached.payload;
      }
      if (cached?.inFlight) {
        this.noteCacheDiagnostics({ caller, cacheKey: "futures_public_context", type: "coalesced", ttlMs: cacheMs });
        return cached.inFlight;
      }
      this.noteCacheDiagnostics({ caller, cacheKey: "futures_public_context", type: "cache_miss", ttlMs: cacheMs, fallbackReason: "ttl_expired_or_empty" });
    }
    const performRequest = async () => {
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        await this.respectActiveRateLimits();
        const queryString = createQueryString(params);
        const url = `${cleanBaseUrl}${pathname}${queryString ? `?${queryString}` : ""}`;
        this.noteRequestDiagnostics({ scope, method, pathname, requestMeta, params });
        const response = await this.fetchImpl(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...extraHeaders
          },
          signal: AbortSignal.timeout(10_000)
        });
        const text = await response.text();
        let payload = null;
        try {
          payload = parsePayload(text);
        } catch (parseError) {
          if (response.ok) {
            parseError.status = response.status;
            parseError.rawBody = text;
            throw parseError;
          }
        }
        this.updateRequestWeightFromResponse(response, {
          status: response.status,
          payload,
          rawBody: text,
          scope,
          method,
          pathname,
          requestMeta
        });
        if (!response.ok) {
          throw buildResponseError(response, payload, text, `Binance request failed with ${response.status}`);
        }
        return payload;
      } catch (error) {
        lastError = error;
        const shouldRetry = attempt < this.maxRetries && (isRetriableStatus(error.status || 0) || isRetriableNetworkError(error));
        if (!shouldRetry) {
          break;
        }
        await sleep(200 * attempt);
      }
    }
    throw lastError;
    };
    if (!cacheableFuturesPublic) {
      return performRequest();
    }
    const inFlight = performRequest().then((payload) => {
      this.futuresPublicCache.set(cacheKey, { payload, cachedAtMs: this.nowFn() });
      return payload;
    }).finally(() => {
      const current = this.futuresPublicCache.get(cacheKey);
      if (current?.inFlight === inFlight) {
        this.futuresPublicCache.delete(cacheKey);
      }
    });
    this.futuresPublicCache.set(cacheKey, { inFlight, cachedAtMs: this.nowFn() });
    return inFlight;
  }

  async publicRequest(method, pathname, params = {}, requestMeta = {}) {
    return this.request(method, pathname, params, false, {}, requestMeta);
  }

  async futuresPublicRequest(method, pathname, params = {}, requestMeta = {}) {
    return this.requestToBase(this.futuresBaseUrl, method, pathname, params, {}, requestMeta);
  }

  async signedRequest(method, pathname, params = {}, requestMeta = {}) {
    return this.request(method, pathname, params, true, {}, requestMeta);
  }

  async apiKeyRequest(method, pathname, params = {}, requestMeta = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        await this.respectActiveRateLimits();
        const queryString = createQueryString(params);
        const url = `${this.baseUrl}${pathname}${queryString ? `?${queryString}` : ""}`;
        this.noteRequestDiagnostics({ scope: "api_key", method, pathname, requestMeta, params });
        const response = await this.fetchImpl(url, {
          method,
          headers: buildUserDataHeaders(this.apiKey),
          signal: AbortSignal.timeout(10_000)
        });
        const text = await response.text();
        let payload = {};
        try {
          payload = parsePayload(text) || {};
        } catch (parseError) {
          if (response.ok) {
            parseError.status = response.status;
            parseError.rawBody = text;
            throw parseError;
          }
          payload = {};
        }
        this.updateRequestWeightFromResponse(response, {
          status: response.status,
          payload,
          rawBody: text,
          scope: "api_key",
          method,
          pathname,
          requestMeta
        });
        if (!response.ok) {
          throw buildResponseError(response, payload, text, `Binance api-key request failed with ${response.status}`);
        }
        return payload;
      } catch (error) {
        lastError = error;
        const shouldRetry = attempt < this.maxRetries && (isRetriableStatus(error.status || 0) || isRetriableNetworkError(error));
        if (!shouldRetry) {
          break;
        }
        await sleep(200 * attempt);
      }
    }
    throw lastError;
  }

  async ping() {
    return this.publicRequest("GET", "/api/v3/ping");
  }

  async getServerTime() {
    return this.publicRequest("GET", "/api/v3/time");
  }

  async syncServerTime(force = false) {
    const currentState = this.getClockSyncState();
    if (!force && currentState.sampleCount > 0 && !currentState.stale) {
      return this.clockOffsetMs;
    }

    const samples = [];
    for (let index = 0; index < this.clockSyncSampleCount; index += 1) {
      const startedAt = this.nowFn();
      const response = await this.getServerTime();
      const receivedAt = this.nowFn();
      const roundTripMs = Math.max(0, receivedAt - startedAt);
      const midpointMs = startedAt + roundTripMs / 2;
      const serverTime = Number(response.serverTime || 0);
      if (!Number.isFinite(serverTime)) {
        continue;
      }
      samples.push({
        serverTime,
        roundTripMs,
        offsetMs: serverTime - midpointMs,
        startedAt,
        receivedAt
      });
      if (index < this.clockSyncSampleCount - 1) {
        await sleep(40);
      }
    }

    if (!samples.length) {
      throw new Error("Unable to synchronize Binance server time.");
    }

    const accepted = samples.filter((sample) => sample.roundTripMs <= this.clockSyncMaxRttMs);
    const chosenSamples = accepted.length
      ? accepted
      : [...samples]
          .sort((left, right) => left.roundTripMs - right.roundTripMs)
          .slice(0, Math.max(1, Math.ceil(samples.length / 2)));

    const offsets = chosenSamples.map((sample) => sample.offsetMs);
    const roundTrips = chosenSamples.map((sample) => sample.roundTripMs);
    const bestRttMs = roundTrips.length ? Math.min(...roundTrips) : null;
    const offsetSpreadMs = offsets.length > 1 ? Math.max(...offsets) - Math.min(...offsets) : 0;
    const offsetMs = median(offsets);
    const estimatedDriftMs = Math.max((bestRttMs || 0) / 2, offsetSpreadMs / 2, 0);
    const lastSyncAtMs = Math.max(...chosenSamples.map((sample) => sample.receivedAt));

    this.clockOffsetMs = Math.round(offsetMs);
    this.clockState = {
      offsetMs: this.clockOffsetMs,
      estimatedDriftMs,
      bestRttMs,
      medianRttMs: median(roundTrips),
      averageRttMs: average(roundTrips),
      offsetSpreadMs,
      sampleCount: chosenSamples.length,
      totalSampleCount: samples.length,
      lastSyncAt: new Date(lastSyncAtMs).toISOString(),
      stale: false,
      syncAgeMs: 0
    };
    return this.clockOffsetMs;
  }

  async getExchangeInfo(symbols = [], options = {}) {
    const symbolList = Array.isArray(symbols) ? symbols : [];
    const forceRefresh = Boolean(options?.forceRefresh);
    const cacheMs = Math.max(1_000, Number(options?.cacheMs || this.exchangeInfoCacheMs));
    const cacheKey = symbolList.length
      ? JSON.stringify([...symbolList].map((symbol) => `${symbol}`.trim().toUpperCase()).sort())
      : "__all__";
    const cached = this.exchangeInfoCache.get(cacheKey);
    if (!forceRefresh && cached && (this.nowFn() - cached.cachedAtMs) <= cacheMs) {
      this.noteCacheDiagnostics({
        caller: options?.requestMeta?.caller || "exchange_info",
        cacheKey: "exchange_info",
        type: "cache_hit",
        ttlMs: cacheMs
      });
      return cached.payload;
    }
    if (!forceRefresh && this.exchangeInfoInflight.has(cacheKey)) {
      this.noteCacheDiagnostics({
        caller: options?.requestMeta?.caller || "exchange_info",
        cacheKey: "exchange_info",
        type: "coalesced",
        ttlMs: cacheMs
      });
      return this.exchangeInfoInflight.get(cacheKey);
    }
    this.noteCacheDiagnostics({
      caller: options?.requestMeta?.caller || "exchange_info",
      cacheKey: "exchange_info",
      type: "cache_miss",
      ttlMs: cacheMs,
      fallbackReason: forceRefresh ? "forced_refresh" : "ttl_expired_or_empty"
    });
    const params = symbolList.length === 1 ? { symbol: symbolList[0] } : symbolList.length > 1 ? { symbols: symbolList } : {};
    const inFlight = this.publicRequest("GET", "/api/v3/exchangeInfo", params, {
      caller: options?.requestMeta?.caller || "exchange_info",
      ...(options?.requestMeta || {})
    }).then((payload) => {
      this.exchangeInfoCache.set(cacheKey, {
        cachedAtMs: this.nowFn(),
        payload
      });
      return payload;
    }).finally(() => {
      if (this.exchangeInfoInflight.get(cacheKey) === inFlight) {
        this.exchangeInfoInflight.delete(cacheKey);
      }
    });
    this.exchangeInfoInflight.set(cacheKey, inFlight);
    return inFlight;
  }

  async getKlines(symbol, interval, limit = 200, options = {}) {
    const normalizedOptions = typeof limit === "object" && limit !== null ? limit : options;
    const normalizedLimit = typeof limit === "object" && limit !== null
      ? Number(limit.limit || 200)
      : Number(limit || 200);
    const { requestMeta, ...requestParams } = normalizedOptions || {};
    return this.publicRequest("GET", "/api/v3/klines", {
      symbol,
      interval,
      limit: normalizedLimit,
      ...requestParams
    }, requestMeta || {});
  }

  async get24hTicker(symbol) {
    return this.publicRequest("GET", "/api/v3/ticker/24hr", { symbol });
  }

  async getBookTicker(symbol, options = {}) {
    return this.publicRequest("GET", "/api/v3/ticker/bookTicker", { symbol }, options?.requestMeta || {});
  }

  async getOrderBook(symbol, limit = 10, options = {}) {
    const normalizedLimit = typeof limit === "object" && limit !== null ? Number(limit.limit || 10) : Number(limit || 10);
    const normalizedOptions = typeof limit === "object" && limit !== null ? limit : options;
    return this.publicRequest("GET", "/api/v3/depth", { symbol, limit: normalizedLimit }, normalizedOptions?.requestMeta || {});
  }

  async getFuturesPremiumIndex(symbol) {
    return this.futuresPublicRequest("GET", "/fapi/v1/premiumIndex", { symbol });
  }

  async getFuturesOpenInterest(symbol) {
    return this.futuresPublicRequest("GET", "/fapi/v1/openInterest", { symbol });
  }

  async getFuturesOpenInterestHist(symbol, period = "5m", limit = 12) {
    return this.futuresPublicRequest("GET", "/futures/data/openInterestHist", { symbol, period, limit });
  }

  async getFuturesTakerLongShortRatio(symbol, period = "5m", limit = 12) {
    return this.futuresPublicRequest("GET", "/futures/data/takerlongshortRatio", { symbol, period, limit });
  }

  async getFuturesBasis(symbol, period = "5m", limit = 12) {
    return this.futuresPublicRequest("GET", "/futures/data/basis", {
      pair: symbol,
      contractType: "PERPETUAL",
      period,
      limit
    });
  }

  async getFuturesGlobalLongShortAccountRatio(symbol, period = "5m", limit = 12) {
    return this.futuresPublicRequest("GET", "/futures/data/globalLongShortAccountRatio", { symbol, period, limit });
  }

  async getFuturesTopLongShortPositionRatio(symbol, period = "5m", limit = 12) {
    return this.futuresPublicRequest("GET", "/futures/data/topLongShortPositionRatio", { symbol, period, limit });
  }

  async getAccountInfo(omitZeroBalances = false, options = {}) {
    return this.signedRequest("GET", "/api/v3/account", { omitZeroBalances }, options?.requestMeta || {});
  }

  async getOpenOrders(symbol, options = {}) {
    return this.signedRequest("GET", "/api/v3/openOrders", symbol ? { symbol } : {}, options?.requestMeta || {});
  }

  async getOpenOrderLists() {
    return this.signedRequest("GET", "/api/v3/openOrderList");
  }

  async getOrderList(params) {
    return this.signedRequest("GET", "/api/v3/orderList", params);
  }

  async getAllOrderLists(params = {}) {
    return this.signedRequest("GET", "/api/v3/allOrderList", params);
  }

  async getOrder(symbol, params, options = {}) {
    return this.signedRequest("GET", "/api/v3/order", { symbol, ...params }, options?.requestMeta || {});
  }

  async getMyTrades(symbol, params = {}, options = {}) {
    return this.signedRequest("GET", "/api/v3/myTrades", { symbol, ...params }, options?.requestMeta || {});
  }

  async getCommissionRates(symbol) {
    return this.signedRequest("GET", "/api/v3/account/commission", { symbol });
  }

  async getOrderAmendments(symbol, orderId) {
    return this.signedRequest("GET", "/api/v3/order/amendments", { symbol, orderId });
  }

  async getMyPreventedMatches(symbol, params = {}) {
    return this.signedRequest("GET", "/api/v3/myPreventedMatches", { symbol, ...params });
  }

  async testOrder(params) {
    return this.signedRequest("POST", "/api/v3/order/test", params);
  }

  async placeOrder(params) {
    return this.signedRequest("POST", "/api/v3/order", params);
  }

  async placeOrderListOco(params) {
    return this.signedRequest("POST", "/api/v3/orderList/oco", params);
  }

  async cancelOrder(symbol, params) {
    return this.signedRequest("DELETE", "/api/v3/order", { symbol, ...params });
  }

  async cancelOrderList(params) {
    return this.signedRequest("DELETE", "/api/v3/orderList", params);
  }

  async cancelAllOpenOrders(symbol) {
    return this.signedRequest("DELETE", "/api/v3/openOrders", { symbol });
  }

  async cancelReplaceOrder(params) {
    return this.signedRequest("POST", "/api/v3/order/cancelReplace", params);
  }

  async amendOrderKeepPriority(params) {
    return this.signedRequest("PUT", "/api/v3/order/amend/keepPriority", params);
  }

  async createUserDataListenKey() {
    const response = await this.apiKeyRequest("POST", "/api/v3/userDataStream");
    return response.listenKey;
  }

  async keepAliveUserDataListenKey(listenKey) {
    return this.apiKeyRequest("PUT", "/api/v3/userDataStream", { listenKey });
  }

  async closeUserDataListenKey(listenKey) {
    return this.apiKeyRequest("DELETE", "/api/v3/userDataStream", { listenKey });
  }
}

export function normalizeKlines(rawKlines) {
  return rawKlines.map((entry) => ({
    openTime: Number(entry[0]),
    open: Number(entry[1]),
    high: Number(entry[2]),
    low: Number(entry[3]),
    close: Number(entry[4]),
    volume: Number(entry[5]),
    closeTime: Number(entry[6])
  }));
}
