FROM debian
WORKDIR /app
COPY mysqlping .
ENTRYPOINT ["/app/mysqlping"]