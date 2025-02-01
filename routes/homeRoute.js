const express = require('express');
const router = express.Router();
const path = require('path');

router.get('/',(req,res)=>{
    res.sendFile(path.join(__dirname,'../views/main-with-db.html'))
})

router.get('/browse',(req,res)=>{
    res.sendFile(path.join(__dirname,'../views/browser.html'))
})

router.get('/review',(req,res)=>{
    res.sendFile(path.join(__dirname,'../views/review.html'))
})

router.get('/stats',(req,res)=>{
    res.sendFile(path.join(__dirname,'../views/stats.html'))
})


function isAdmin(req, res, next){
    if(req.session && req.session.role === 'ADMIN'){
        return next();
    } else{
        res.redirect('/home')
    }
}

router.get('/admin-page', isAdmin, (req,res)=>{
    res.sendFile(path.join(__dirname,'../views/admin-page.html'))
})

module.exports = router;
