const express = require('express');
const router = express.Router();
const path = require('path');
const { login } = require('../controllers/authController');
const { rmSync } = require('fs');

router.post('/',login);

router.get('/', (req,res)=>{
    res.sendFile(path.join(__dirname,'../views/login.html'))
});

module.exports = router;