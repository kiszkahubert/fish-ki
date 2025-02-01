const dbName = 'FlashcardsDB';
const dbVersion = 4;
let db;
let settingsVisible = false;
let currentDeckId = null;
let fetchedData = null;

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);
        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject(event.target.error);
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains('cards')) {
                const cardsStore = db.createObjectStore('cards', { keyPath: 'card_id' });
                cardsStore.createIndex('deck_id', 'deck_id', { unique: false });
            }
            if (!db.objectStoreNames.contains('images')) {
                const imageStore = db.createObjectStore('images', { keyPath: 'image_id' });
                imageStore.createIndex('file_name', 'file_name', { unique: false });
            }
            if (!db.objectStoreNames.contains('decks')) {
                const decksStore = db.createObjectStore('decks', { keyPath: 'deck_id' });
                decksStore.createIndex('parent_id', 'parent_id', { unique: false });
            }
            if (!db.objectStoreNames.contains('progress')) {
                const progressStore = db.createObjectStore('progress', { keyPath: ['user_id', 'card_id'] });
                progressStore.createIndex('card_id', 'card_id', { unique: false });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'setting_id' });
            }
            if (!db.objectStoreNames.contains('syncQueue')) {
                db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}
function saveDataToIndexedDB(data) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error("Database not initialized."));
            return;
        }
        const transaction = db.transaction(['cards', 'decks', 'progress', 'settings'], 'readwrite');
        const cardStore = transaction.objectStore('cards');
        const deckStore = transaction.objectStore('decks');
        const progressStore = transaction.objectStore('progress');
        const settingsStore = transaction.objectStore('settings');
        if (data.cards) {
            data.cards.forEach(card => cardStore.put(card));
        }
        if (data.decks) {
            data.decks.forEach(deck => deckStore.put(deck));
        }
        if (data.progress) {
            data.progress.forEach(progress => progressStore.put(progress));
        }
        if (data.settings) {
            data.settings.forEach(setting => settingsStore.put(setting));
        }
        transaction.oncomplete = () => {
            resolve();
        };
        transaction.onerror = (event) => {
            console.error('Transaction error:', event.target.error);
            reject(event.target.error);
        };
    });
}
function initializeDatabase() {
    return openDatabase()
        .catch(error => {
            console.error('Error initializing database:', error);
            throw error;
        });
}
function fetchAndSaveData() {
    return Promise.all([
        fetch('/api/deck-settings-progress').then(response => response.json()),
        fetch('/api/decks-data').then(response => response.json())
    ])
    .then(([deckSettingsProgressData, decksData]) => {
        fetchedData = {
            ...deckSettingsProgressData,
            ...decksData
        };
        return saveDataToIndexedDB(fetchedData);
    })
    .catch(error => {
        console.error(error);
        throw error;
    });
}

function calculateStatsRecursive(deck, settings, progress, deckMap) {
    const deckProgress = progress.filter(p => p.card_id && fetchedData.cards.find(c => c.card_id === p.card_id && c.deck_id === deck.deck_id));
    let newCards = 0;
    let learningCards = 0;
    let reviewingCards = 0;
    deckProgress.forEach(p => {
        if (p.difficulty_level === null) {
            newCards++;
        } else {
            const lastReviewed = new Date(p.last_reviewed);
            const nextReview = new Date(p.next_review);
            const timeDiff = Math.abs(nextReview - lastReviewed);
            const minutesDiff = timeDiff / (1000 * 60);
            if (minutesDiff < 30) {
                learningCards++;
            } else if (timeDiff >= 12 * 60 * 60 * 1000) {
                reviewingCards++;
            }
        }
    });
    const childDecks = deckMap.get(deck.deck_id) || [];
    for (const childDeck of childDecks) {
        const childStats = calculateStatsRecursive(childDeck, settings, progress, deckMap);
        newCards += childStats.newCards;
        learningCards += childStats.learningCards;
        reviewingCards += childStats.reviewingCards;
    }
    return { newCards, learningCards, reviewingCards };
}
function calculateStats(deck, settings, progress, deckMap) {
    return calculateStatsRecursive(deck, settings, progress, deckMap);
}
function createDeckElement(deck, stats, level = 0) {
    const row = document.createElement('div');
    row.className = 'row';
    const settingsButtonVisibility = 'hidden';
    row.innerHTML = `
        <div class="category-name">
            <div class="category-label">
                ${deck.children && deck.children.length > 0 ? '<span class="caret"></span>' : '<span class="caret-placeholder"></span>'}
                <a href="#" class="deck-link" data-deck-id="${deck.deck_id}">${deck.name}</a>
                <span class="info-icon" onclick="showTooltip(event, ${stats.newCards}, ${stats.learningCards}, ${stats.reviewingCards})">ℹ️</span>
            </div>
        </div>
        <span class="data-column">${stats.newCards}</span>
        <span class="data-column">${stats.learningCards}</span>
        <span class="data-column">${stats.reviewingCards}</span>
        <div class="settings-column">
            <button class="deck-settings" onclick="showSettings(${deck.deck_id})" style="visibility: ${settingsButtonVisibility};">⚙️</button>
        </div>
    `;
    if (level > 0) {
        row.querySelector('.category-label').style.paddingLeft = `${level * 20}px`;
    }
    return row;
}
function showTooltip(event, newCards, learningCards, reviewingCards) {
    event.stopPropagation();
    const existingTooltip = document.querySelector('.tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.innerHTML = `
        Nowe: ${newCards}<br>
        Uczone: ${learningCards}<br>
        Oczekujące: ${reviewingCards}
    `;
    const rect = event.target.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const tooltipWidth = 200;
    if (rect.left + tooltipWidth > viewportWidth) {
        tooltip.style.right = `${viewportWidth - rect.left}px`;
    } else {
        tooltip.style.left = `${rect.right}px`;
    }
    tooltip.style.top = `${rect.top + window.scrollY}px`;
    document.body.appendChild(tooltip);
    tooltip.style.display = 'block';
    setTimeout(() => {
        tooltip.style.display = 'none';
        setTimeout(() => tooltip.remove(), 300);
    }, 2000);
    document.addEventListener('click', function hideTooltip(e) {
        if (!tooltip.contains(e.target) && e.target !== event.target) {
            tooltip.style.display = 'none';
            setTimeout(() => tooltip.remove(), 300);
            document.removeEventListener('click', hideTooltip);
        }
    });
}
function buildDeckHierarchy(decks) {
    const deckMap = new Map();
    const rootDecks = [];    
    decks.forEach(deck => {
        if (!deckMap.has(deck.parent_id)) {
            deckMap.set(deck.parent_id, []);
        }
        deckMap.get(deck.parent_id).push(deck);
    });
    decks.forEach(deck => {
        deck.children = deckMap.get(deck.deck_id) || [];
        if (deck.parent_id === null) {
            rootDecks.push(deck);
        }
    });
    return { rootDecks, deckMap };
}
function renderDecks(decks, settings, progress, parentElement, level = 0, deckMap) {
    decks.forEach(deck => {
        const stats = calculateStats(deck, settings, progress, deckMap);
        const deckElement = createDeckElement(deck, stats, level);
        parentElement.appendChild(deckElement);
        if (deck.children && deck.children.length > 0) {
            const nestedElement = document.createElement('div');
            nestedElement.className = 'nested';
            renderDecks(deck.children, settings, progress, nestedElement, level + 1, deckMap);
            parentElement.appendChild(nestedElement);
        }
    });
}
function initializeTogglers() {
    const togglers = document.getElementsByClassName("caret");
    for (let i = 0; i < togglers.length; i++) {
        togglers[i].addEventListener("click", function() {
            this.classList.toggle("caret-down");
            let nestedList = this.closest('.row').nextElementSibling;
            if (nestedList && nestedList.classList.contains('nested')) {
                nestedList.classList.toggle("active");
            }
        });
    }
}
function showSettings(deckId) {
    currentDeckId = deckId;
    const container = document.querySelector('.container');
    const settingsBar = document.querySelector('.settings-bar');
    if (!settingsVisible) {
        container.classList.add('collapsed');
        settingsBar.classList.add('visible');
        const deckSettings = fetchedData.settings.find(s => s.deck_id === deckId);
        if (deckSettings) {
            document.getElementById('dailyCardLimit').value = deckSettings.daily_card_limit;
            document.getElementById('dailyReviewLimit').value = deckSettings.daily_review_limit;
        }
    } else {
        container.classList.remove('collapsed');
        settingsBar.classList.remove('visible');
    }
    settingsVisible = !settingsVisible;
}
function handleDeckSelection(event) {
    if (event.target.classList.contains('deck-link')) {
        event.preventDefault();
        const deckId = event.target.getAttribute('data-deck-id');
        window.location.href = `/home/review?deck=${deckId}`;
    }
}
document.querySelector('.save-settings').addEventListener('click', function(e) {
    e.preventDefault();
    const dailyCardLimit = document.getElementById('dailyCardLimit').value;
    const dailyReviewLimit = document.getElementById('dailyReviewLimit').value;
    fetch('/api/save-deck-settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            deckId: currentDeckId,
            dailyCardLimit: dailyCardLimit,
            dailyReviewLimit: dailyReviewLimit
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const saveMessage = document.getElementById('saveMessage');
            saveMessage.classList.add('visible');
            setTimeout(() => {
                saveMessage.classList.remove('visible')
            }, 3000)
            showSettings();
        } else {
            console.error("Failed to save settings");
        }
    })
    .catch(error => {
        console.error(error);
    })
});
initializeDatabase()
.then(() => fetchAndSaveData())
.then(() => {
    const decksContainer = document.getElementById('decks');
    const { rootDecks, deckMap } = buildDeckHierarchy(fetchedData.decks);
    renderDecks(rootDecks, fetchedData.settings, fetchedData.progress, decksContainer, 0, deckMap);
    initializeTogglers();
})
.catch(error => {
    console.error('Error during initialization:', error);
});

document.addEventListener('click', handleDeckSelection);