let db;
const dbName = "FlashcardsDB";
const dbVersion = 4;
let cards = [];
let currentCard = null;
let deckId;
let settings;
let progress;
let userId;
let newCardsShown = 0;
let showAnswer = false;
let selectedInterval = null;
const cardFront = document.querySelector('.card-front');
const cardBack = document.querySelector('.card-back');
const firstStage = document.querySelector('.first-stage');
const secondStage = document.querySelector('.second-stage');
const showAnswerBtn = document.querySelector('.show-answer');
const difficultyBtns = document.querySelectorAll('.second-stage button');

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);
        request.onerror = event => reject("Database error: " + event.target.error);
        request.onsuccess = event => {
            db = event.target.result;
            resolve(db);
        };
    });
}
async function getUserIdFromProgress() {
    try {
        await openDatabase();
        const transaction = db.transaction(['progress'], 'readonly');
        const objectStore = transaction.objectStore('progress');
        const request = objectStore.openCursor();
        request.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                userId = cursor.value.user_id;
                return;
            } else {
                console.warn('No records found');
            }
        };
        request.onerror = event => {
            console.error(event.target.error);
        };
    } catch (error) {
        console.error(error);
    }
}

async function loadDeckData() {
    const urlParams = new URLSearchParams(window.location.search);
    deckId = urlParams.get('deck');
    userId = await getUserIdFromProgress();
    try {
        await openDatabase();
        settings = await getSettings(deckId);
        cards = await getCards(deckId);
        progress = await getProgress(userId, cards.map(c => c.card_id));
        await updateCardCounts();
        await showNextCard();
    } catch (error) {
        console.error(error);
    }
}

async function showNextCard() {
    newCardsShown = newCardsShown + 1;
    const now = new Date();
    const getMinutesDifference = (date1, date2) => {
        return Math.abs(date1 - date2) / (1000 * 60);
    };
    const isCardDue = (cardProgress) => {
        const nextReview = new Date(cardProgress.next_review);
        const lastReviewed = new Date(cardProgress.last_reviewed);
        const minutesSinceLastReview = getMinutesDifference(now, lastReviewed);
        return nextReview <= new Date(now.getTime() + 30 * 60 * 1000);
    };
    let dueCards = cards.filter(c => {
        let cardProgress = progress.find(p => p.card_id === c.card_id);
        return cardProgress && isCardDue(cardProgress);
    });
    dueCards.sort((a, b) => {
        let progressA = progress.find(p => p.card_id === a.card_id);
        let progressB = progress.find(p => p.card_id === b.card_id);
        return new Date(progressA.next_review) - new Date(progressB.next_review);
    });
    if (dueCards.length > 0) {
        currentCard = dueCards[0];
        let cardProgress = progress.find(p => p.card_id === currentCard.card_id);
        displayCard(currentCard);
        updateButtonIntervals(cardProgress);
        return;
    }
    let newCards = cards.filter(c => 
        !progress.some(p => p.card_id === c.card_id) || 
        progress.some(p => p.card_id === c.card_id && p.difficulty_level === null && p.last_reviewed === null)
    );
    if (newCards.length > 0) {
        currentCard = newCards[0];
        displayCard(currentCard);
        updateButtonIntervals(null);
        return;
    }
    cardFront.innerHTML = '<div class="no-cards-message">Wszystkie karty na dziś zostały przejrzane</div>';
    cardBack.innerHTML = '';
    cardBack.style.display = 'none';
    firstStage.style.display = 'none';
    secondStage.style.display = 'none';
}

function isReviewingCard(card) {
    const cardProgress = progress.find(p => p.card_id === card.card_id);
    if (!cardProgress) return false;
    const now = new Date();
    const timeDiff = now - new Date(cardProgress.last_reviewed);
    return timeDiff >= 12 * 60 * 60 * 1000;
}

function updateButtonIntervals(cardProgress) {
    let intervals;
    if (!cardProgress || !cardProgress.last_reviewed) {
        intervals = [1, 6, 10, 5760];
    } else {
        const now = new Date();
        const lastReviewed = new Date(cardProgress.last_reviewed);
        const nextReview = new Date(cardProgress.next_review);
        const diffMinutes = Math.abs(nextReview - lastReviewed) / (1000 * 60);
        if (diffMinutes < 6) {
            intervals = [1, 6, 10, 5760];
        } else if (diffMinutes < 10) {
            intervals = [1, 10, 15, 1440];
        } else if (diffMinutes < 15) {
            intervals = [1, 10, 1440, 5760];
        } else if (diffMinutes < 1440) {
            intervals = [1, 15, 5760, 8640];
        } else if (diffMinutes < 5760) {
            intervals = [1, 1440, 5760, 8640];
        } else if (diffMinutes < 8640) {
            intervals = [1, 1440, 5760, 11520];
        } else if (diffMinutes < 11520) {
            intervals = [1, 5760, 8640, 11520];
        } else {
            intervals = [1, 8640, 11520, 43200];
        }
    }
    difficultyBtns.forEach((btn, index) => {
        btn.setAttribute('data-interval', intervals[index]);
        btn.previousElementSibling.textContent = formatInterval(intervals[index]);
    });
}
function formatInterval(minutes) {
    if (minutes < 60) return `<${minutes}min`;
    if (minutes < 1440) return `${minutes / 60}h`;
    return `${minutes / 1440}d`;
}
function getSettings(deckId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["settings"], "readonly");
        const objectStore = transaction.objectStore("settings");
        const request = objectStore.get(parseInt(deckId));
        request.onsuccess = event => resolve(event.target.result);
        request.onerror = event => reject("Error loading settings: " + event.target.error);
    });
}
function getProgress(userId, cardIds) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["progress"], "readonly");
        const objectStore = transaction.objectStore("progress");
        const progressData = [];
        const processNextCard = (index) => {
            if (index >= cardIds.length) {
                resolve(progressData);
                return;
            }
            const request = objectStore.get([userId, cardIds[index]]);
            request.onsuccess = event => {
                const result = event.target.result;
                if (result) {
                    progressData.push(result);
                } 
                processNextCard(index + 1);
            };
            request.onerror = event => reject("Error loading progress: " + event.target.error);
            };
            processNextCard(0);
        });
}

async function getCards(deckId) {
    const allCards = [];
    async function fetchCardsForDeck(dId) {
        const transaction = db.transaction(["cards", "decks"], "readonly");
        const cardStore = transaction.objectStore("cards");
        const deckStore = transaction.objectStore("decks");
        const cardsRequest = cardStore.index("deck_id").getAll(parseInt(dId));
        const cards = await new Promise((resolve, reject) => {
            cardsRequest.onsuccess = () => resolve(cardsRequest.result);
            cardsRequest.onerror = () => reject(cardsRequest.error);
        });
        allCards.push(...cards);
        const subdecksRequest = deckStore.index("parent_id").getAll(parseInt(dId));
        const subdecks = await new Promise((resolve, reject) => {
            subdecksRequest.onsuccess = () => resolve(subdecksRequest.result);
            subdecksRequest.onerror = () => reject(subdecksRequest.error);
        });
        for (const subdeck of subdecks) {
            await fetchCardsForDeck(subdeck.deck_id);
        }
    }
    await fetchCardsForDeck(deckId);
    return allCards;
}

async function updateCardCounts() {
    const now = new Date();
    const transaction = db.transaction(['cards', 'progress', 'decks'], 'readonly');
    const cardStore = transaction.objectStore('cards');
    const progressStore = transaction.objectStore('progress');
    const deckStore = transaction.objectStore('decks');
    const cards = await new Promise((resolve, reject) => {
        const request = cardStore.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    const progress = await new Promise((resolve, reject) => {
        const request = progressStore.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    const decks = await new Promise((resolve, reject) => {
        const request = deckStore.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    const deckCounts = new Map(decks.map(deck => [deck.deck_id, { newCards: 0, learningCards: 0, reviewingCards: 0 }]));
    cards.forEach(card => {
        const cardProgress = progress.find(p => p.card_id === card.card_id);
        const deckCount = deckCounts.get(card.deck_id);
        if (!deckCount) return;
        if (!cardProgress || cardProgress.difficulty_level === null) {
            deckCount.newCards++;
        } else {
            const lastReviewed = new Date(cardProgress.last_reviewed);
            const nextReview = new Date(cardProgress.next_review);
            const timeDiff = Math.abs(nextReview - lastReviewed);
            if (nextReview <= now) {
                if (timeDiff >= 12 * 60 * 60 * 1000) {
                    deckCount.reviewingCards++;
                } else {
                    deckCount.learningCards++;
                }
            } else if (nextReview <= new Date(now.getTime() + 30 * 60 * 1000)) {
                deckCount.learningCards++;
            }
        }
    });
    function getCumulativeCounts(deckId) {
        const counts = deckCounts.get(deckId) || { newCards: 0, learningCards: 0, reviewingCards: 0 };
        const subdecks = decks.filter(d => d.parent_id === deckId);
        subdecks.forEach(subdeck => {
            const subCounts = getCumulativeCounts(subdeck.deck_id);
            counts.newCards += subCounts.newCards;
            counts.learningCards += subCounts.learningCards;
            counts.reviewingCards += subCounts.reviewingCards;
        });
        
        return counts;
    }
    const currentDeckId = parseInt(deckId);
    const currentDeck = decks.find(d => d.deck_id === currentDeckId);
    if (currentDeck) {
        const counts = getCumulativeCounts(currentDeckId);
        document.getElementById('newCards').textContent = counts.newCards;
        document.getElementById('learningCards').textContent = counts.learningCards;
        document.getElementById('reviewingCards').textContent = counts.reviewingCards;
    }
}
function parseContent(content) {
    return content.replace(/^"|"$/g, '').replace(/""/g, '"');
}
function prepareImagesForLazyLoading() {
    const images = document.querySelectorAll('img');
    images.forEach((img) => {
        if (img.getAttribute('src') && !img.getAttribute('data-src')) {
            img.setAttribute('data-src', img.getAttribute('src'));
            img.removeAttribute('src');
        }
    });
}
function displayCard(card) {
    cardFront.innerHTML = wrapImagesInContainer(parseContent(card.front_content));
    cardBack.innerHTML = wrapImagesInContainer(parseContent(card.back_content));
    cardBack.style.display = 'none';
    firstStage.style.display = 'block';
    secondStage.style.display = 'none';
    prepareImagesForLazyLoading();
    loadImages();
}
function wrapImagesInContainer(content) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const images = doc.querySelectorAll('img');
    if (images.length > 0) {
        const container = document.createElement('div');
        container.className = 'image-container';
        images.forEach(img => {
            container.appendChild(img);
        });
        doc.body.insertBefore(container, doc.body.firstChild);
    }
    return doc.body.innerHTML;
}
async function lazyLoadImage(img) {
    const fileName = img.getAttribute('src');
    const transaction = db.transaction(["images"], "readonly");
    const objectStore = transaction.objectStore("images");
    const request = objectStore.index("file_name").get(fileName);
    return new Promise((resolve, reject) => {
        request.onsuccess = async (event) => {
            const imageData = event.target.result;
            if (imageData && imageData.image_data) {
                let blob;
                if (imageData.image_data instanceof Blob) {
                    blob = imageData.image_data;
                } else if (imageData.image_data instanceof ArrayBuffer) {
                    blob = new Blob([imageData.image_data], { type: imageData.mime_type });
                } else if (imageData.image_data.data) {
                    blob = new Blob([new Uint8Array(imageData.image_data.data)], { type: imageData.mime_type });
                } else {
                    return;
                }
                const blobUrl = URL.createObjectURL(blob);
                img.onload = () => URL.revokeObjectURL(blobUrl);
                img.src = blobUrl;
                resolve();
            } else {
                try {
                    const response = await fetch(`/api/image/${encodeURIComponent(fileName)}`);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const imageJson = await response.json();
                    const byteCharacters = atob(imageJson.image_data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: imageJson.mime_type });
                    const imageObject = {
                        image_id: imageJson.image_id,
                        file_name: imageJson.file_name,
                        image_data: blob,
                        mime_type: imageJson.mime_type,
                        category: imageJson.category
                    };        
                    const saveTransaction = db.transaction(["images"], "readwrite");
                    const saveObjectStore = saveTransaction.objectStore("images");
                    await new Promise((resolve, reject) => {
                        const saveRequest = saveObjectStore.add(imageObject);
                        saveRequest.onsuccess = resolve;
                        saveRequest.onerror = reject;
                    });
                    const blobUrl = URL.createObjectURL(blob);
                    img.onload = () => URL.revokeObjectURL(blobUrl);
                    img.src = blobUrl;
                    resolve();
                } catch (error) {
                    console.error(`Error fetching image ${fileName}:`, error);
                    reject(error);
                }
            }
        };
        request.onerror = (event) => {
            console.error(`Error loading image ${fileName}:`, event.target.error);
            reject(event.target.error);
        };
    });
}
function loadImages() {
    const images = document.querySelectorAll('img');
    images.forEach((img) => {
        if (img.getAttribute('data-src')) {
            img.setAttribute('src', img.getAttribute('data-src'));
            img.removeAttribute('data-src');
        }
        lazyLoadImage(img).catch(error => console.error(error));
    });
}
function toUTCString(date) {
    return date.toISOString();
}
async function updateCardProgress(card, interval) {
    const now = new Date();
    let nextReview = new Date(now.getTime() + interval * 60000);
    let cardProgress = progress.find(p => p.card_id === card.card_id);
    let updatedProgress;
    if (cardProgress) {
        updatedProgress = {
            ...cardProgress,
            last_reviewed: toUTCString(now),
            next_review: toUTCString(nextReview),
            difficulty_level: interval
        };
    } else {
        updatedProgress = {
            user_id: userId,
            card_id: card.card_id,
            last_reviewed: toUTCString(now),
            next_review: toUTCString(nextReview),
            difficulty_level: interval,
            review_session_id: null
        };
        progress.push(updatedProgress);
    }
    const transaction = db.transaction(["progress", "syncQueue"], "readwrite");
    const progressStore = transaction.objectStore("progress");
    const syncQueueStore = transaction.objectStore("syncQueue");
    return new Promise((resolve, reject) => {
        const progressRequest = progressStore.put(updatedProgress);
        progressRequest.onsuccess = () => {
            const syncQueueRequest = syncQueueStore.add({ card_id: card.card_id });
            syncQueueRequest.onsuccess = () => {
                const index = progress.findIndex(p => p.card_id === card.card_id);
                if (index !== -1) {
                    progress[index] = updatedProgress;
                } else {
                    progress.push(updatedProgress);
                }
                updateCardCounts();
                resolve();
            };
            syncQueueRequest.onerror = event => reject(event.target.error);
        };
        progressRequest.onerror = event => reject(event.target.error);
    });
}
function syncProgress() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['progress', 'syncQueue'], 'readwrite');
        const progressStore = transaction.objectStore('progress');
        const syncQueueStore = transaction.objectStore('syncQueue');
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
        const countRequest = syncQueueStore.count();
        countRequest.onsuccess = function() {
            if (countRequest.result === 0) {
                resolve();
                return;
            }
            const syncQueueRequest = syncQueueStore.getAll();
            syncQueueRequest.onsuccess = function(event) {
                const cardIdsToSync = event.target.result.map(item => item.card_id);
                const progressRequest = progressStore.getAll();
                progressRequest.onsuccess = function(event) {
                    const allProgress = event.target.result;
                    const progressToSync = allProgress.filter(item => cardIdsToSync.includes(item.card_id));
                    const progressData = progressToSync.map(item => ({
                        ...item,
                        last_reviewed: item.last_reviewed,
                        next_review: item.next_review
                    }));
                    fetch('/api/sync-progress', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ 
                            progress: progressData,
                            newCardsShown: newCardsShown
                        }),
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            const clearTransaction = db.transaction(['syncQueue'], 'readwrite');
                            const clearSyncQueueStore = clearTransaction.objectStore('syncQueue');
                            clearSyncQueueStore.clear().onsuccess = () => {
                                newCardsShown = 0;
                            };
                            clearTransaction.onerror = (event) => {
                                console.error(event.target.error);
                            };
                        } else {
                            console.error(data.error);
                        }
                    })
                    .catch(error => {
                        console.error(error);
                    });
                };
            };
        };
    });
}
setInterval(syncProgress, 5000);
window.addEventListener('beforeunload', syncProgress);
showAnswerBtn.addEventListener('click', () => {
    cardBack.style.display = 'flex';
    firstStage.style.display = 'none';
    secondStage.style.display = 'flex';
});
difficultyBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
        const interval = parseInt(btn.getAttribute('data-interval'));
        await updateCardProgress(currentCard, interval);
        await updateCardCounts();
        await showNextCard();
    });
});
document.addEventListener('DOMContentLoaded', loadDeckData);