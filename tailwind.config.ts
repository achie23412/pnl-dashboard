import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        lume: "#4E6AA7",
        blinky: "#5B9EC7",
        walsh: "#4CA082",
        carter: "#8B6BB0",
        susan: "#D47B6A",
        tiktok: "#E8456B",
        cogs: "#D4903A",
      },
    },
  },
  plugins: [],
}
export default config
