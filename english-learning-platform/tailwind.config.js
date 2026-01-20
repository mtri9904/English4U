/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0056D2', // Blue
          light: '#4285F4',
          dark: '#003C8F',
        },
        secondary: {
          DEFAULT: '#2E7D32', // Green
          light: '#60AD5E',
          dark: '#005005',
        },
        accent: {
          DEFAULT: '#F9A825', // Orange/Yellow
        },
        background: {
          DEFAULT: '#F8F9FA', // Off-white
          paper: '#FFFFFF',
        },
        text: {
          primary: '#212121',
          secondary: '#757575',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
