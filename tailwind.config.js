/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        paper: '#FAF9F6',
        ink: '#1C1917',
        accent: '#0D9488',
      },
    },
  },
  plugins: [],
};

