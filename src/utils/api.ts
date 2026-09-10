/**
 * Safe fetch utility for API endpoints
 * Prevents "SyntaxError: Unexpected token <, <!DOCTYPE... is not valid JSON"
 * and provides clear guidance when deployed on serverless platforms like Vercel.
 */

export async function fetchJsonSafely<T = any>(
  url: string,
  options?: RequestInit,
  fallbackErrMsg = 'Request failed'
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (networkErr: any) {
    throw new Error(`Network connection error: ${networkErr.message || 'Failed to reach API server'}`);
  }

  const contentType = res.headers.get('content-type') || '';
  const rawText = await res.text();

  // If response is not JSON (e.g. HTML 404 from Vercel / proxy)
  if (!contentType.includes('application/json')) {
    if (res.status === 404) {
      throw new Error(
        `API endpoint "${url}" was not found (404). When deployed on Vercel, ensure vercel.json rewrites are active and the serverless functions deployed successfully.`
      );
    }
    if (!res.ok) {
      // Strip HTML tags if any to make message readable
      const cleanSnippet = rawText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      throw new Error(`Server returned HTTP ${res.status}: ${cleanSnippet || res.statusText}`);
    }
    throw new Error(`Server returned unexpected ${contentType || 'non-JSON'} content instead of JSON.`);
  }

  // Parse JSON safely
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (parseErr: any) {
    throw new Error(`Failed to parse response from "${url}": ${parseErr.message}`);
  }

  if (!res.ok) {
    throw new Error(data.error || data.message || `${fallbackErrMsg} (HTTP ${res.status})`);
  }

  return data as T;
}
