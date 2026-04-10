// Stdio MCP servers MUST keep stdout pristine: only JSON-RPC messages may be written there.
// Any stray console.log from imported modules (ConfigProvider, SCHACL loader, etc.)
// would corrupt the protocol stream and crash the client.
// This file is imported FIRST in src/mcp/server.ts so the redirect runs before
// any other module has a chance to print to stdout.
console.log = (...args: unknown[]) => console.error(...args);
console.info = (...args: unknown[]) => console.error(...args);
console.warn = (...args: unknown[]) => console.error(...args);
