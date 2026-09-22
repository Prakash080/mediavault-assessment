/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f8fafc',
          subtle: '#f1f5f9',
        },
        border: {
          DEFAULT: '#e2e8f0',
          strong: '#cbd5e1',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.05)',
        panel: '0 8px 30px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
};