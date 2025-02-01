const { findByUsername } = require('../models/user');
const bcrypt = require('bcrypt');

const login = async (req,res) =>{
    const {username, password} = req.body;
    try{
        const user = await findByUsername(username);
        if(!user){
            return res.redirect('/login?error=1');
        }
        const isValidPassword = await bcrypt.compare(password, user.password);
        if(!isValidPassword){
            return res.redirect('/login?error=1');
        }
        req.session.userId = user.user_id;
        req.session.role = user.role;
        return res.redirect('/home');
    } catch(error){
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    login,
}