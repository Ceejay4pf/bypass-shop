/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  // Dark mode follows the "dark" class that src/lib/theme.js puts on <html>.
  // Most dark colours come from the overrides in src/index.css; this switch
  // lets any screen that needs a different shade say so with dark:...
  darkMode: "class",
  theme: { extend: {} },
  plugins: [],
};
