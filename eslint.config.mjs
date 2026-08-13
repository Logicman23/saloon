import coreWebVitals from "eslint-config-next/core-web-vitals";

/** eslint-config-next v16 ships native flat config — no FlatCompat needed. */
export default [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "*.config.mjs"],
  },
  ...coreWebVitals,
];
