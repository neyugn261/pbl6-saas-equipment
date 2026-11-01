#!/bin/sh
set -eu

attempt=0
until mc alias set demo http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then exit 1; fi
  sleep 2
done

mc mb --ignore-existing "demo/$MINIO_BUCKET"
mc anonymous set private "demo/$MINIO_BUCKET"
printf '<CORSConfiguration><CORSRule><AllowedOrigin>%s</AllowedOrigin><AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>300</MaxAgeSeconds></CORSRule></CORSConfiguration>' "$DEMO_PUBLIC_URL" |
  mc cors set "demo/$MINIO_BUCKET" -
