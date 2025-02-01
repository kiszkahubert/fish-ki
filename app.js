const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();

const authController = require('./routes/authRoute');
const homeController = require('./routes/homeRoute');
const databaseController = require('./routes/databaseRoute');
app.use(session({
    secret: 'key-to-change',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false}
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req,res,next) =>{
    if(req.path === '/login' || req.path === '/register'){
        return next();
    }
    if(req.session && req.session.userId){
        return next();
    } else {
        return res.redirect('/login')
    }
})

app.use('/login',authController);
app.use('/home',homeController);
app.use('/api',databaseController);

app.use((req,res) =>{
    res.redirect('/home')
})

app.listen(3000,()=>{
    console.log("Server starting at port 3000");
});