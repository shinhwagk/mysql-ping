FROM denoland/deno:alpine-2.0.2
WORKDIR /app
COPY mysqlping_server.ts deno.json .
RUN deno install --config deno.json
EXPOSE 3000
ENTRYPOINT ["deno", "run", "--allow-net", "--allow-read", "--config", "deno.json", "mysqlping_server.ts"]
