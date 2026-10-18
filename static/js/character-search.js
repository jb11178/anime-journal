const addCharacterButtons = document.querySelectorAll('.add-character-button');

for (let button of addCharacterButtons) {
    button.addEventListener('click', async function() {
        const characterId = button.dataset.characterId;

        const response = await csrfFetch(
            `/api/characters/${characterId}`,
            {
                method: 'POST'
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error(data.error);
            return;
        }

        button.innerText = 'Added to Favorites';
        button.disabled = true;
    });
}