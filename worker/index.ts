export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Test endpoint for Stage 1 verification
    if (url.pathname === '/api/test-worker' || url.pathname === '/api/health' || url.pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          worker: 'ready',
          version: '1.0.0',
          message: 'Cloudflare Worker is running and operational.',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    return new Response('Kids Video Safe Proxy Worker', { status: 200 });
  },
};
