FROM debian
WORKDIR /app
COPY mysqlping_server .
ENTRYPOINT ["/app/mysqlping_server"]