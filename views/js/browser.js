let db;
const dbName = "FlashcardsDB";
const dbVersion = 4;
let blobUrls = {};
let allUserCards = [];
let decks = [];
let images = [];
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
async function fetchAllUserCards() {
    try {
        const response = await fetch('/api/all-user-cards');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        allUserCards = await response.json();
    } catch (error) {
        console.error(error);
    }
}
async function getDecksFromIndexedDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['decks'], 'readonly');
        const objectStore = transaction.objectStore('decks');
        const request = objectStore.getAll();
        request.onsuccess = event => {
            decks = event.target.result;
            resolve(decks);
        };
        request.onerror = event => {
            reject(event.target.error);
        };
    });
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
                    reject(`Unable to create Blob for ${fileName}`);
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
                        throw new Error(response.status);
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
                    reject(error);
                }
            }
        };
        request.onerror = (event) => {
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
        lazyLoadImage(img).catch(error => console.error('Failed to lazy load image:', error));
    });
}
async function getImagesFromIndexedDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['images'], 'readonly');
        const objectStore = transaction.objectStore('images');
        const request = objectStore.getAll();
        request.onsuccess = event => {
            images = event.target.result;
            resolve(images);
        };
        request.onerror = event => {
            console.error('Error fetching images from IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}
async function fetchUserDecksAndItsData() {
    try {
        await openDatabase();
        await Promise.all([
            fetchAllUserCards(),
            getDecksFromIndexedDB(),
            getImagesFromIndexedDB()
        ]);
        propagateSelectWithDeckNames();
    } catch (error) {
        console.error(error);
    }
}
function propagateSelectWithDeckNames() {
    const select = document.getElementById("deck");
    select.innerHTML = '<option value="" disabled selected>&nbsp;</option>';
    decks.forEach(deck => {
        const option = document.createElement("option");
        option.value = deck.deck_id;
        option.text = deck.name;
        select.add(option);
    });
    select.addEventListener('change', handleDeckSelection);
}
function getCardsForCategoryAndSubcategories(categoryId) {
    const cardsInCategory = allUserCards.filter(card => card.deck_id === categoryId);
    const subcategories = decks.filter(deck => deck.parent_id === categoryId);           
    let allCards = [...cardsInCategory];
    subcategories.forEach(subcategory => {
        allCards = allCards.concat(getCardsForCategoryAndSubcategories(subcategory.deck_id));
    });
    return allCards;
}
function handleDeckSelection(event) {
    const selectedDeckId = parseInt(event.target.value);
    const cardsForDeck = getCardsForCategoryAndSubcategories(selectedDeckId);
    displayDeckInfo(cardsForDeck);
}
function displayDeckInfo(cards) {
    const deckInfoDiv = document.querySelector('.deck-info');
    deckInfoDiv.innerHTML = '';
    cards.forEach((card, index) => {
        const deckItem = document.createElement('div');
        deckItem.classList.add('deck-item');
        deckItem.innerHTML = `<span>${card.card_id}.</span> <span>${card.name}</span>`;
        deckItem.addEventListener('click', () => displayCard(card));
        deckInfoDiv.appendChild(deckItem);
    });
}
async function displayCard(card) {
    const cardFront = document.querySelector('.card-front .card-content');
    const cardBack = document.querySelector('.card-back .card-content');
    cardFront.innerHTML = await replaceImageSrc(card.front_content);
    cardBack.innerHTML = await replaceImageSrc(card.back_content);
    document.querySelector('.card-front').style.display = 'flex';
    document.querySelector('.card-back').style.display = 'flex';
    prepareImagesForLazyLoading();
    loadImages();
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
function checkBlobURLValidity(url) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('HEAD', url, true);
        xhr.onload = function() {
            if (this.status >= 200 && this.status < 300) {
                resolve(true);
            } else {
                resolve(false);
            }
        };
        xhr.onerror = function() {
            resolve(false);
        };
        xhr.send();
    });
}

async function replaceImageSrc(content) {
    content = content.replace(/^"|"$/g, '');
    content = content.replace(/=""([^"]+)"/g, '="$1"');
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const imgs = doc.getElementsByTagName('img');
    for (let img of imgs) {
        let fileName = img.getAttribute('src');
        if (fileName) {
            fileName = fileName.replace(/^["']|["']$/g, '').trim();
            if (fileName) {
                img.setAttribute('data-src', fileName);
                img.removeAttribute('src');
            }
        }
    }
    let resultHTML = doc.body.innerHTML;
    resultHTML = resultHTML.replace(/^"|"$/g, '');
    return resultHTML;
}

function cleanupBlobUrls() {
    Object.values(blobUrls).forEach(URL.revokeObjectURL);
    blobUrls = {};
}

document.addEventListener('DOMContentLoaded', async () => {
    await fetchUserDecksAndItsData();
    const toggleSelector = document.querySelector('.toggle-selector');
    const selector = document.querySelector('.selector');
    const cards = document.querySelector('.cards');
    toggleSelector.addEventListener('click', () => {
        selector.classList.toggle('active');
        if (selector.classList.contains('active')) {
            toggleSelector.textContent = 'Schowaj Kategorie';
            cards.style.display = 'none';
        } else {
            toggleSelector.textContent = 'Pokaż Kategorie';
            cards.style.display = 'flex';
        }
    });
});