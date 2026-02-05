export async function onRequest({ request }) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();

    // Return empty quickly
    if (q.length < 2) {
      return new Response(JSON.stringify({ count: 0, tokens: [] }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      });
    }

    const upstream = new URL("https://s1.xrplmeta.org/tokens");
    upstream.searchParams.set("limit", "30");
    upstream.searchParams.set("offset", "0");
    // xrplmeta supports name_like (you already confirmed)
    upstream.searchParams.set("name_like", q);

    // Upstream fetch
    const r = await fetch(upstream.toString(), {
      headers: { "accept": "application/json" },
    });

    const ct = (r.headers.get("content-type") || "").toLowerCase();
    const text = await r.text();

    // If upstream didn't return JSON, surface it (don't silently succeed with HTML)
    if (!ct.includes("application/json")) {
      return new Response(
        JSON.stringify({
          error: "upstream_not_json",
          status: r.status,
          content_type: ct,
          sample: text.slice(0, 200),
        }),
        {
          status: 502,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
          },
        }
      );
    }

    // Pass through JSON
    return new Response(text, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "server_error", message: String(e?.message || e) }),
      {
        status: 500,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      }
    );
  }
}
