import mysql from 'mysql2';



const c = mysql.createConnection({
    host: "192.168.161.93",
    port: 33026,
    user: "this.user",
    password: "this.password"
})
c.ping()


c.end()


