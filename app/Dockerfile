FROM node:20-slim
WORKDIR /code
ENV NODE_ENV=production
COPY package.json .env ./
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/boot.js"]
