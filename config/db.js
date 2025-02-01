const { Pool, types } = require('pg');

types.setTypeParser(1114, str => str);
types.setTypeParser(1184, str => str);

const pool = new Pool({
    user: 'postgres',
    host: './/',
    database: './/',
    password: './/',
    port: 5432,
});

module.exports = pool;