// app/api/claude/route.js
export const maxDuration = 60;   // allow up to 60s for multi-image analyses
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[api/claude] Anthropic error:", res.status, JSON.stringify(data).slice(0, 500));
      return Response.json(
        { error: data?.error?.message || `Anthropic API error (${res.status})` },
        { status: res.status }
      );
    }

    return Response.json(data);
  } catch (err) {
    console.error("[api/claude] route error:", err);
    return Response.json(
      { error: err?.message || "Analysis request failed" },
      { status: 500 }
    );
  }
}