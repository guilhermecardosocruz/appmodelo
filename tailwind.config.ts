import type { Config } from "tailwindcss";

const config: Config = {
  // Tailwind dark mode via classe "dark" no <html>
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
