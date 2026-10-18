const removeModal = document.querySelector('.remove-character-modal');
const removeModalImage = removeModal.querySelector('.remove-modal-image');
const removeModalName = removeModal.querySelector('.remove-modal-name');

const cancelRemoveButton = removeModal.querySelector('.cancel-remove-button');
const confirmRemoveButton = removeModal.querySelector('.confirm-remove-button');

let characterToRemove = null;


const editCharacterButtons = document.querySelectorAll('.edit-character-button');

for (let button of editCharacterButtons) {
    button.addEventListener('click', function() {
        const card = button.closest('.character-card');

        const editor = card.querySelector('.character-editor');
        const input = card.querySelector('.character-name-input');

        const imageInput = card.querySelector('.character-image-input');
        const imagePreview = card.querySelector('.character-image-preview');
        const characterImage = card.querySelector('.character-image');

        imageInput.value = '';
        imagePreview.src = characterImage.src;

        const rankInput = card.querySelector('.character-rank-input');

        input.value = button.dataset.customName;

        rankInput.value = button.dataset.position;

        editor.hidden = false;
        button.hidden = true;
    });
}


const cancelCharacterButtons = document.querySelectorAll('.cancel-character-button');

for (let button of cancelCharacterButtons) {
    button.addEventListener('click', function() {
        const card = button.closest('.character-card');

        const editor = card.querySelector('.character-editor');
        const editButton = card.querySelector('.edit-character-button');

        editor.hidden = true;
        editButton.hidden = false;
    });
}


const saveCharacterButtons = document.querySelectorAll('.save-character-button');

for (let button of saveCharacterButtons) {
    button.addEventListener('click', async function() {
        const card = button.closest('.character-card');

        const editor = card.querySelector('.character-editor');
        const editButton = card.querySelector('.edit-character-button');
        const input = card.querySelector('.character-name-input');
        const characterName = card.querySelector('.character-name');

        const characterId = editButton.dataset.characterId;
        const customName = input.value.trim();

        const rankInput = card.querySelector('.character-rank-input');

        const newPosition = Number(rankInput.value);
        const oldPosition = Number(editButton.dataset.position);

        const imageInput = card.querySelector('.character-image-input');
        const characterImage = card.querySelector('.character-image');

        const selectedImage = imageInput.files[0];

        try {
            const response = await csrfFetch(
                `/api/characters/${characterId}/name`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        custom_name: customName
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                alert(data.error || 'Could not save character name');
                return;
            }

            editButton.dataset.customName = data.custom_name || '';

            characterName.textContent = data.custom_name || editButton.dataset.originalName;

            if (newPosition !== oldPosition) {
                const rankResponse = await csrfFetch(
                    `/api/characters/${characterId}/rank`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            position: newPosition
                        })
                    }
                );

                const rankData = await rankResponse.json();

                if (!rankResponse.ok) {
                    alert(rankData.error || 'Could not update ranking');
                    return;
                }

                updateCharacterCardOrder(rankData.order);
            }

            if (selectedImage) {
                const formData = new FormData();

                formData.append('image', selectedImage);

                const imageResponse = await csrfFetch(
                    `/api/characters/${characterId}/image`,
                    {
                        method: 'POST',
                        body: formData
                    }
                );

                const imageData = await imageResponse.json();

                if (!imageResponse.ok) {
                    alert(imageData.error || 'Could not upload portrait');
                    return;
                }

                characterImage.src = imageData.custom_image;

                const imagePreview = card.querySelector('.character-image-preview');
                imagePreview.src = imageData.custom_image;

                imageInput.value = '';
            }


            editor.hidden = true;
            editButton.hidden = false;

        } catch (error) {
            console.error(error);
            alert('Something went wrong while saving.');
        }
    });
}


const characterImageInputs = document.querySelectorAll('.character-image-input');

for (let input of characterImageInputs) {
    input.addEventListener('change', function() {
        const file = input.files[0];

        if (!file) {
            return;
        }

        const card = input.closest('.character-card');
        const preview = card.querySelector('.character-image-preview');

        const imageUrl = URL.createObjectURL(file);

        preview.src = imageUrl;

        preview.onload = function() {
            URL.revokeObjectURL(imageUrl);
        };
    });
}


const restoreImageButtons = document.querySelectorAll('.restore-character-image-button');

for (let button of restoreImageButtons) {
    button.addEventListener('click', async function() {
        const card = button.closest('.character-card');
        const editButton = card.querySelector('.edit-character-button');

        const characterId = editButton.dataset.characterId;

        const imageInput = card.querySelector('.character-image-input');
        const imagePreview = card.querySelector('.character-image-preview');
        const characterImage = card.querySelector('.character-image');

        try {
            const response = await csrfFetch(
                `/api/characters/${characterId}/image`,
                {
                    method: 'DELETE'
                }
            );

            const data = await response.json();

            if (!response.ok) {
                alert(data.error || 'Could not restore default portrait');
                return;
            }

            characterImage.src = data.image;
            imagePreview.src = data.image;

            imageInput.value = '';

        } catch (error) {
            console.error(error);
            alert('Something went wrong while restoring the portrait.');
        }
    });
}


function updateCharacterCardOrder(characterIds) {
    const library = document.querySelector('.characters-library');

    characterIds.forEach(function(characterId, index) {
        const card = library.querySelector(
            `.character-card[data-character-id="${characterId}"]`
        );

        if (!card) {
            return;
        }

        const newPosition = index + 1;

        card.dataset.position = newPosition;

        const positionLabel = card.querySelector('.character-position');
        positionLabel.textContent = `#${newPosition}`;

        const rankBadge = card.querySelector('.character-rank-badge');
        const rankIcon = rankBadge.querySelector('.icon');

        if (rankIcon) {
            rankIcon.remove();
        }

        if (newPosition <= 3) {
            const icon = document.createElement('i');

            icon.className = newPosition === 1
                ? 'icon icon-crown'
                : 'icon icon-medal';

            rankBadge.prepend(icon);
        }

        const editButton = card.querySelector('.edit-character-button');
        editButton.dataset.position = newPosition;

        library.appendChild(card);
    });

    document.querySelectorAll('.character-rank-input').forEach(function(select) {
        const card = select.closest('.character-card');
        const currentPosition = Number(card.dataset.position);

        select.innerHTML = '';

        for (let rank = 1; rank <= characterIds.length; rank++) {
            const option = document.createElement('option');

            option.value = rank;
            option.textContent = `#${rank}`;

            if (rank === currentPosition) {
                option.selected = true;
            }

            select.appendChild(option);
        }
    });
}


document.querySelectorAll('.remove-character-button').forEach(function(button) {
    button.addEventListener('click', function() {
        const card = button.closest('.character-card');

        const characterName = card.querySelector('.character-name').textContent.trim();
        const characterImage = card.querySelector('.character-image').src;

        characterToRemove = card;

        removeModalName.textContent = characterName;
        removeModalImage.src = characterImage;
        removeModalImage.alt = characterName;

        removeModal.showModal();
    });
});


cancelRemoveButton.addEventListener('click', function() {
    removeModal.close();
});

removeModal.addEventListener('close', function() {
    characterToRemove = null;
});

removeModal.addEventListener('click', function(event) {
    if (event.target === removeModal && !confirmRemoveButton.disabled) {
        removeModal.close();
    }
});

removeModal.addEventListener('cancel', function(event) {
    if (confirmRemoveButton.disabled) {
        event.preventDefault();
    }
});

confirmRemoveButton.addEventListener('click', async function() {
    if (!characterToRemove) {
        return;
    }

    const card = characterToRemove;
    const characterId = card.dataset.characterId;

    confirmRemoveButton.disabled = true;

    try {
        const response = await csrfFetch(
            `/api/characters/${characterId}`,
            { method: 'DELETE' }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || 'Could not remove character.');
            return;
        }

        // Remove the character's card
        card.remove();

        // Update rankings, crowns, medals, and dropdowns
        updateCharacterCardOrder(data.order);

        // Close the confirmation dialog
        removeModal.close();

    } catch (error) {
        console.error('Error removing character:', error);
        alert('Something went wrong while removing the character.');

    } finally {
        confirmRemoveButton.disabled = false;
    }
});

document.addEventListener('keydown', function(event) {
    if (
        event.key === 'Escape' &&
        removeModal.open &&
        !confirmRemoveButton.disabled
    ) {
        event.preventDefault();
        removeModal.close();
    }
});

const layoutButtons = document.querySelectorAll('.character-layout-button');

const characterLayouts = {
    gallery: document.querySelector('.characters-library'),
    podium: document.querySelector('.characters-podium'),
    orbit: document.querySelector('.characters-orbit')
};

function switchCharacterLayout(layoutName) {
    // Hide every layout
    Object.values(characterLayouts).forEach(function(layout) {
        layout.hidden = true;
    });

    // Show the selected layout
    characterLayouts[layoutName].hidden = false;

    // Update the active button
    layoutButtons.forEach(function(button) {
        const isActive = button.dataset.layout === layoutName;

        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });

    if (layoutName === 'podium') {
    buildCharacterPodium();
    }

    if (layoutName === 'orbit') {
    buildCharacterOrbit();
    }
}


function buildCharacterPodium() {
    const podiumTopThree = document.querySelector('.podium-top-three');
    const podiumRemaining = document.querySelector('.podium-remaining');

    // Clear any previously generated podium cards
    podiumTopThree.innerHTML = '';
    podiumRemaining.innerHTML = '';

    // Get the existing character cards
    const characterCards = Array.from(
        document.querySelectorAll('.characters-library .character-card')
    );

    // Sort them by their current rankings
    characterCards.sort(function(a, b) {
        return Number(a.dataset.position) - Number(b.dataset.position);
    });

    // Display second, first, and third place from left to right
    const podiumOrder = [1, 0, 2];

    podiumOrder.forEach(function(index) {
        const card = characterCards[index];

        if (!card) {
            return;
        }

        const position = Number(card.dataset.position);
        const name = card.querySelector('.character-name').textContent.trim();
        const image = card.querySelector('.character-image').src;

        const podiumCard = document.createElement('div');
        podiumCard.className = 'podium-character';
        podiumCard.dataset.position = position;

        podiumCard.dataset.characterId = card.dataset.characterId;
        podiumCard.draggable = true;

        const portrait = document.createElement('img');
        portrait.className = 'podium-character-image';
        portrait.src = image;
        portrait.alt = name;

        const info = document.createElement('div');
        info.className = 'podium-character-info';

        const rank = document.createElement('span');
        rank.className = 'podium-character-rank';

        const rankIcon = document.createElement('i');
        rankIcon.className = position === 1
            ? 'icon icon-crown'
            : 'icon icon-medal';

        const rankNumber = document.createElement('span');
        rankNumber.textContent = `#${position}`;

        rank.append(rankIcon, rankNumber);

        const characterName = document.createElement('a');
        characterName.className = 'podium-character-name';
        characterName.textContent = name;
        characterName.href = card.querySelector('.character-name').href;

        const seriesInfo = document.createElement('div');
        seriesInfo.className = 'podium-character-series';

        const seriesLinks = card.querySelectorAll('.character-series-link');

        seriesLinks.forEach(function(link) {
            const seriesLink = document.createElement('a');

            seriesLink.href = link.href;
            seriesLink.textContent = link.textContent.trim();

            seriesInfo.appendChild(seriesLink);
        });

        info.append(rank, characterName, seriesInfo);

        const dragHandle = document.createElement('span');
        dragHandle.className = 'podium-drag-handle';
        dragHandle.title = 'Drag to change ranking';

        const dragIcon = document.createElement('i');
        dragIcon.className = 'icon icon-grip-vertical';

        dragHandle.appendChild(dragIcon);
        info.appendChild(dragHandle);

        podiumCard.append(portrait, info);
        podiumTopThree.appendChild(podiumCard);
    });

    const remainingCharacters = characterCards.slice(3);

    remainingCharacters.forEach(function(card) {
        const position = Number(card.dataset.position);
        const name = card.querySelector('.character-name').textContent.trim();
        const image = card.querySelector('.character-image').src;

        const remainingCard = document.createElement('div');
        remainingCard.className = 'podium-remaining-character';

        remainingCard.dataset.characterId = card.dataset.characterId;
        remainingCard.dataset.position = position;
        remainingCard.draggable = true;

        const portrait = document.createElement('img');
        portrait.src = image;
        portrait.alt = name;

        const info = document.createElement('div');
        info.className = 'podium-remaining-info';

        const rank = document.createElement('span');
        rank.className = 'podium-remaining-rank';
        rank.textContent = `#${position}`;

        const characterName = document.createElement('a');
        characterName.className = 'podium-remaining-name';
        characterName.textContent = name;
        characterName.href = card.querySelector('.character-name').href;

        const seriesInfo = document.createElement('div');
        seriesInfo.className = 'podium-remaining-series';

        const seriesLinks = card.querySelectorAll('.character-series-link');

        seriesLinks.forEach(function(link) {
            const seriesLink = document.createElement('a');

            seriesLink.href = link.href;
            seriesLink.textContent = link.textContent.trim();

            seriesInfo.appendChild(seriesLink);
        });

        info.append(rank, characterName, seriesInfo);

        const dragHandle = document.createElement('span');
        dragHandle.className = 'podium-drag-handle';
        dragHandle.title = 'Drag to change ranking';

        const dragIcon = document.createElement('i');
        dragIcon.className = 'icon icon-grip-vertical';

        dragHandle.appendChild(dragIcon);
        info.appendChild(dragHandle);

        remainingCard.append(portrait, info);

        podiumRemaining.appendChild(remainingCard);
    });

    initializePodiumDragging();
}



let orbitRotation = 0;

function buildCharacterOrbit() {
    const orbitStage = document.querySelector('.orbit-stage');

    orbitStage.innerHTML = '';

    const characterCards = Array.from(
        document.querySelectorAll('.characters-library .character-card')
    );

    // Sort characters by their current rankings
    characterCards.sort(function(a, b) {
        return Number(a.dataset.position) - Number(b.dataset.position);
    });

    characterCards.forEach(function(card) {
        const characterId = card.dataset.characterId;
        const position = Number(card.dataset.position);
        const name = card.querySelector('.character-name').textContent.trim();
        const image = card.querySelector('.character-image').src;

        // Create Orbit card
        const orbitCard = document.createElement('div');

        orbitCard.className = 'orbit-card';
        orbitCard.dataset.characterId = characterId;
        orbitCard.dataset.position = position;

        // Create the portrait
        const portrait = document.createElement('img');

        portrait.className ='orbit-card-image';
        portrait.src = image;
        portrait.alt = name;
        portrait.draggable = false;

        orbitCard.appendChild(portrait);
        orbitStage.appendChild(orbitCard);
    });

    positionOrbitCards();
    updateOrbitDetails();
}

function positionOrbitCards() {
    const orbitCards = Array.from(
        document.querySelectorAll('.orbit-card')
    );

    const total = orbitCards.length;

    if (total === 0) {
        return;
    }

    const radiusX = 470;
    const radiusY = 90;

    orbitCards.forEach(function(card, index) {

        // Calculate position relative to the current rotation
        const relativeIndex = index - orbitRotation;

        const angle = (relativeIndex / total) * Math.PI * 2;

        // Position along the ellipse
        const x = Math.sin(angle) * radiusX;
        const y = Math.cos(angle) * radiusY;

        // Depth: 1 at the front, 0 at the back
        const depth = (Math.cos(angle) + 1) / 2;
        card.classList.toggle('orbit-card-active', depth > 0.999);

        // Front characters appear larger
        const scale = 0.55 + depth * 0.55;

        // Back characters appear slightly faded
        const opacity = 0.4 + depth * 0.6;

        // Front characters appear above those behind
        const zIndex = Math.round(depth * 100);

        card.style.transform = `
            translate(-50%, -50%)
            translate(${x}px, ${y}px)
            scale(${scale})
        `;

        card.style.opacity = opacity;
        card.style.zIndex = zIndex;
    });
}

function rotateCharacterOrbit(direction) {
    const total = document.querySelectorAll('.orbit-card').length;

    if (total === 0) {
        return;
    }

    orbitRotation = (orbitRotation + direction + total) % total;

    positionOrbitCards();
    updateOrbitDetails();
}

function updateOrbitDetails () {
    const orbitCards = Array.from(
        document.querySelectorAll('.orbit-card')
    );

    if (orbitCards.length === 0) {
        return;
    }

    const selectedOrbitCard = orbitCards[orbitRotation];

    const characterId = selectedOrbitCard.dataset.characterId;

    // Find the original gallery card
    const galleryCard = document.querySelector(
        `.characters-library .character-card[data-character-id="${characterId}"]`
    );

    if (!galleryCard) {
        return;
    }

    const position = galleryCard.dataset.position;

    const characterName = galleryCard.querySelector('.character-name');
    const seriesLinks = galleryCard.querySelectorAll('.character-series-link');

    const rankDisplay = document.querySelector('.orbit-character-rank');
    const nameDisplay = document.querySelector('.orbit-character-name');
    const seriesDisplay = document.querySelector('.orbit-character-series');

    // Update rank
    rankDisplay.replaceChildren();

    const rankNumber = Number(position);

    if (rankNumber <= 3) {
        const rankIcon = document.createElement('i');

        rankIcon.className = rankNumber === 1
            ? 'icon icon-crown'
            : 'icon icon-medal';

        rankDisplay.appendChild(rankIcon);
    }

    const rankText = document.createElement('span');
    rankText.textContent = `#${position}`;

    rankDisplay.appendChild(rankText);

    // Apply the appropriate rank styling
    rankDisplay.dataset.position = position;

    // Update character name
    nameDisplay.replaceChildren(characterName.cloneNode(true));

    // Update series links
    seriesDisplay.replaceChildren();

    seriesLinks.forEach(function(link) {
        seriesDisplay.appendChild(link.cloneNode(true));
    });
}

function initializePodiumDragging() {
    const podiumCards = document.querySelectorAll(
        '.podium-character, .podium-remaining-character'
    );

    let draggedCard = null;
    let dragStartedOnHandle = false;

    podiumCards.forEach(function(card) {
        const dragHandle = card.querySelector('.podium-drag-handle');

        dragHandle.addEventListener('pointerdown', function() {
            dragStartedOnHandle = true;
        });

        card.addEventListener('pointerdown', function(event) {
            if (!event.target.closest('.podium-drag-handle')) {
                dragStartedOnHandle = false;
            }
        });


        card.addEventListener('dragstart', function(event) {
            if (!dragStartedOnHandle) {
                event.preventDefault();
                return;
            }

            draggedCard = card;

            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(
                'text/plain',
                card.dataset.characterId
            );

            card.classList.add('dragging');
        });

        card.addEventListener('dragover', function(event) {
            event.preventDefault();

            if (card !== draggedCard) {
                event.dataTransfer.dropEffect = 'move';
                card.classList.add('drag-over');
            }
        });

        card.addEventListener('dragleave', function() {
            card.classList.remove('drag-over');
        });

        card.addEventListener('drop', async function(event) {
            event.preventDefault();

            card.classList.remove('drag-over');

            if (!draggedCard || draggedCard === card) {
        return;
            }

            const characterId = draggedCard.dataset.characterId;
            const newPosition = Number(card.dataset.position);

            try {
                const response = await csrfFetch(
                    `/api/characters/${characterId}/rank`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            position: newPosition
                        })
                    }
                );

                const data = await response.json();

                if (!response.ok) {
                    alert(data.error || 'Could not update character ranking.');
                    return;
                }

                // Update the original Gallery cards
                updateCharacterCardOrder(data.order);

                // Rebuild the Podium with the new rankings
                buildCharacterPodium();

            } catch (error) {
                console.error('Error updating character ranking:', error);
                alert('Something went wrong while updating the ranking.');
            }
        });

        card.addEventListener('dragend', function() {
            draggedCard = null;
            dragStartedOnHandle = false;

            podiumCards.forEach(function(podiumCard) {
                podiumCard.classList.remove('dragging', 'drag-over');
            });
        });
    });
}

document.addEventListener('pointerup', function() {
    dragStartedOnHandle = false;
});


const orbitPrevButton = document.querySelector('.orbit-prev');
const orbitNextButton = document.querySelector('.orbit-next');

orbitPrevButton.addEventListener('click', function() {
    rotateCharacterOrbit(-1);
});

orbitNextButton.addEventListener('click', function() {
    rotateCharacterOrbit(1);
});


layoutButtons.forEach(function(button) {
    button.addEventListener('click', function() {
        const selectedLayout = button.dataset.layout;

        switchCharacterLayout(selectedLayout);
    });
});

switchCharacterLayout('gallery');