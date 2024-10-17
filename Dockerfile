FROM denoland/deno:alpine-2.0.0
WORKDIR /app
COPY mysqlping_server.ts deno.json .
EXPOSE 3000
ENTRYPOINT ["deno", "run", "--allow-net", "--allow-read", "--config", "deno.json", "mysqlping_server.ts"]
