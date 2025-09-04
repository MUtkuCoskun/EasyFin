const HOST = process.env.KAP_HOST || "https://apigwdev.mkk.com.tr";
const API_KEY = process.env.KAP_API_KEY || "215bb60d-59d3-4753-866b-14c8d8e0cc8a";

type KapError = { code?: string; message?: string };

let tokenCache: { token: string; expAt: number } | null = null;

function withApiKey(url: string) {
  // apiKey’i query param olarak da ekle (gateway bazı profillerde bunu bekliyor)
  try {
    const u = new URL(url);
    if (API_KEY && !u.searchParams.has("apiKey")) u.searchParams.set("apiKey", API_KEY);
    return u.toString();
  } catch {
    return url;
  }
}

async function generateToken(): Promise<string> {
  if (!API_KEY) throw new Error("KAP_API_KEY eksik");
  const url = withApiKey(`${HOST}/auth/generateToken`);
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`Token alınamadı: ${r.status} ${await r.text()}`);
  const { token } = await r.json();
  tokenCache = { token, expAt: Date.now() + 23 * 60 * 60 * 1000 }; // ~23 saat
  return token;
}

async function getToken(): Promise<string | null> {
  // Prod’da daima token; dev’de de zararsız (gönderiyoruz).
  if (!API_KEY) return null;
  if (tokenCache && tokenCache.expAt > Date.now()) return tokenCache.token;
  return generateToken();
}

async function kapFetch(path: string, { retry = true }: { retry?: boolean } = {}) {
  if (!API_KEY) throw new Error("KAP_API_KEY tanımlı değil");
  const url = withApiKey(`${HOST}${path}`);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // bazı gateway profilleri header’da da apikey arıyor:
    "apikey": API_KEY,
  };

  const token = await getToken().catch(() => null);
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 401 → token yenileyip tek kez daha dene
    if (res.status === 401 && retry) {
      tokenCache = null;
      const fresh = await getToken().catch(() => null);
      const headers2: Record<string, string> = { "Content-Type": "application/json", "apikey": API_KEY };
      if (fresh) headers2.Authorization = `Bearer ${fresh}`;
      const res2 = await fetch(url, { headers: headers2, cache: "no-store" });
      if (!res2.ok) throw new Error(`KAP 401 (retry) @ ${path} :: ${await res2.text()}`);
      return res2.json();
    }
    // hata mesajını anlamlı göster
    try {
      const j: KapError = JSON.parse(body);
      throw new Error(`KAP hata ${res.status} @ ${path} :: ${j.code || ""} ${j.message || body}`);
    } catch {
      throw new Error(`KAP hata ${res.status} @ ${path} :: ${body}`);
    }
  }
  return res.json();
}

// ---- Public helpers ----
export async function kapMembers() {
  return kapFetch(`/api/vyk/members`);
}

export async function kapLastDisclosureIndex(): Promise<number> {
  const j = await kapFetch(`/api/vyk/lastDisclosureIndex`);
  return Number(j.lastDisclosureIndex);
}

export async function kapDisclosures(params: {
  disclosureIndex: number;
  disclosureType?: string;
  disclosureClass?: string;
  companyId?: string;
}) {
  const q = new URLSearchParams({ disclosureIndex: String(params.disclosureIndex) });
  if (params.disclosureType) q.set("disclosureType", params.disclosureType);
  if (params.disclosureClass) q.set("disclosureClass", params.disclosureClass);
  if (params.companyId) q.set("companyId", params.companyId);
  return kapFetch(`/api/vyk/disclosures?${q.toString()}`);
}

export async function kapDisclosureDetail(id: number, fileType: "data" | "html" = "data") {
  const q = new URLSearchParams({ fileType });
  return kapFetch(`/api/vyk/disclosureDetail/${id}?${q.toString()}`);
}

// Ticker → companyId (cache’li)
let memberMap: Map<string, { id: string; title: string }> | null = null;
export async function getCompanyIdByTicker(ticker: string) {
  if (!memberMap) {
    const list = await kapMembers();
    memberMap = new Map(
      list
        .filter((m: any) => m.stockCode)
        .map((m: any) => [String(m.stockCode).toUpperCase(), { id: String(m.id), title: m.title }]),
    );
  }
  return memberMap.get(ticker.toUpperCase()) || null;
}
