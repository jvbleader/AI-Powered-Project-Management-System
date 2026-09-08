FROM nginx:1.27-alpine

RUN rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /var/cache/nginx /var/log/nginx /var/www/certbot

COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/    /etc/nginx/conf.d/
COPY snippets/  /etc/nginx/snippets/

EXPOSE 80 443

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/nginx-health >/dev/null || exit 1
