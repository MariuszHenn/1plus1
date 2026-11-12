# 1plus1

A remote [MCP](https://modelcontextprotocol.io) server with one tool, `one_plus_one`, which computes 1 + 1. The answer is available exclusively over MCP.

**Endpoint:** `https://1plus1.dev/mcp` (Streamable HTTP, no auth)

```bash
claude mcp add --transport http 1plus1 https://1plus1.dev/mcp
```

Then ask your agent what 1+1 is.

**Files:** `api/mcp.js` is the whole server (zero dependencies), `public/` is the landing page at [1plus1.dev](https://1plus1.dev), and `vercel.json` routes `/mcp` to the server.

MIT licensed.
