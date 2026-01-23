// app/frontend/next.config.js
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Указываем корневую папку проекта для Turbopack
  turbopack: {
    root: path.join(__dirname),
  },
  // Отключаем экспериментальные функции, если не используешь
  experimental: {
    // Если у тебя есть server components, оставь как есть
  },
};

module.exports = nextConfig;