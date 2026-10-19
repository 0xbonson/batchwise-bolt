/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        parchment: 'var(--parchment)',
        slip: 'var(--slip)',
        ink: 'var(--ink)',
        crust: 'var(--crust)',
        teal: 'var(--teal)',
        tomato: 'var(--tomato)',
        flour: 'var(--flour)',
      },
      fontFamily: {
        display: ['Gloock', 'Georgia', 'serif'],
        ui: ['Instrument Sans', 'system-ui', 'sans-serif'],
        slip: ['Spline Sans Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};
