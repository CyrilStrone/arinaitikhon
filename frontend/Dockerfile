FROM nginx:1.27-alpine

ARG PUBLIC_SITE_URL=http://localhost

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css app.js robots.txt sitemap.xml /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets

RUN set -eu; \
    public_site_url="${PUBLIC_SITE_URL%/}"; \
    sed -i "s#__PUBLIC_SITE_URL__#${public_site_url}#g" \
      /usr/share/nginx/html/index.html \
      /usr/share/nginx/html/robots.txt \
      /usr/share/nginx/html/sitemap.xml
