import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";

export default tseslint.config(
  // 1. Tell ESLint to globaly ignore your Next.js build output
  {
    ignores: [".next/**", "node_modules/**", "build/**"]
  },
  
  // 2. Base JS Configuration & Globals
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.node, // Added Node for Next.js server-side files
      },
    },
  },
  
  // 3. TypeScript Configurations (Handles types in .ts and .tsx)
  ...tseslint.configs.recommended,
  
  // 4. React Configuration
  {
    files: ["**/*.{jsx,tsx}"],
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: globals.browser,
    },
    settings: {
      react: {
        version: "detect", // Automatically detects React 18 from package.json
      },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-empty": "off"
    },
  }
);