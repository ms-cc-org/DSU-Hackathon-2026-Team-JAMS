// Agrigine's MCP server: lets AI assistants (Claude and other MCP clients) query Agrigine's county farm data.
// It speaks MCP's Streamable HTTP transport in its stateless form: every request is a JSON-RPC POST to /mcp and
// every answer is a plain JSON response. Read-only, no accounts, no sessions.
import { AccountError, sha256Hex, type Ctx, type Env } from './data';
import { TOOLS, ToolError } from './tools';

const SERVER = { name: 'agrigine', title: 'Agrigine county farm data', version: '0.1.0' };
// Newest first; we answer with the client's version when we know it, otherwise our newest.
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS = [
  'Agrigine covers every county in California, Delaware, Iowa and Nebraska, 2000 to 2025, for corn, soybeans, winter wheat and grain sorghum.',
  'Use find_places to turn a county or city name into a FIPS code, get_county_season for one season, get_county_history for trends,',
  'get_daily_weather for day-by-day conditions, and rank_counties to compare a state\'s counties.',
  'my_farms, my_records and my_reports read the connected person\'s own farms, field records, models and saved reports when they connected with a personal key from their Profile page.',
  'Say where numbers come from, and say when the data cannot answer a question rather than guessing.',
].join(' ');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

interface RpcRequest { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const rpcError = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handle(env: Env, ctx: Ctx, msg: RpcRequest) {
  const { id, method, params = {} } = msg;
  switch (method) {
    case 'initialize': {
      const asked = String(params.protocolVersion ?? '');
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER,
          instructions: INSTRUCTIONS,
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return {
        jsonrpc: '2.0', id,
        result: { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: true, openWorldHint: false, ...(t.account ? { title: `${name} (needs a personal key)` } : {}) } })) },
      };
    case 'tools/call': {
      const tool = TOOLS[String(params.name)];
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${String(params.name)}`);
      try {
        const out = await tool.run(env, (params.arguments as Record<string, unknown>) ?? {}, ctx);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }] } };
      } catch (e) {
        // Problems with the question go back to the model as a tool error it can read and fix.
        const text = e instanceof ToolError || e instanceof AccountError ? e.message : `Agrigine could not read its data: ${(e as Error).message}`;
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } };
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

const ABOUT = `Agrigine MCP server

Connect an MCP client (Claude, MCP Inspector and others) to this server's /mcp address using
the Streamable HTTP transport. Tools: ${Object.keys(TOOLS).join(', ')}.
To read your own farms, records and reports, add a personal key from your Agrigine Profile page
as the header "Authorization: Bearer agk_...".

${INSTRUCTIONS}
`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/' || url.pathname === '') return new Response(ABOUT, { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS } });
    if (url.pathname !== '/mcp') return new Response('Not found. The MCP endpoint is /mcp.', { status: 404, headers: CORS });
    // Stateless server: no server-to-client event stream to open, and no session to end.
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST, OPTIONS', ...CORS } });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(rpcError(null, -32700, 'Parse error: the body must be JSON-RPC.'), 400);
    }
    const batch = Array.isArray(body);
    const messages = (batch ? body : [body]) as RpcRequest[];
    if (!messages.length || messages.some(m => !m || m.jsonrpc !== '2.0' || typeof m.method !== 'string')) {
      return json(rpcError(null, -32600, 'Invalid JSON-RPC request.'), 400);
    }
    // A personal key, when sent, is hashed once and checked by the database on each account tool call.
    const auth = request.headers.get('Authorization') ?? '';
    const key = /^Bearer\s+(agk_[A-Za-z0-9_-]{20,})$/.exec(auth)?.[1] ?? null;
    const ctx: Ctx = { keyHash: key ? await sha256Hex(key) : null };
    // Notifications (no id) need no answer.
    const replies = await Promise.all(messages.filter(m => m.id !== undefined).map(m => handle(env, ctx, m)));
    if (!replies.length) return new Response(null, { status: 202, headers: CORS });
    return json(batch ? replies : replies[0]);
  },
} satisfies ExportedHandler<Env>;
