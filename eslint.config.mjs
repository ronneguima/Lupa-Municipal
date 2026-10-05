import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // CLAUDE.md: o cliente com service role nunca pode chegar ao site.
  {
    files: ["app/**", "components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/supabase/admin", "@/lib/supabase/admin", "**/ingest/**", "@/ingest/**"],
              message:
                "O site só usa lib/supabase/publico. Service role é exclusivo da ingestão.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
