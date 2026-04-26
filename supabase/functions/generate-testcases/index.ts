import { buildPrompt } from './prompt.ts';
import { cleanJSON, validateTestCases, fallbackResponse } from './utils.ts';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function callGemini(prompt: string, apiKey: string): Promise<Response> {
  return await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 65536,
      }
    })
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    const { requirement } = await req.json();

    if (!requirement || requirement.trim() === '') {
      return new Response(JSON.stringify({ error: true, message: 'Requirement is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: true, message: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const prompt = buildPrompt(requirement);

    let testCases = null;
    let lastError = '';

    // ── RETRY LOOP ──
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`Attempt ${attempt}/${MAX_RETRIES}`);

      try {
        const geminiRes = await callGemini(prompt, apiKey);

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          lastError = `Gemini HTTP ${geminiRes.status}: ${errText}`;
          console.error(`Attempt ${attempt} failed:`, lastError);

          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * attempt); // 2s, 4s, 6s
            continue;
          }
          break;
        }

        const geminiData = await geminiRes.json();
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = cleanJSON(rawText);

        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          lastError = 'JSON parse error';
          console.error(`Attempt ${attempt} JSON parse failed:`, cleaned.slice(0, 200));

          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * attempt);
            continue;
          }
          break;
        }

        if (!validateTestCases(parsed)) {
          lastError = 'Invalid test case format';
          console.error(`Attempt ${attempt} validation failed`);

          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * attempt);
            continue;
          }
          break;
        }

        // ── SUCCESS ──
        testCases = parsed;
        console.log(`Success on attempt ${attempt}, got ${testCases.length} test cases`);
        break;

      } catch (err) {
        lastError = String(err);
        console.error(`Attempt ${attempt} exception:`, lastError);

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
      }
    }

    // ── RETURN RESULT ──
    if (testCases) {
      return new Response(JSON.stringify({ error: false, data: testCases }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify({
      error: true,
      message: `Failed after ${MAX_RETRIES} attempts: ${lastError}`,
      data: []
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify(fallbackResponse()), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});