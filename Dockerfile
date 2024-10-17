FROM denoland/deno:alpine-2.0.0
WORKDIR /app
COPY mysqlping_server.ts .
EXPOSE 3080
ENTRYPOINT ["deno", "run", "--allow-all", "mysqlping_server.ts"]
