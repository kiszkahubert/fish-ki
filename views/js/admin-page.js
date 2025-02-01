let allDecks = [];
let usersAndDecks = [];

async function createNewUser(event){
    event.preventDefault();
    const username = document.getElementById('username').value; 
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    try {
        const response = await fetch('/api/save-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                password: password
            }),
        });
        const data = await response.json();
        if (data.success) {
            showMessage(successMessage, 'User has been created');
            await fetchUsersAndDecks();
        } else {
            showMessage(errorMessage, data.error || 'Failed to create user');
        }
    } catch (error) {
        console.error('Error creating user:', error);
        showMessage(errorMessage, 'Please try again');
    }
}
function showMessage(element, text) {
    element.textContent = text;
    element.classList.add('visible');
    setTimeout(() => {
        element.classList.remove('visible');
    }, 3000);
}
async function fetchDecks() {
    try {
        const response = await fetch('/api/all-decks');
        allDecks = await response.json();
        displayDeckHierarchy();
        populateParentDeckSelect();
    } catch (error) {
        console.error('Error fetching decks:', error);
    }
}
async function fetchUsersAndDecks() {
    try {
        const response = await fetch('/api/users-and-decks');
        usersAndDecks = await response.json();
        populateUserSelect();
    } catch (error) {
        console.error('Error fetching users and decks:', error);
    }
}
function displayDeckHierarchy() {
    const allDecksDiv = document.querySelector('.all-decks');
    allDecksDiv.innerHTML = '';
    function buildHierarchy(parentId, level) {
        const children = allDecks.filter(deck => deck.parent_id === parentId);
        let html = '';
        children.forEach(deck => {
            html += `<div class="deck-item" style="margin-left: ${level * 20}px">${deck.name}</div>`;
            html += buildHierarchy(deck.deck_id, level + 1);
        });
        return html;
    }
    allDecksDiv.innerHTML = buildHierarchy(null, 0);
}
function populateParentDeckSelect() {
    const parentDeckSelect = document.getElementById('parent-deck');
    const deckSelect = document.getElementById('deck-select');
    const imageCategorySelect = document.getElementById('image-category');
    [parentDeckSelect, deckSelect, imageCategorySelect].forEach(select => {
        if (select) {
            select.innerHTML = '<option value="">NULL (parent)</option>';
            allDecks.forEach(deck => {
                select.innerHTML += `<option value="${deck.deck_id}">${deck.name}</option>`;
            });
        }
    });
}
function populateUserSelect() {
    const userSelect = document.getElementById('user-select');
    userSelect.innerHTML = '<option value="">Select a user</option>';
    const uniqueUsers = [...new Set(usersAndDecks.map(item => item.username))];
    uniqueUsers.forEach(username => {
        userSelect.innerHTML += `<option value="${username}">${username}</option>`;
    });
}
function populateDeckSelect2(username) {
    const deckSelect2 = document.getElementById('deck-select-2');
    deckSelect2.innerHTML = '<option value="">Select a deck</option>';
    const userDecks = usersAndDecks.filter(item => item.username === username).map(item => item.deck_id);
    allDecks.forEach(deck => {
        if (!userDecks.includes(deck.deck_id)) {
            deckSelect2.innerHTML += `<option value="${deck.deck_id}">${deck.name}</option>`;
        }
    });
}
async function addNewDeck() {
    const parentDeckId = document.getElementById('parent-deck').value;
    const newDeckName = document.getElementById('new-deck-name').value;
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    if (!newDeckName) {
        showMessage(errorMessage, 'Please enter a deck name');
        return;
    }
    try {
        const response = await fetch('/api/add-deck', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: newDeckName,
                parent_id: parentDeckId === '' ? null : parseInt(parentDeckId)
            }),
        });
        const data = await response.json();
        if (data.success) {
            showMessage(successMessage, 'Deck added successfully');
            document.getElementById('new-deck-name').value = '';
            await fetchDecks();
        } else {
            showMessage(errorMessage, data.error || 'Failed to add deck');
        }
    } catch (error) {
        console.error('Error adding deck:', error);
        showMessage(errorMessage, 'Please try again');
    }
}
async function addCardsToDatabase(event) {
    event.preventDefault();
    const deckId = document.getElementById('deck-select').value;
    const fileInput = document.getElementById('cards-data');
    const successMessage = document.getElementById('addCardsSuccessMessage');
    const errorMessage = document.getElementById('addCardsErrorMessage');
    if (!deckId) {
        showMessage(errorMessage, 'Please select a deck');
        return;
    }
    if (!fileInput.files[0]) {
        showMessage(errorMessage, 'Please select a file');
        return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        const content = e.target.result;
        const flashcards = parseContent(content);
        try {
            const response = await fetch('/api/add-cards', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    deckId: deckId,
                    flashcards: flashcards
                }),
            });
            const data = await response.json();
            if (data.success) {
                showMessage(successMessage, 'Cards added successfully');
                fileInput.value = '';
            } else {
                showMessage(errorMessage, data.error || 'Failed to add cards');
            }
        } catch (error) {
            console.error('Error adding cards:', error);
            showMessage(errorMessage, 'Please try again');
        }
    };
    reader.readAsText(file);
}
function parseContent(content) {
    const lines = content.split('\n');
    const flashcards = [];
    let currentCard = { front: '', back: '' };
    let inMultiline = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') continue;
        if (!inMultiline) {
            const parts = line.split('\t');
            if (parts.length >= 2) {
                if (currentCard.front) {
                    flashcards.push(currentCard);
                    currentCard = { front: '', back: '' };
                }
                currentCard.front = parts[0].replace(/^"|"$/g, '').trim();
                currentCard.back = parts.slice(1).join('\t').trim();

                if (currentCard.back.startsWith('"') && !currentCard.back.endsWith('"')) {
                    inMultiline = true;
                } else {
                    currentCard.back = currentCard.back.replace(/^"|"$/g, '').trim();
                }
            } else if (currentCard.front) {
                // Jeśli linia nie zawiera tabulatora, dodajemy ją do poprzedniej karty
                currentCard.back += ' ' + line.replace(/^"|"$/g, '').trim();
            }
        } else {
            // Kontynuujemy wieloliniowy back
            currentCard.back += '\n' + line;
            if (line.endsWith('"')) {
                inMultiline = false;
                currentCard.back = currentCard.back.replace(/^"|"$/g, '').trim();
                flashcards.push(currentCard);
                currentCard = { front: '', back: '' };
            }
        }
    }
    if (currentCard.front || currentCard.back) {
        flashcards.push(currentCard);
    }

    return flashcards;
}
async function addUserToDeck() {
    const username = document.getElementById('user-select').value;
    const deckId = document.getElementById('deck-select-2').value;
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    if (!username || !deckId) {
        showMessage(errorMessage, 'Please select both a user and a deck');
        return;
    }
    try {
        const response = await fetch('/api/add-user-to-deck', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                deckId: parseInt(deckId)
            }),
        });
        const data = await response.json();
        if (data.success) {
            showMessage(successMessage, 'User added to deck successfully');
            await fetchUsersAndDecks();
            populateDeckSelect2(username);
        } else {
            showMessage(errorMessage, data.error || 'Failed to add user to deck');
        }
    } catch (error) {
        console.error(error);
        showMessage(errorMessage, 'Please try again');
    }
}
async function uploadImages(event) {
    event.preventDefault();
    const categorySelect = document.getElementById('image-category');
    const category = categorySelect.options[categorySelect.selectedIndex].text;
    const fileInput = document.getElementById('image-files');
    const successMessage = document.getElementById('uploadImagesSuccessMessage');
    const errorMessage = document.getElementById('uploadImagesErrorMessage');
    if (!category || category === "Select a deck") {
        showMessage(errorMessage, 'Please select a deck');
        return;
    }
    if (fileInput.files.length === 0) {
        showMessage(errorMessage, 'Please select at least one image');
        return;
    }
    const formData = new FormData();
    formData.append('category', category);
    for (let i = 0; i < fileInput.files.length; i++) {
        formData.append('images', fileInput.files[i]);
    }
    try {
        const response = await fetch('/api/upload-images', {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();
        if (data.success) {
            showMessage(successMessage, 'Images uploaded successfully');
            fileInput.value = '';
            categorySelect.value = '';
            document.getElementById('selected-files').innerHTML = '';
        } else {
            showMessage(errorMessage, data.error || 'Failed to upload images');
        }
    } catch (error) {
        console.error('Error uploading images:', error);
        showMessage(errorMessage, 'Please try again');
    }
}
fetchDecks();
fetchUsersAndDecks();
document.querySelectorAll('.select-buttons button').forEach((button, index) => {
    button.addEventListener('click', () => {
        const settings = document.querySelectorAll('.selected-setting > div');
        settings.forEach(setting => {
            setting.classList.remove('active');
            setTimeout(() => {
                setting.style.display = 'none';
            }, 500);
        });
        setTimeout(() => {
            settings[index].style.display = 'block';
            setTimeout(() => {
                settings[index].classList.add('active');
            }, 50);
        }, 500);
        if (index === 1) {
            populateUserSelect();
        } else if (index === 2 || index === 3) {
            populateParentDeckSelect();
        }
    });
});
document.getElementById('user-select').addEventListener('change', (event) => {
    const selectedUsername = event.target.value;
    if (selectedUsername) {
        populateDeckSelect2(selectedUsername);
    }
});
document.getElementById('image-files').addEventListener('change', (event) => {
    const fileNames = Array.from(event.target.files).map(file => file.name);
    document.getElementById('selected-files').innerHTML = fileNames.join(', ');
});