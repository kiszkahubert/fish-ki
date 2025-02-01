let pieChart = null;
async function fetchData() {
    const response = await fetch('/api/data-for-stats');
    const data = await response.json();
    return data;
}
function populateDecks(decks) {
    const deckSelect = document.getElementById('deck-select');
    decks.forEach(deck => {
        const option = document.createElement('option');
        option.value = deck.deck_id;
        option.textContent = deck.name;
        deckSelect.appendChild(option);
    });
}
function createPieChart(newCards, learningCards, reviewingCards) {
    const ctx = document.getElementById('deckPieChart').getContext('2d');
    if (pieChart) {
        pieChart.destroy();
    }
    pieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Nowe Karty', 'Uczone Karty', 'Karty do powtórki'],
            datasets: [{
                data: [newCards, learningCards, reviewingCards],
                backgroundColor: ['#007BFF', '#ff4444', '#00cc44'],
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        }
    });
}
function categorizeCards(cards) {
    let newCards = 0;
    let learningCards = 0;
    let reviewingCards = 0;
    cards.forEach(card => {
        if (card.difficulty_level === null) {
            newCards++;
        } else if (card.difficulty_level < 30) {
            learningCards++;
        } else {
            reviewingCards++;
        }
    });
    return { newCards, learningCards, reviewingCards };
}
function getCardsForDeck(deckId, cards, decks) {
    let relevantCards = cards.filter(card => card.deck_id === deckId);
    const childDecks = decks.filter(deck => deck.parent_id === deckId);
    if (childDecks.length > 0) {
        childDecks.forEach(childDeck => {
            relevantCards = relevantCards.concat(getCardsForDeck(childDeck.deck_id, cards, decks));
        });
    }
    return relevantCards;
}
async function init() {
    const data = await fetchData();
    const { cardCount, cardsDifficulty, usersDecks } = data;
    if (Array.isArray(cardCount) && cardCount.length > 0) {
        const newCardsShown = cardCount[0].new_cards_shown ?? 0;
        document.getElementById('cardsReviewed').textContent = newCardsShown;
    } else {
        document.getElementById('cardsReviewed').textContent = 0;
    }
    if (Array.isArray(usersDecks) && usersDecks.length > 0) {
        populateDecks(usersDecks);
        document.getElementById('deck-select').addEventListener('change', (event) => {
            const selectedDeckId = parseInt(event.target.value, 10);
            const relevantCards = getCardsForDeck(selectedDeckId, cardsDifficulty, usersDecks);
            const { newCards, learningCards, reviewingCards } = categorizeCards(relevantCards);
            createPieChart(newCards, learningCards, reviewingCards);
        });
        const defaultDeckId = usersDecks[0].deck_id;
        const relevantCards = getCardsForDeck(defaultDeckId, cardsDifficulty, usersDecks);
        const { newCards, learningCards, reviewingCards } = categorizeCards(relevantCards);
        createPieChart(newCards, learningCards, reviewingCards);
    } else {
        console.error("No decks available to populate the selection.");
    }
}

init();