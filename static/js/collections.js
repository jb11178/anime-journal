const collectionModal = document.querySelector('.collection-editor-modal');

const createCollectionButtons = document.querySelectorAll(
    '.collection-create-card'
);

const cancelCollectionButton = document.querySelector(
    '.collection-editor-cancel'
);

const collectionNameInput = document.querySelector('#collection-name');

const collectionCoverInput = document.querySelector('#collection-cover');
const collectionCoverPreview = document.querySelector('.collection-cover-preview');

const collectionTypeButtons = document.querySelectorAll(
    '.collection-type-button'
);

const collectionSearchInput = document.querySelector('#collection-search');

const collectionStatusFilter = document.querySelector('#collection-status-filter');
const collectionGenreFilter = document.querySelector('#collection-genre-filter');

const saveCollectionButton = document.querySelector('.collection-editor-save');
const collectionDetailsDeleteButton = document.querySelector('.collection-details-delete');
const collectionDetailsEditButton = document.querySelector(
    '.collection-details-edit'
);

let currentCollectionId = null;
let editingCollectionId = null;

const collectionCards = document.querySelectorAll('.collection-card');
const collectionDetailsModal = document.querySelector('.collection-details-modal');
const collectionDetailsTitle = document.querySelector('.collection-details-title');
const collectionDetailsSubtitle = document.querySelector('.collection-details-subtitle');
const collectionDetailsGrid = document.querySelector('.collection-details-grid');
const collectionDetailsCloseButton = document.querySelector('.collection-details-close');



let selectedCollectionType = 'ANIME';

const selectedCollectionEntries = new Set();


function openCollectionEditor() {
    editingCollectionId = null;

    collectionNameInput.value = '';
    collectionSearchInput.value = '';
    collectionCoverInput.value = '';

    collectionCoverPreview.innerHTML = `
        <i class="icon icon-image"></i>
        <span>No cover selected</span>
    `;
    selectedCollectionType = 'ANIME';

    updateCollectionStatusOptions();
    updateCollectionGenreOptions();

    selectedCollectionEntries.clear();
    updateSelectedCount();

    updateCollectionTypeButtons();
    renderCollectionLibrary();

    collectionModal.showModal();
}


async function openEditCollectionEditor() {
    if (currentCollectionId === null) {
        return;
    }

    const collectionId = currentCollectionId;

    try {
        const response = await csrfFetch(`/api/collections/${collectionId}`);
        const data = await response.json();

        if (!response.ok) {
            alert(data.error || 'Could not load collection.');
            return;
        }

        collectionDetailsModal.close();

        openCollectionEditor();

        editingCollectionId = collectionId;

        // Populate the collection name
        document.querySelector('#collection-name').value = data.collection.name;

        // Populate media type buttons
        const mediaType = data.collection.media_type;

        const typeButton = [...document.querySelectorAll('.collection-type-button')]
            .find(button => button.dataset.type === mediaType);

        if (typeButton) {
            typeButton.click();
        }

        // Populate media entries
        selectedCollectionEntries.clear();

        for (const entry of data.entries) {
            selectedCollectionEntries.add(entry.user_entry_id);
        }

        // Display the existing collection cover
        const existingCover = data.collection.custom_image;

        if (existingCover) {
            collectionCoverPreview.innerHTML = `
                <img src="${existingCover}" alt="Collection cover">
            `;
        } else {
            collectionCoverPreview.innerHTML = `
                <i class="icon icon-image"></i>
                <span>No cover selected</span>
            `;
        }

        renderCollectionLibrary();

    } catch (error) {
        console.error(error);
        alert('Something went wrong while loading the collection.');
    }
}


function closeCollectionEditor() {
    collectionModal.close();
}


function previewCollectionCover() {
    const file = collectionCoverInput.files[0];

    if (!file) {
        return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        alert('Please select a JPG, PNG, or WebP image.');
        collectionCoverInput.value = '';
        return;
    }

    const reader = new FileReader();

    reader.onload = function() {
        collectionCoverPreview.innerHTML = '';

        const image = document.createElement('img');
        image.src = reader.result;
        image.alt = 'Collection cover preview';

        collectionCoverPreview.appendChild(image);
    };

    reader.readAsDataURL(file);
}


function updateCollectionTypeButtons() {
    collectionTypeButtons.forEach(function(button) {
        const isActive = button.dataset.type === selectedCollectionType;

        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}


function updateCollectionGenreOptions() {
    const entries = selectedCollectionType === 'ANIME'
        ? animeLibraryEntries
        : mangaLibraryEntries;

    const genres = new Set();

    entries.forEach(function(entry) {
        entry.genres.forEach(function(genre) {
            genres.add(genre);
        });
    });

    const sortedGenres = [...genres].sort();

    collectionGenreFilter.innerHTML = '<option value="">All Genres</option>';

    sortedGenres.forEach(function(genre) {
        const option = document.createElement('option');

        option.value = genre;
        option.textContent = genre;

        collectionGenreFilter.appendChild(option);
    });
}


function renderCollectionDetails(entries) {
    collectionDetailsGrid.innerHTML = '';

    entries.forEach(function(entry) {
        const card = document.createElement('div');
        card.className = 'collection-details-entry';

        const cover = document.createElement('img');
        cover.className = 'collection-details-entry-cover';
        cover.src = entry.cover_image || '';
        cover.alt = entry.title;

        const title = document.createElement('a');
        title.className = 'collection-details-entry-title';
        title.textContent = entry.title;

        if (entry.anilist_id != null) {
            title.href = `/media/${entry.media_type.toLowerCase()}/${entry.anilist_id}`;
        }

        card.append(cover, title);
        collectionDetailsGrid.appendChild(card);
    });
}


createCollectionButtons.forEach(function(button) {
    button.addEventListener('click', openCollectionEditor);
});


cancelCollectionButton.addEventListener('click', closeCollectionEditor);


collectionCoverInput.addEventListener('change', previewCollectionCover);


collectionTypeButtons.forEach(function(button) {
    button.addEventListener('click', function() {
        const newType = button.dataset.type;

        if (newType === selectedCollectionType) {
            return;
        }

        selectedCollectionType = newType;

        updateCollectionStatusOptions();
        updateCollectionGenreOptions();

        selectedCollectionEntries.clear();
        updateSelectedCount();

        updateCollectionTypeButtons();
        renderCollectionLibrary();
    });
});


collectionSearchInput.addEventListener('input', function() {
    renderCollectionLibrary();
});


collectionStatusFilter.addEventListener('change', function() {
    renderCollectionLibrary();
});


collectionGenreFilter.addEventListener('change', function() {
    renderCollectionLibrary();
});


saveCollectionButton.addEventListener('click', saveCollection);
collectionDetailsDeleteButton.addEventListener('click', deleteCollection);

collectionDetailsEditButton.addEventListener('click', openEditCollectionEditor);


collectionCards.forEach(function(card) {
    card.addEventListener('click', function() {
        const collectionId = card.dataset.collectionId;

        openCollectionDetails(collectionId);
    });
});


collectionDetailsCloseButton.addEventListener('click', function() {
    collectionDetailsModal.close();
});


async function saveCollection() {
    const name = collectionNameInput.value.trim();
    const mediaType = selectedCollectionType;
    const entryIds = [...selectedCollectionEntries];

    if (!name) {
        alert('Please enter a collection name.');
        return;
    }

    if (entryIds.length === 0) {
        alert('Please select at least one entry.');
        return;
    }

    saveCollectionButton.disabled = true;

    try {
        const isEditing = editingCollectionId !== null;

        const url = isEditing
            ? `/api/collections/${editingCollectionId}`
            : '/api/collections';

        const method = isEditing ? 'PUT' : 'POST';

        const response = await csrfFetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                media_type: mediaType,
                entry_ids: entryIds
            })
        });

        const result = await response.json();

        if (!response.ok) {
            alert(result.error || 'Failed to save collection.');
            return;
        }

        const selectedImage = collectionCoverInput.files[0];

        if (selectedImage) {
            const formData = new FormData();

            formData.append('image', selectedImage);

            const imageResponse = await csrfFetch(
                `/api/collections/${result.collection_id}/image`,
                {
                    method: 'POST',
                    body: formData
                }
            );

            const imageData = await imageResponse.json();

            if (!imageResponse.ok) {
                alert(
                    imageData.error ||
                    'Collection created, but the cover image could not be uploaded.'
                );

                window.location.reload();
                return;
            }
        }

        closeCollectionEditor();
        window.location.reload();

    } catch (error) {
        console.error('Error saving collection:', error);
        alert('Something went wrong while saving the collection.');

    } finally {
        saveCollectionButton.disabled = false;
    }
}


async function deleteCollection() {
    if (currentCollectionId === null) {
        return;
    }

    collectionDetailsDeleteButton.disabled = true;

    try {
        const response = await csrfFetch(
            `/api/collections/${currentCollectionId}`,
            {
                method: 'DELETE'
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || 'Could not delete collection.');
            return;
        }

        collectionDetailsModal.close();
        window.location.reload();

    } catch (error) {
        console.error(error);
        alert('Something went wrong while deleting the collection.');

    } finally {
        collectionDetailsDeleteButton.disabled = false;
    }
}


async function openCollectionDetails(collectionId) {
    currentCollectionId = null;

    try {
        const response = await csrfFetch(`/api/collections/${collectionId}`);

        if (!response.ok) {
            throw new Error('Failed to load collection.');
        }

        currentCollectionId = Number(collectionId);

        const data = await response.json();

        collectionDetailsTitle.textContent = data.collection.name;

        collectionDetailsSubtitle.textContent =
            `${data.collection.media_type === 'ANIME' ? 'Anime' : 'Manga'} Collection · ${data.entries.length} entries`;

        renderCollectionDetails(data.entries);

        collectionDetailsModal.showModal();

    } catch (error) {
        console.error('Error loading collection:', error);
        alert('Something went wrong while loading the collection.');
    }
}


function renderCollectionLibrary() {
    const resultsContainer = document.querySelector(
        '.collection-library-results'
    );

    resultsContainer.innerHTML = '';

    const libraryEntries = selectedCollectionType === 'ANIME'
    ? animeLibraryEntries
    : mangaLibraryEntries;

    const searchTerm = collectionSearchInput.value.trim().toLowerCase();
    const selectedStatus = collectionStatusFilter.value;
    const selectedGenre = collectionGenreFilter.value;

    const entries = libraryEntries.filter(function(entry) {
        const matchesSearch = entry.title.toLowerCase().includes(searchTerm);

        const matchesStatus = selectedStatus === ''
            || entry.status === selectedStatus;

        const matchesGenre = selectedGenre === ''
            || entry.genres.includes(selectedGenre);

        return matchesSearch && matchesStatus && matchesGenre;
    });

    if (entries.length === 0) {
        resultsContainer.innerHTML = `
            <div class="collection-library-placeholder">
                <i class="icon icon-library"></i>
                <p>No entries found in your library.</p>
            </div>
        `;

        return;
    }

    entries.forEach(function(entry) {
        const card = document.createElement('div');
        card.className = 'collection-library-card';
        card.dataset.entryId = entry.user_entry_id;

        const cover = document.createElement('img');
        cover.className = 'collection-library-cover';
        cover.src = entry.cover_image || '';
        cover.alt = entry.title;

        const info = document.createElement('div');
        info.className = 'collection-library-card-info';

        const title = document.createElement('div');
        title.className = 'collection-library-card-title';
        title.textContent = entry.title;

        const metadata = document.createElement('div');
        metadata.className = 'collection-library-card-metadata';

        const status = document.createElement('span');

        status.className = `status ${entry.status}`;

        status.textContent = entry.status
            .replaceAll('-', ' ')
            .replace(/\b\w/g, letter => letter.toUpperCase());

        const score = document.createElement('span');

        score.textContent = entry.score !== null
            ? `★ ${entry.score}/10`
            : 'Not Rated';

        metadata.append(status, score);
        info.append(title, metadata);

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'collection-entry-add-button';

        const isSelected = selectedCollectionEntries.has(entry.user_entry_id);

        if (isSelected) {
            addButton.innerHTML = '<i class="icon icon-check"></i> Added';
            addButton.classList.add('selected');
        } else {
            addButton.innerHTML = '<i class="icon icon-plus"></i> Add';
        }

        addButton.addEventListener('click', function() {
            toggleCollectionEntry(entry.user_entry_id);
        });

        card.append(cover, info, addButton);
        resultsContainer.appendChild(card);
    });
}

function updateSelectedCount() {
    const selectedCount = document.querySelector('.collection-selected-count');

    selectedCount.textContent = `${selectedCollectionEntries.size} selected`;
}

function toggleCollectionEntry(entryId) {
    if (selectedCollectionEntries.has(entryId)) {
        selectedCollectionEntries.delete(entryId);
    } else {
        selectedCollectionEntries.add(entryId);
    }

    updateSelectedCount();
    renderCollectionLibrary();
}

function updateCollectionStatusOptions() {
    const statuses = selectedCollectionType === 'ANIME'
        ? [
            ['watching', 'Watching'],
            ['completed', 'Completed'],
            ['on-hold', 'On Hold'],
            ['dropped', 'Dropped'],
            ['plan-to-watch', 'Plan to Watch']
        ]
        : [
            ['reading', 'Reading'],
            ['completed', 'Completed'],
            ['on-hold', 'On Hold'],
            ['dropped', 'Dropped'],
            ['plan-to-read', 'Plan to Read']
        ];

    collectionStatusFilter.innerHTML = '<option value="">All Statuses</option>';

    statuses.forEach(function(status) {
        const option = document.createElement('option');

        option.value = status[0];
        option.textContent = status[1];

        collectionStatusFilter.appendChild(option);
    });
}