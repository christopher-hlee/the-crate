// Shares the web app's tokens (apps/web/src/app/globals.css) so both clients look alike.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "#121110",
        surface: "#1b1917",
        "surface-2": "#24211e",
        line: "#34302b",
        ink: "#f1ebe2",
        "ink-2": "#a89f93",
        accent: "#f97316",
        "accent-ink": "#1a0d03",
        warn: "#f0b04a",
      },
    },
  },
};
