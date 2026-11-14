/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        serif: ['DM Sans', 'sans-serif'],
        mono: ['DM Sans', 'sans-serif'],
      },
      colors: {
        paper: '#FAF9F6',
        ink: '#1C1917',
        accent: '#0D9488',
      },
    },
  },
  plugins: [],
};

