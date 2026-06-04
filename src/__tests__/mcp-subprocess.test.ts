/**
 * End-to-end MCP subprocess test.
 *
 * Spawns `node dist/index.js` and drives it as a real MCP client would
 * (the same way Cursor / Claude Desktop do). Catches transport-layer,
 * JSON-RPC, and tool-registration bugs that unit tests can't see because
 * they bypass the wire format entirely.
 *
 * If this suite passes, an IDE pointed at this binary will see the same
 * 10 tools listed by tools/list and get sane responses from tools/call.
 */
import { join } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const FIXTURE = join(process.cwd(), "src", "__tests__", "fixtures", "founding-story");
const SERVER_ENTRY = join(process.cwd(), "dist", "index.js");

const EXPECTED_TOOLS = [
  "check_impact",
  "list_lineage",
  "list_tables",
  "scan",
  "ping",
  "get_sample_project",
  "apply_remediation",
  "audit_pii_compliance",
  "sync_dbt_metadata",
  "generate_health_report",
];

describe("MCP subprocess: real client/server handshake over stdio", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [SERVER_ENTRY],
      // Suppress server stderr so jest output stays clean. Flip to "inherit"
      // when debugging a connection failure.
      stderr: "pipe",
    });

    client = new Client(
      { name: "lineage-mcp-test-client", version: "0.0.1" },
      { capabilities: {} }
    );

    await client.connect(transport);
  }, 15_000);

  afterAll(async () => {
    await client?.close();
  });

  describe("Protocol handshake", () => {
    it("initializes with server capabilities", () => {
      const caps = client.getServerCapabilities();
      expect(caps).toBeDefined();
      expect(caps?.tools).toBeDefined();
    });

    it("reports correct server identity", () => {
      const version = client.getServerVersion();
      expect(version?.name).toBe("lineage-mcp");
      expect(version?.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("tools/list", () => {
    it("returns exactly the 10 expected tools", async () => {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();
      expect(names).toEqual([...EXPECTED_TOOLS].sort());
    });

    it("every tool ships a valid JSON-Schema inputSchema", async () => {
      const result = await client.listTools();
      for (const tool of result.tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.description).toBeTruthy();
      }
    });
  });

  describe("tools/call: ping", () => {
    it("returns a pong-shaped text content", async () => {
      const result = await client.callTool({ name: "ping", arguments: {} });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].type).toBe("text");
      expect(content[0].text.toLowerCase()).toContain("pong");
    });
  });

  describe("tools/call: list_tables against founding-story fixture", () => {
    it("discovers users and orders over the real wire format", async () => {
      const result = await client.callTool({
        name: "list_tables",
        arguments: { rootDir: FIXTURE },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      const text = content[0].text;
      expect(text).toContain("users");
      expect(text).toContain("orders");
    }, 15_000);
  });

  describe("tools/call: check_impact for users.email rename", () => {
    let impactText: string;

    beforeAll(async () => {
      const result = await client.callTool({
        name: "check_impact",
        arguments: {
          table: "users",
          column: "email",
          changeType: "rename",
          newName: "user_email",
          rootDir: FIXTURE,
        },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      impactText = content[0].text;
    }, 15_000);

    it("reports the Jupyter notebook over the wire", () => {
      expect(impactText).toContain(".ipynb");
    });

    it("reports the PySpark training job over the wire", () => {
      expect(impactText).toContain("ml_training.py");
    });

    it("reports the pandas ETL over the wire", () => {
      expect(impactText).toContain("etl_pipeline.py");
    });

    it("reports the TypeScript API over the wire", () => {
      expect(impactText).toContain("users.ts");
    });

    it("does NOT mention scope_collision.py (zero-noise filter survives the wire)", () => {
      expect(impactText).not.toContain("scope_collision");
    });

    it("includes a suggested fix mentioning the new column name", () => {
      expect(impactText).toContain("user_email");
    });
  });

  describe("tools/call: get_sample_project (npx onboarding path)", () => {
    it("returns a sample path inside the package, not the user's cwd", async () => {
      const result = await client.callTool({
        name: "get_sample_project",
        arguments: {},
      });
      const content = result.content as Array<{ type: string; text: string }>;
      const text = content[0].text;
      // The path must end in `samples/jaffle-shop-lite` — the bundled sample
      // inside the installed package — regardless of where the repo lives
      // on disk (`/Users/...` on macOS, `/app/...` in Docker, etc.).
      expect(text).toMatch(/samples\/jaffle-shop-lite/);
      // And it should NOT be relative to the test runner's cwd, since under
      // npx that cwd would be the user's project, not the package root.
      const sampleLine = text.split("\n").find((l) => l.includes("Sample project path:"));
      expect(sampleLine).toBeDefined();
      const absolutePath = sampleLine!.replace(/.*Sample project path:\s*/, "").trim();
      expect(absolutePath.startsWith("/")).toBe(true);
    });
  });

  describe("tools/call: error handling", () => {
    it("returns isError for an unknown tool", async () => {
      const result = await client.callTool({
        name: "this_tool_does_not_exist",
        arguments: {},
      });
      expect(result.isError).toBe(true);
    });

    it("returns isError when required args are missing", async () => {
      const result = await client.callTool({
        name: "check_impact",
        arguments: { rootDir: FIXTURE },
      });
      expect(result.isError).toBe(true);
    });
  });
});
