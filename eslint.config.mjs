export default [
  {
    files: [
      "packages/scout/**/*v02*.mjs",
      "packages/librarian/**/*v02*.mjs",
      "packages/pipeline/**/*v02*.mjs",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      complexity: ["error", { max: 12, variant: "classic" }],
      "max-depth": ["error", 3],
      "max-lines-per-function": ["error", {
        max: 80,
        skipBlankLines: true,
        skipComments: true,
      }],
    },
  },
];
