// Only public YouTube watch pages for validated video IDs can be requested.
export async function metadata(id, fetcher = fetch) {
  if (!/^[\w-]{11}$/.test(id || '')) return new Response('Invalid video ID', {status: 400});
  try {
    const page = await fetcher('https://www.youtube.com/watch?v=' + id, {
      headers: {'Accept-Language': 'en-US,en;q=0.8'}, signal: AbortSignal.timeout(8500)
    });
    if (!page.ok) throw new Error('Provider unavailable');
    const html = await page.text();
    const match = html.match(/(?:var\s+)?ytInitialPlayerResponse\s*=\s*(\{[^\n]*?\})\s*;\s*<\/script>/);
    const details = match && JSON.parse(match[1]).videoDetails;
    if (details?.videoId !== id || !details.title) throw new Error('Metadata unavailable');
    return Response.json({title: details.title, description: details.shortDescription || ''},
      {headers: {'Cache-Control': 'public, max-age=3600'}});
  } catch {
    return new Response('YouTube details unavailable', {status: 502});
  }
}
