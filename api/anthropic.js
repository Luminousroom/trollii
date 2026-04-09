// Vercel Serverless Function — proxies requests to Anthropic API
// Keeps your API key server-side and handles CORS for the native app
//
// Deploy: this file goes in /api/anthropic.js at the project root
// Vercel will automatically expose it at https://yourdomain.com/api/anthropic

export default async function handler(req, res) {
  // CORS headers — allows the native app to call this endpoint
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server not configured" });
  }

  const { type, ...params } = req.body || {};

  // Build the prompt based on request type
  let prompt;
  if (type === "price") {
    const { ingredient, shop, currencyName, currencyCode } = params;
    if (!ingredient || !shop || !currencyCode) {
      return res.status(400).json({ error: "Missing parameters" });
    }
    prompt = `Current price of "${ingredient}" at "${shop}" supermarket in ${currencyName}? Reply with ONLY a JSON object like {"price": 2.50, "source": "store website"} — no markdown, no explanation. If you can't find exact pricing, estimate based on typical ${currencyName} supermarket prices and set "source": "estimate". The price should be in ${currencyCode}.`;
  } else if (type === "advice") {
    const { family, budgetFmt, currencyCode, shop, totalFmt, overBudget, overFmt, mealSummary } = params;
    prompt = `I'm meal planning for a family of ${family}. My weekly budget is ${budgetFmt} (${currencyCode}). My preferred shop is ${shop}. Current total: ${totalFmt}.

Meals:
${mealSummary}

${overBudget ? `I'm OVER BUDGET by ${overFmt}. ` : ""}Give me 3-5 specific, actionable tips to ${overBudget ? "reduce costs and get within budget" : "optimize spending"} while keeping meals healthy. Suggest specific cheaper ingredient swaps or cheaper alternative meals. Reply ONLY as a JSON array: [{"tip": "...", "saving": "estimated saving amount as string"}]. No markdown, just JSON.`;
  } else {
    return res.status(400).json({ error: "Unknown request type" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return res.status(502).json({ error: "Upstream error" });
    }

    const data = await response.json();
    const text = (data.content || [])
      .map((block) => block.text || "")
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    // Parse and return structured data
    if (type === "price") {
      try {
        const parsed = JSON.parse(text);
        return res.status(200).json({ price: parsed.price, source: parsed.source });
      } catch {
        return res.status(200).json({ price: null, source: "parse_error" });
      }
    } else if (type === "advice") {
      try {
        const tips = JSON.parse(text);
        return res.status(200).json({ tips });
      } catch {
        return res.status(200).json({ tips: null });
      }
    }
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Proxy failure" });
  }
}
