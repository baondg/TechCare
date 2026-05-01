import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "src/pages");
const outRoot = path.resolve(process.cwd(), "src/test/pages");

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

function toUnix(p) {
  return p.split(path.sep).join("/");
}

function buildContent(pageRelPath) {
  const pageName = pageRelPath.replace(/\.tsx$/, "");
  const title = pageName.replace(/\//g, " > ");

  return `import { describe, it } from "vitest";

/**
 * Auto-generated scaffold for: src/pages/${toUnix(pageRelPath)}
 *
 * Keep these tests aligned with implemented behavior.
 * - Use \`it.fails\` for requirements not implemented yet.
 * - Convert to \`it\` (passing) once feature is ready.
 */
describe("Page test plan: ${title}", () => {
  describe("a) Input Field", () => {
    it.fails("validates required vs optional fields", () => {
      // TODO: render page and assert required/optional constraints.
      throw new Error("TODO");
    });

    it.fails("rejects invalid characters in numeric inputs", () => {
      // TODO: assert filter/pattern/error for numeric-only fields.
      throw new Error("TODO");
    });

    it.fails("shows proper validation messages", () => {
      // TODO: trigger invalid input and assert message content.
      throw new Error("TODO");
    });
  });

  describe("b) Combobox", () => {
    it.fails("binds selected value to state/data model", () => {
      // TODO: select option and verify bound value.
      throw new Error("TODO");
    });

    it.fails("handles selection behavior and display format", () => {
      // TODO: verify display text/placeholder/open-close behavior.
      throw new Error("TODO");
    });
  });

  describe("c) Button", () => {
    it.fails("triggers expected actions", () => {
      // TODO: click action button and assert side effects.
      throw new Error("TODO");
    });

    it.fails("respects enable/disable states", () => {
      // TODO: assert disabled before valid data and enabled after.
      throw new Error("TODO");
    });
  });

  describe("d) Table", () => {
    it.fails("renders rows and supports sorting/hide-show columns", () => {
      // TODO: verify table render and sorting/column behavior.
      throw new Error("TODO");
    });

    it.fails("supports pagination behavior", () => {
      // TODO: verify next/prev page and row count per page.
      throw new Error("TODO");
    });

    it.fails("supports searching on each column", () => {
      // TODO: type filter per column and assert narrowed rows.
      throw new Error("TODO");
    });
  });

  describe("e) Dialog", () => {
    it.fails("opens/closes correctly and shows expected message", () => {
      // TODO: open dialog, assert content, close and assert hidden.
      throw new Error("TODO");
    });
  });

  describe("f) Radio Button", () => {
    it.fails("allows only one selected option at a time", () => {
      // TODO: select option A then B and assert A is unselected.
      throw new Error("TODO");
    });
  });

  describe("g) Checkbox", () => {
    it.fails("supports multi-selection and state persistence", () => {
      // TODO: select multiple, trigger rerender/navigation, assert persisted state.
      throw new Error("TODO");
    });
  });

  describe("h) Tooltip", () => {
    it.fails("shows expected tooltip content", () => {
      // TODO: hover/focus target and verify tooltip text.
      throw new Error("TODO");
    });
  });

  describe("API and integration", () => {
    it.fails("handles success and error API responses correctly", () => {
      // TODO: mock service/API responses and assert UI state transitions.
      throw new Error("TODO");
    });
  });
});
`;
}

const pages = walk(root);
let created = 0;
for (const pageFile of pages) {
  const rel = path.relative(root, pageFile);
  const outFile = path.join(outRoot, rel.replace(/\.tsx$/, ".test.tsx"));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buildContent(rel), "utf8");
  created += 1;
}

console.log(`Generated ${created} test scaffold files in src/test/pages`);
