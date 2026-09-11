import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          950: '#0a0a0f',
        },
      },
      typography: {
        invert: {
          css: {
            '--tw-prose-body': 'rgb(209 213 219)',
            '--tw-prose-headings': 'rgb(243 244 246)',
            '--tw-prose-links': 'rgb(96 165 250)',
            '--tw-prose-bold': 'rgb(243 244 246)',
            '--tw-prose-code': 'rgb(251 191 36)',
            '--tw-prose-pre-bg': 'rgb(31 41 55)',
          },
        },
      },
    },
  },
  plugins: [],
}

export default config
