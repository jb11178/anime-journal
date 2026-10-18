const customizeButton = document.getElementById('customize-button');
const customizationPanel = document.getElementById('customization-panel');
const closeCustomizationButotn = document.getElementById('close-customization');

customizeButton.addEventListener('click', function() {
    customizationPanel.classList.add('open');
});

closeCustomizationButotn.addEventListener('click', function () {
    customizationPanel.classList.remove('open');
});


const mediaLibrary = document.getElementById('media-library');
const mediaType = mediaLibrary.dataset.mediaType;

const mediaEntries = document.querySelectorAll('.media-entry');

for (let entry of mediaEntries) {
    const bannerImage = entry.dataset.bannerImage;
    const coverImage = entry.dataset.coverImage;

    const showcaseImage = bannerImage || coverImage;

    entry.style.setProperty(
        '--showcase-image',
        `url("${showcaseImage}")`
    );
}

let libraryPreferences = {
    anime: {
        layout: 'list',
        density: 'comfortable',
        showStatus: true,
        showScore: true,
        showProgressInfo: true,
        showRank: true
    },

    manga: {
        layout: 'list',
        density: 'comfortable',
        showStatus: true,
        showScore: true,
        showProgressInfo: true,
        showRank: true
    }
};

const savedPreferences = localStorage.getItem('libraryPreferences');

if (savedPreferences) {
    libraryPreferences = JSON.parse(savedPreferences);
}

const displayPreferenceNames = {
    "status": "showStatus",
    "score": "showScore",
    "progress-info": "showProgressInfo",
    "rank": "showRank"
};

localStorage.setItem(
    'libraryPreferences',
    JSON.stringify(libraryPreferences)
);



//customization panel buttons/options
const layoutButtons = document.querySelectorAll('.layout-option');
const densityButtons = document.querySelectorAll('.density-option');
const displayOptions = document.querySelectorAll('.display-option input');

//layout button functionality
for (let button of layoutButtons) {
    button.addEventListener('click', function() {
        
        for (let otherButton of layoutButtons) {
            otherButton.classList.remove('active');
        }

        button.classList.add('active');

        mediaLibrary.classList.remove('list-layout', 'gallery-layout', 'showcase-layout');

        const selectedLayout = button.dataset.layout;
        mediaLibrary.classList.add(selectedLayout + '-layout');

        libraryPreferences[mediaType].layout = selectedLayout;
        saveLibraryPreferences();
    });
}

//density button functionality
for (let button of densityButtons) {
    button.addEventListener('click', function() {

        for (let otherButton of densityButtons) {
            otherButton.classList.remove('active');
        }

        button.classList.add('active');

        mediaLibrary.classList.remove('density-comfortable', 'density-compact', 'density-spacious');

        const selectedDensity = button.dataset.density;
        mediaLibrary.classList.add('density-' + selectedDensity);

        libraryPreferences[mediaType].density = selectedDensity;
        saveLibraryPreferences();
    });
}

//display checkbox functionality
for (let option of displayOptions) {
    option.addEventListener('click', function() {
        
        const displaySetting = option.dataset.display;

        if (option.checked) {
            mediaLibrary.classList.remove('hide-' + displaySetting);
        }
        else {
            mediaLibrary.classList.add('hide-' + displaySetting);
        }

        const preferenceName = displayPreferenceNames[displaySetting];

        libraryPreferences[mediaType][preferenceName] = option.checked;
        saveLibraryPreferences();
    });
}


const sortLibrary = document.getElementById('sort-library');

sortLibrary.addEventListener('change', function() {
    sortLibraryEntries(sortLibrary.value);
});


const filterStatus = document.getElementById('filter-status');

filterStatus.addEventListener('change', function() {
    filterLibraryEntries(filterStatus.value);
});

function sortLibraryEntries(sortType) {
    const entries = Array.from(mediaLibrary.querySelectorAll('.media-entry'));

    entries.sort(function(a, b) {
        if (sortType === 'title') {
            return a.dataset.title.localeCompare(b.dataset.title);
        }

        if (sortType === 'score-high') {
            const scoreA = a.dataset.score === '' ? -1 : Number(a.dataset.score);

            const scoreB = b.dataset.score === '' ? -1 : Number(b.dataset.score);

            return scoreB - scoreA
        }

        if (sortType === 'score-low') {
            const scoreA = a.dataset.score === '' ? 11 : Number(a.dataset.score);

            const scoreB = b.dataset.score === '' ? 11 : Number(b.dataset.score);

            return scoreA - scoreB
        }
    });

    for (let entry of entries) {
        mediaLibrary.appendChild(entry);
    }

    updateRanks();
}

function updateRanks() {
    const entries = mediaLibrary.querySelectorAll('.media-entry');

    let rank = 1;

    for (let entry of entries) {
        if (entry.style.display !== 'none') {
            entry.querySelector('.rank-column').innerText = rank;
            rank++;
        }
    }
}

function filterLibraryEntries(selectedStatus) {
    const entries = mediaLibrary.querySelectorAll('.media-entry');

    for (let entry of entries) {
        if (
            selectedStatus === 'all' ||
            entry.dataset.status === selectedStatus
        ) {
            entry.style.display = '';
        }
        else {
            entry.style.display = 'none';
        }
    }

    updateRanks();
}

function saveLibraryPreferences() {
    localStorage.setItem(
        'libraryPreferences', 
        JSON.stringify(libraryPreferences)
    );
}

function applyLibraryPreferences() {
    //apply layout settings
    const savedLayout = libraryPreferences[mediaType].layout;

    mediaLibrary.classList.remove('list-layout', 'gallery-layout', 'showcase-layout');
    mediaLibrary.classList.add(savedLayout + '-layout');

    for (let button of layoutButtons) {
        button.classList.remove('active');

        if (button.dataset.layout === savedLayout) {
            button.classList.add('active');
        }
    }

    //apply density settins
    const savedDensity = libraryPreferences[mediaType].density;

    mediaLibrary.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
    mediaLibrary.classList.add('density-' + savedDensity);

    for (let button of densityButtons) {
        button.classList.remove('active');

        if (button.dataset.density === savedDensity) {
            button.classList.add('active');
        }
    }

    //apply display settings
    for (let option of displayOptions) {
        const displaySetting = option.dataset.display;
        const preferenceName = displayPreferenceNames[displaySetting];
        const shouldShow = libraryPreferences[mediaType][preferenceName];

        option.checked = shouldShow;

        if (shouldShow) {
            mediaLibrary.classList.remove('hide-' + displaySetting);
        }
        else {
            mediaLibrary.classList.add('hide-' + displaySetting);
        }
    }
    
}

applyLibraryPreferences();