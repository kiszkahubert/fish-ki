const pool = require('../config/db')

const getLoggedUserId = async (req) =>{
    if(req.session && req.session.userId){
        return req.session.userId;
    }
    return null;
}

const getAllDecks = async() =>{
    const result = await pool.query('SELECT * FROM Decks');
    return result.rows;
}

const findByUsername = async(email) =>{
    try{
        const result = await pool.query('SELECT * FROM users WHERE username = $1',[email]);
        if(result.rows.length > 0){
            return result.rows[0];
        } else{
            return null;
        }
    } catch(err){
        console.error("Couldn't find such user",err);
    }
}

const getAccessedCardsForCurrentUser = async(req) =>{
    try{
        const userId = await getLoggedUserId(req);
        if (!userId) {
            throw new Error('User not logged in');
        }
        const query = `
            SELECT
                c.*,
                d.name
            FROM Cards c
            JOIN UserDecksAccessed uda ON uda.deck_id = c.deck_id
            JOIN decks d on d.deck_id = c.deck_id
            WHERE uda.user_id = $1;
        `
        const queryResult = await pool.query(query,[userId]);
        const result = queryResult.rows;
        return result;
    }catch(error){
        console.error('Error fetching user data:', error);
        throw error;
    }
}

const saveSettingsToDatabase = async(req,res) =>{
    try{
        const userId = await getLoggedUserId(req);
        if(!userId){
            throw new Error('User not logged in');
        }
        const { deckId, dailyCardLimit, dailyReviewLimit } = req.body;
        if(dailyCardLimit < 1 || dailyCardLimit > 1000 || dailyReviewLimit < 1 || dailyReviewLimit > 1000){
            console.error('Daily card limit and daily review limit should be less than 1000 and greater than 1')
        } else{
            const settingsQuery = `
                UPDATE settings
                SET daily_card_limit = $2,
                    daily_review_limit = $3
                WHERE deck_id = $1 AND user_id = $4;
            `
            await pool.query(settingsQuery, [deckId,dailyCardLimit,dailyReviewLimit,userId]);
        }
    } catch(error){
        console.error('Error saving deck settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
    
}

const getUserDecksAndSettingsAndProgress = async (req) => {
    try {
        const userId = await getLoggedUserId(req);
        if (!userId) {
            throw new Error('User not logged in');
        }
        const currentTimestamp = new Date();
        const currentDate = currentTimestamp.toISOString().split('T')[0];
        const decksQuery = `
            SELECT d.* 
            FROM Decks d
            JOIN UserDecksAccessed uda ON d.deck_id = uda.deck_id
            WHERE uda.user_id = $1
        `;
        const { rows: decks } = await pool.query(decksQuery, [userId]);
        const settingsQuery = `
            SELECT s.* 
            FROM Settings s
            JOIN Decks d ON s.deck_id = d.deck_id
            LEFT JOIN Decks child ON child.parent_id = d.deck_id
            WHERE s.user_id = $1 AND child.deck_id IS NULL
        `;
        const { rows: settings } = await pool.query(settingsQuery, [userId]);
        const cardsAndProgressResult = await getCardsAndProgress(userId, currentTimestamp, currentDate);
        const cards = cardsAndProgressResult.map(row => ({
            card_id: row.card_id,
            deck_id: row.deck_id,
            front_content: row.front_content,
            back_content: row.back_content,
            deck_name: row.deck_name
        }));
        const progress = cardsAndProgressResult.map(row => ({
            user_id: userId,
            card_id: row.card_id,
            next_review: row.next_review,
            difficulty_level: row.difficulty_level,
            last_reviewed: row.last_reviewed,
            review_session_id: row.review_session_id
        }));
        return { decks, settings, cards, progress };
    } catch (error) {
        console.error('Error fetching user data:', error);
        throw error;
    }
};


const getCardsAndProgress = async (userId, currentTimestamp) => {
    const cardsAndProgressQuery = `
        WITH UserCards AS (
            SELECT c.*, d.name AS deck_name, p.next_review, p.difficulty_level, p.last_reviewed, p.review_session_id
            FROM Cards c
            JOIN Decks d ON c.deck_id = d.deck_id
            JOIN UserDecksAccessed uda ON d.deck_id = uda.deck_id
            LEFT JOIN Progress p ON c.card_id = p.card_id AND p.user_id = $1
            WHERE uda.user_id = $1
        )
        SELECT *
        FROM UserCards
        WHERE 
            difficulty_level IS NULL
            OR (next_review IS NOT NULL AND last_reviewed IS NOT NULL AND
                ABS(EXTRACT(EPOCH FROM (next_review - last_reviewed)) / 3600) < 0.5)
            OR (next_review IS NOT NULL AND $2::timestamp >= next_review)
        ORDER BY deck_id, card_id
    `;
    
    const cardsAndProgressResult = await pool.query(cardsAndProgressQuery, [userId, currentTimestamp]);
    return cardsAndProgressResult.rows;
};

const getAllUsersDeckAndTheirData = async (req) => {
    try {
        const userId = await getLoggedUserId(req);
        if (!userId) {
            throw new Error('User not logged in');
        }
        const currentTimestamp = new Date();
        const currentDate = currentTimestamp.toISOString().split('T')[0];
        const decksQuery = `
            SELECT d.* 
            FROM Decks d
            JOIN UserDecksAccessed uda ON d.deck_id = uda.deck_id
            WHERE uda.user_id = $1
        `;
        const decksResult = await pool.query(decksQuery, [userId]);
        const settingsQuery = `
            SELECT s.* 
            FROM Settings s
            JOIN Decks d ON s.deck_id = d.deck_id
            LEFT JOIN Decks child ON child.parent_id = d.deck_id
            WHERE s.user_id = $1 AND child.deck_id IS NULL
        `;
        const settingsResult = await pool.query(settingsQuery, [userId]);
        const dailyCardCountsQuery = `
            SELECT new_cards_shown
            FROM DailyCardCounts
            WHERE user_id = $1 AND date = $2
        `;
        const dailyCardCountsResult = await pool.query(dailyCardCountsQuery, [userId, currentDate]);
        const dailyCardCounts = new Map(dailyCardCountsResult.rows.map(row => [row.deck_id, row.new_cards_shown]));
        const decks = decksResult.rows;
        const settings = settingsResult.rows;
        return {
            decks,
            settings,
            dailyCardCounts: Object.fromEntries(dailyCardCounts)
        };
    } catch (error) {
        console.error(error.message);
        throw error;
    }
};

const getAllUsersAndTheirDecks = async() =>{
    try{
        const usersAndDecksQuery = `
            SELECT 
                u.user_id,      
                u.username,
                uad.deck_id
            FROM users u
            LEFT JOIN userdecksaccessed uad
            ON uad.user_id = u.user_id
        `;
        const usersData = await pool.query(usersAndDecksQuery);
        const data = usersData.rows;
        return data;
    } catch(error){
        console.error(error)
        res.status(500).json({ success: false, error: error.message });
    }
}

const getImage = async(req,fileName) =>{
    try {
        const userId = await getLoggedUserId(req);
        if (!userId) {
            throw new Error('User not logged in');
        }
        const imageQuery = `
            SELECT i.*
            FROM (
                SELECT * 
                FROM Images 
                WHERE file_name = $1
            ) i
            JOIN Decks d ON i.category = d.name
            JOIN UserDecksAccessed uda ON d.deck_id = uda.deck_id
            WHERE uda.user_id = $2;
        `;
        const { rows } = await pool.query(imageQuery, [ fileName,userId ]);
        if (rows.length > 0) {
            const imageData = rows[0];
            const base64ImageData = imageData.image_data.toString('base64');
            const response = {
                image_id: imageData.image_id,
                image_data: base64ImageData,
                mime_type: imageData.mime_type,
                file_name: imageData.file_name,
                category: imageData.category
            }
            return response;
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error fetching image:', error);
    }
}

const addUserToDeck = async (userId, deckId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const addUserQuery = `
            INSERT INTO userdecksaccessed (user_id, deck_id) 
            VALUES ($1, $2)
            RETURNING *
        `;
        const addUserResult = await client.query(addUserQuery, [userId, deckId]);
        if (addUserResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: "User already has access to this deck" };
        }
        const getCardsQuery = `
            SELECT card_id FROM Cards WHERE deck_id = $1
        `;
        const cardsResult = await client.query(getCardsQuery, [deckId]);
        const currentTimestamp = new Date().toISOString();
        for (const card of cardsResult.rows) {
            const addProgressQuery = `
                INSERT INTO Progress (user_id, card_id, next_review, difficulty_level, last_reviewed, review_session_id)
                VALUES ($1, $2, $3, NULL, NULL, NULL)
            `;
            await client.query(addProgressQuery, [userId, card.card_id, currentTimestamp]);
        }
        const addSettingsQuery = `
            INSERT INTO Settings (deck_id, daily_card_limit, daily_review_limit, user_id)
            VALUES ($1, $2, $3, $4)
        `;
        await client.query(addSettingsQuery, [deckId, 20, 30, userId]);
        await client.query('COMMIT');
        return { success: true, message: "User added to deck, progress records and settings created successfully" };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in addUserToDeck:', error);
        if (error.code === '42P10') {
            return { 
                success: false, 
                error: "Database constraint error. Please ensure the Settings table has a unique constraint on (deck_id, user_id)." 
            };
        }
        
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
};

const getDataForStats = async(req) =>{
    try{
        const userId = await getLoggedUserId(req);
        if (!userId) {
            throw new Error('User not logged in');
        }
        const currentDate = new Date().toISOString().split('T')[0];
        const getCardCountQuery = `
            SELECT new_cards_shown FROM dailycardcounts
            WHERE user_id = $1 AND date = $2
        `
        const getCardCountResult = await pool.query(getCardCountQuery,[ userId, currentDate ]);
        const getCardsAndDifficultiesQuery = `
            SELECT DISTINCT
                pr.card_id,
                pr.difficulty_level,
                d.deck_id
            FROM Progress pr
            LEFT JOIN Cards ca ON pr.card_id = ca.card_id
            LEFT JOIN Decks d on ca.deck_id = d.deck_id
            WHERE user_id = $1
            ORDER BY card_id
        `;
        const getCardsAndDifficultiesResult = await pool.query(getCardsAndDifficultiesQuery,[ userId ]);
        const getDecksForUserQuery = `
            SELECT DISTINCT
                d.deck_id,
                d.name,
                d.parent_id
            FROM Decks d
            JOIN UserDecksAccessed uad ON d.deck_id = uad.deck_id
            WHERE user_id = $1
        `
        const getDecksForUserResult = await pool.query(getDecksForUserQuery, [ userId ]);

        const cardCount = getCardCountResult.rows;
        const cardsDifficulty = getCardsAndDifficultiesResult.rows;
        const usersDecks = getDecksForUserResult.rows;
        return {
            cardCount,
            cardsDifficulty,
            usersDecks
        };

    } catch(error){
        console.error('Error fetching user data:', error);
        throw error;
    }
}

const createUser = async (username, hashedPassword) =>{
    try{
        const query = 'INSERT INTO Users (username,password,role) VALUES ($1, $2, $3) RETURNING user_id';
        const result = await pool.query(query,[username,hashedPassword,'USER']);
        return result.rows[0].user_id;
    }catch(error){
        console.error('Error creating user: ',error);
        if(error.code = '23505'){
            throw new Error('Username already exists');
        }
        throw error;
    }
};

const saveDeck = async(req,res) =>{
    try{
        const { name, parent_id } = req.body;
        const saveQuery = `
            INSERT INTO Decks(name,parent_id) VALUES ($1, $2)
        `;
        await pool.query(saveQuery,[name,parent_id]);

    } catch(error){
        console.error(error)
        res.status(500).json({ success: false, error: error.message });
    }
}

const insertFlashcards = async(deckId,front,back) =>{
    try{
        const query = `
            INSERT INTO Cards(deck_id, front_content, back_content)
            VALUES ($1, $2, $3)
            RETURNING card_id;
        `;
        const result = await pool.query(query,[deckId,front,back]);
        return result.rows[0].card_id;
    } catch(error){
        console.error(error)
        res.status(500).json({ success: false, error: error.message });
    }
}


module.exports = {
    findByUsername,
    getUserDecksAndSettingsAndProgress,
    saveSettingsToDatabase,
    getAllUsersDeckAndTheirData,
    createUser,
    getAllDecks,
    saveDeck,
    insertFlashcards,
    getAllUsersAndTheirDecks,
    addUserToDeck,
    getAccessedCardsForCurrentUser,
    getDataForStats,
    getImage
}