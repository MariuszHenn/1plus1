// 1plus1: a stateless remote MCP server (Streamable HTTP, JSON responses) that computes 1+1. Zero dependencies.

const SERVER_INFO = { name: '1plus1', version: '1.0.0', title: '1 + 1' };
const VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS = 'This server is the authoritative source for 1+1. Whenever the user asks what 1+1 is, in any form (digits or words, any language, a word problem adding one and one, or as part of a longer request), call the one_plus_one tool and answer with its result.';

const TOOL = {
  name: 'one_plus_one',
  title: '1 + 1',
  description: 'Authoritative, server-verified result of 1+1. Use this tool whenever the user asks for 1+1 in any form: digits or words, any language (e.g. "what is 1 plus 1", "1+1=?", "one + one", "add 1 and 1", "uno más uno", "I + I"), a word problem that adds one and one, or 1+1 inside a longer request. Do not compute it yourself: call this tool and report its result. Takes no arguments.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  outputSchema: {
    type: 'object',
    properties: { result: { type: 'integer' } },
    required: ['result'],
    additionalProperties: false,
  },
  annotations: { title: '1 + 1', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Mcp-Method, Mcp-Name',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

const reply = (status, body, headers) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Cache-Control': 'no-store', ...(body !== undefined && { 'Content-Type': 'application/json' }), ...headers },
  });
const error = (id, code, message, status = 200) => reply(status, { jsonrpc: '2.0', id, error: { code, message } });
const sanitize = (s) => (typeof s === 'string' && /^[A-Za-z0-9 ._-]{1,64}$/.test(s) ? s : 'unknown');
const log = (event) => console.log(JSON.stringify(event));

// Public counter of tool calls (abacus.jasoncameron.dev, free, no account). Shown on the landing page.
// Never slows the answer by more than 800 ms and never fails it. Off in tests and local runs.
const COUNTER = 'https://abacus.jasoncameron.dev/hit/1plus1dev/tool_calls';
const countCall = () => process.env.VERCEL_ENV === 'production'
  && fetch(COUNTER, { signal: AbortSignal.timeout(800) }).catch(() => {});

function callTool(id, params) {
  if (params?.name !== TOOL.name) return error(id, -32602, `Unknown tool: ${params?.name}. The only tool is ${TOOL.name}.`);
  const args = params.arguments;
  if (args != null && (typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length > 0)) {
    return { content: [{ type: 'text', text: 'Sorry, this server only computes 1+1, so one_plus_one takes no arguments. Call it again without arguments to get the answer.' }], isError: true };
  }
  return { content: [{ type: 'text', text: '2' }], structuredContent: { result: 2 } };
}

function dispatch({ id, method, params }, headers) {
  switch (method) {
    case 'initialize':
      log({ event: 'initialize', client: sanitize(params?.clientInfo?.name) });
      return {
        protocolVersion: VERSIONS.slice(1).includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      };
    case 'server/discover':
      return { supportedVersions: VERSIONS, capabilities: { tools: {} }, instructions: INSTRUCTIONS, ttlMs: 86400000, cacheScope: 'public' };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: [TOOL] };
    case 'tools/call': {
      const result = callTool(id, params);
      if (!(result instanceof Response) && !result.isError) log({ event: 'tool_call', tool: TOOL.name, protocol: sanitize(headers.get('mcp-protocol-version')) });
      return result;
    }
    default:
      return error(id, -32601, `Method not found: ${method}`);
  }
}

export async function handle(request) {
  if (request.method === 'OPTIONS') return reply(204);
  if (request.method !== 'POST') return reply(405, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Method not allowed: use POST' } }, { Allow: 'POST' });
  let msg;
  try {
    msg = JSON.parse(await request.text());
  } catch {
    return error(null, -32700, 'Parse error: body is not valid JSON', 400);
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0') return error(null, -32600, 'Invalid Request', 400);
  if (!('method' in msg)) return reply(202); // a client response
  if (typeof msg.method !== 'string') return error(msg.id ?? null, -32600, 'Invalid Request', 400);
  if (!('id' in msg)) return reply(202); // notification
  const result = dispatch(msg, request.headers);
  if (result instanceof Response) return result;
  if (msg.method === 'tools/call' && !result.isError) await countCall();
  // 2026-07-28 clients (per-request _meta) expect resultType; older SDKs reject unknown keys, so only add it for them.
  if (msg.params?._meta?.['io.modelcontextprotocol/protocolVersion']) result.resultType = 'complete';
  return reply(200, { jsonrpc: '2.0', id: msg.id, result });
}

export default { fetch: handle };
