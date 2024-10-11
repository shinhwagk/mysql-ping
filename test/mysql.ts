import mysql, { type ConnectionOptions } from 'mysql2';

const access: ConnectionOptions = {
    host: "db2",
    port: 3306,
    user: 'root',

    password: 'root_password',
};

const conn = mysql.createConnection(access);

conn.query("show replica status", (_err, rows) => {
    console.log(_err)
    console.log(rows)
    conn.end(console.log)
})

