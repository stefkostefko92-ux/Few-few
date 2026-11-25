# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/carbonstealth.conf /etc/nginx/conf.d/carbonstealth.conf
COPY --from=builder /app/dist /var/www/carbonstealth.eu/dist
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
