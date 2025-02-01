const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const AdmZip = require('adm-zip');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

const { 
    getUserDecksAndSettingsAndProgress,
    saveSettingsToDatabase,
    getAllUsersDeckAndTheirData,
    getAllDecks,
    createUser,
    saveDeck,
    insertFlashcards,
    getAllUsersAndTheirDecks,
    addUserToDeck,
    getAccessedCardsForCurrentUser,
    getDataForStats,
    getImage
} = require('../models/user')

// router.post('/save-deck-settings', async (req,res) =>{
//     await saveSettingsToDatabase(req, res);
// })

function isAdmin(req, res, next){
    if(req.session && req.session.role === 'ADMIN'){
        return next();
    } else{
        res.redirect('/home')
    }
}

router.post('/save-user',isAdmin,async(req,res)=>{
    try{
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await createUser(username,hashedPassword);
        res.json({ success: true, message: 'User created successfully '});
    } catch (error){
        console.error('Error creating user: ',error);
        if(error.message === 'Username already exists'){
            res.status(400).json({ success: false, error: 'Username already exists'});
        } else{
            res.status(500).json({ success: false, error: 'Failed to create user'});
        }
    }
});

router.get('/all-decks',isAdmin,async(req,res)=>{
    try{
        const data = await getAllDecks();
        res.json(data);
    } catch(error){
        res.status(500).json({ error: 'Failed to get decks'});
    }
});

router.post('/add-deck',isAdmin,async(req,res)=>{
    await saveDeck(req,res);
});

router.post('/add-cards',isAdmin,async(req,res) =>{
    const { deckId, flashcards } = req.body;
    try{
        await pool.query('BEGIN');
        for (const card of flashcards){
            await insertFlashcards(deckId,card.front, card.back);
        }
        await pool.query('COMMIT');
        res.json({ success: true, message: 'Flashcards added succesfully' });
    } catch (error){
        await pool.query('ROLLBACK');
        console.error('Error adding flashcards', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/add-user-to-deck', isAdmin, async (req, res) => {
    const { username, deckId } = req.body;
    if (!username || !deckId) {
        return res.status(400).json({ success: false, error: "Username and deckId are required" });
    }
    try {
        const userQuery = "SELECT user_id FROM users WHERE username = $1";
        const userResult = await pool.query(userQuery, [username]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        const userId = userResult.rows[0].user_id;
        const result = await addUserToDeck(userId, deckId);
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

router.post('/upload-images', upload.array('images'), isAdmin, async (req, res) => {
    const { category } = req.body;
    const files = req.files;
    if (!category || !files || files.length === 0) {
        return res.status(400).json({ success: false, error: 'Missing category or files' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const file of files) {
            const filePath = file.path;
            console.log(`Processing file: ${filePath}`);
            
            try {
                const fileData = await fs.readFile(filePath);
                const mimeType = file.mimetype;
                const fileName = file.originalname;
                const query = `
                INSERT INTO Images (image_data, mime_type, file_name, category)
                VALUES ($1, $2, $3, $4)
                RETURNING image_id
                `;
                const values = [fileData, mimeType, fileName, category];
                const result = await client.query(query, values);
                console.log(`Inserted image with id: ${result.rows[0].image_id}`);
                await fs.unlink(filePath);
            } catch (fileError) {
                console.error(`Error processing file ${filePath}:`, fileError);
                throw fileError;
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'Images uploaded successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error uploading images: ', error);
        res.status(500).json({ success: false, error: 'Failed to upload images' });
    } finally {
        client.release();
    }
});

router.get('/users-and-decks', isAdmin, async(req,res)=>{
    try{
        const data = await getAllUsersAndTheirDecks();
        res.json(data);
    } catch(error){
        res.status(500).json({ error: 'Failed to fetch user data'});
    }
})

router.post('/sync-progress', async (req, res) => {
    const { progress, newCardsShown } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const currentDate = new Date().toISOString().split('T')[0];
        for (const item of progress) {
            let { user_id, card_id, next_review, difficulty_level, last_reviewed, review_session_id } = item;
            const progressQuery = `
                UPDATE Progress
                SET next_review = $3,
                    difficulty_level = $4,
                    last_reviewed = $5,
                    review_session_id = $6
                WHERE user_id = $1 AND card_id = $2
            `;
            await client.query(progressQuery, [user_id, card_id, next_review, difficulty_level, last_reviewed, review_session_id]);
        }
        const cardNumberQuery = `
            INSERT INTO DailyCardCounts (user_id, date, new_cards_shown)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, date)
            DO UPDATE SET new_cards_shown = DailyCardCounts.new_cards_shown + $3
        `;
        await client.query(cardNumberQuery, [progress[0].user_id,currentDate,newCardsShown]);
        await client.query('COMMIT');
        res.header('Content-Type', 'application/json');
        res.json({ success: true, message: 'Syncing has succeeded' }); 
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error syncing progress:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

router.get('/decks-data', async(req,res) =>{
    try{
        const data = await getAllUsersDeckAndTheirData(req);
        res.json(data);
    } catch(error){
        res.status(500).json({ error: 'Failed to fetch user data'});
    }
});

router.get('/deck-settings-progress', async (req,res) =>{
    try{
        const userData = await getUserDecksAndSettingsAndProgress(req);
        res.json(userData);
    } catch(error){
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

router.get('/all-user-cards', async(req,res) =>{
    try{
        const data = await getAccessedCardsForCurrentUser(req);
        res.json(data);
    } catch(error){
        res.status(500).json({ error: 'Failed to fetch user data'});
    }
});

router.get('/data-for-stats', async(req,res) =>{
    try{
        const data = await getDataForStats(req);
        res.json(data);
    } catch(error){
        res.status(500).json({ error: 'Failed to fetch user data'});
    }
});

router.get('/image/:fileName', async(req, res)=>{
    try{
        const fileName = req.params.fileName;
        const data = await getImage(req,fileName);
        res.json(data);
    } catch(error){
        res.status(500).json({ error: 'Failed to fetch Image data'});
    }
});

module.exports = router;