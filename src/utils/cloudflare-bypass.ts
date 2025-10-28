import axios, { AxiosRequestConfig } from "axios";
import CurlImpersonate from "node-curl-impersonate";

/**
 * Get browser-like headers to bypass basic Cloudflare detection
 */
export function getBrowserHeaders(): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    Connection: "keep-alive",
  };
}

/**
 * Make a request using curl-impersonate to bypass TLS fingerprinting
 */
async function makeRequestWithCurlImpersonate(
  url: string,
  method: "GET" | "POST",
  data?: any,
  headers?: Record<string, string>
): Promise<{ data: any; status: number; headers: any }> {
  try {
    const curlClient = new CurlImpersonate(url, {
      method,
      impersonate: "chrome-116",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Content-Type": "application/json",
        ...headers,
      },
      body: data,
      followRedirects: true,
      timeout: 45000, // 45 seconds timeout
    });

    const response = await curlClient.makeRequest();

    // Parse JSON response
    let parsedData;
    try {
      parsedData = JSON.parse(response.response);
    } catch {
      parsedData = response.response;
    }

    return {
      data: parsedData,
      status: response.statusCode || 200,
      headers: response.responseHeaders,
    };
  } catch (error: any) {
    throw new Error(
      `Curl impersonate request failed: ${error.message || String(error)}`
    );
  }
}

/**
 * Smart two-tier request approach:
 * - Tier 1: Try with enhanced headers (fast, 10-20% success)
 * - Tier 2: On 403, retry with curl-impersonate (80-90% success)
 */
export async function makeSmartRequest(
  url: string,
  method: "GET" | "POST" = "GET",
  data?: any,
  config?: AxiosRequestConfig
): Promise<{ data: any; status: number; headers: any; tier: "headers" | "tls-spoofing" }> {
  // Tier 1: Try with enhanced headers
  try {
    console.log(`[Cloudflare Bypass] Tier 1: Trying enhanced headers for ${url}`);

    const response = await axios({
      method,
      url,
      data,
      headers: {
        ...getBrowserHeaders(),
        "Content-Type": "application/json",
        ...config?.headers,
      },
      timeout: 30000,
      ...config,
    });

    console.log(`[Cloudflare Bypass] ✓ Tier 1 succeeded (enhanced headers)`);

    return {
      data: response.data,
      status: response.status,
      headers: response.headers,
      tier: "headers",
    };
  } catch (error: any) {
    // If not a 403 error, throw immediately
    if (error.response?.status !== 403) {
      throw error;
    }

    console.log(`[Cloudflare Bypass] Tier 1 failed (403), escalating to Tier 2...`);
  }

  // Tier 2: Fallback to curl-impersonate for TLS spoofing
  try {
    console.log(`[Cloudflare Bypass] Tier 2: Using TLS fingerprint spoofing for ${url}`);

    const response = await makeRequestWithCurlImpersonate(
      url,
      method,
      data,
      config?.headers as Record<string, string> | undefined
    );

    console.log(`[Cloudflare Bypass] ✓ Tier 2 succeeded (TLS spoofing)`);

    return {
      ...response,
      tier: "tls-spoofing",
    };
  } catch (error: any) {
    console.error(`[Cloudflare Bypass] ✗ Both tiers failed`);
    throw new Error(
      `Cloudflare bypass failed on both tiers: ${error.message || String(error)}`
    );
  }
}
