const mediaPage = document.getElementById('media-page');
const mediaType = mediaPage.dataset.mediaType;

const anilistId = Number(mediaPage.dataset.anilistId);

let userHasEntry = mediaPage.dataset.hasEntry === 'true';

const entryHeading = document.getElementById('entry-heading');

const entryEmptyState = document.getElementById('entry-empty-state');

const mediaConfig = {
    anime: {
        progressUnit: 'Episodes',
        progressLabel: 'Episodes Watched',

        statuses: [
            {
                value: 'watching',
                label: 'Watching'
            },
            {
                value: 'completed',
                label: 'Completed'
            },
            {
                value: 'on-hold',
                label: 'On Hold'
            },
            {
                value: 'dropped',
                label: 'Dropped'
            },
            {
                value: 'plan-to-watch',
                label: 'Plan to Watch'
            },
        ]
    },

    manga: {
        progressUnit: 'Chapters',
        progressLabel: 'Chapters Read',

        statuses: [
            {
                value: 'reading',
                label: 'Reading'
            },
            {
                value: 'completed',
                label: 'Completed'
            },
            {
                value: 'on-hold',
                label: 'On Hold'
            },
            {
                value: 'dropped',
                label: 'Dropped'
            },
            {
                value: 'plan-to-read',
                label: 'Plan to Read'
            },
        ]
    }
}

const totalProgress = mediaPage.dataset.totalProgress === "" ? null : Number(mediaPage.dataset.totalProgress);

const totalProgressDisplay = totalProgress === null ? "?" : totalProgress;

const entryStatus = document.getElementById("entry-status");
const entryProgress = document.getElementById("entry-progress");
const entryScore = document.getElementById('entry-score');

if (totalProgress !== null) {
    entryProgress.max = totalProgress;
} else {
    entryProgress.removeAttribute("max");
}

//populate status selector dropdown
const currentMediaConfig = mediaConfig[mediaType];

for (let status of currentMediaConfig.statuses) {
    const option = document.createElement('option');

    option.value = status.value;
    option.innerText = status.label;

    entryStatus.appendChild(option);
}

const progressLabel = document.getElementById('progress-label');

progressLabel.innerText = currentMediaConfig.progressLabel;


const displayScore = document.getElementById("display-score");
const displayStatus = document.getElementById("display-status");
const displayProgress = document.getElementById("display-progress");

if (userHasEntry) {
    displayProgress.innerText =  displayProgress.dataset.progress + " / " + totalProgressDisplay + " " + currentMediaConfig.progressUnit;
}

if (userHasEntry) {
    const currentStatus = currentMediaConfig.statuses.find(function(status) {
        return status.value === displayStatus.dataset.status;
    });

    if (currentStatus) {
        displayStatus.innerText = currentStatus.label;
    }
}

const notesSection = document.getElementById('notes-section');


//elements for notes editing, buttons to cancel and save editing
const editNotesButton = document.getElementById("edit-notes-button");
const notesContent = document.getElementById("notes-content");
const notesEditor = document.getElementById("notes-editor");
const notesInput = document.getElementById("notes-input");

const cancelNotesButton = document.getElementById("cancel-notes-button");
const saveNotesButton = document.getElementById("save-notes-button");

//elements for entry editing, buttons to cancel and save editing
const editEntryButton = document.getElementById("edit-entry-button");
const entryEditor = document.getElementById("entry-editor");
const userEntryStats = document.querySelector(".user-entry-stats");

const cancelEntryButton = document.getElementById("cancel-entry-button");
const saveEntryButton = document.getElementById("save-entry-button");

const removeEntryButton = document.getElementById("remove-entry-button");

//edit notes button functionality, opens notes editor
editNotesButton.addEventListener('click', function() {
    if (notesContent.classList.contains('empty')) {
        notesInput.value = '';
    }
    else {
        notesInput.value = notesContent.innerText;
    }
    
    notesEditor.classList.add('open');
    notesContent.style.display = 'none';
    editNotesButton.style.display = 'none';
});

//cancel editing button functionality, closes editor
cancelNotesButton.addEventListener('click', function() {
    notesEditor.classList.remove('open');
    notesContent.style.display = 'block';
    editNotesButton.style.display = 'block';
});

//save notes button functionality, saves new notes and closes editor
saveNotesButton.addEventListener('click', async function() {
    const updatedNotes = notesInput.value.trim();

    const response = await fetch(`/api/entries/${anilistId}/notes`, {
        method: "PATCH",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            notes: updatedNotes
        })
    });

    if (!response.ok) {
        console.error("Failed to update notes");
        return;
    }

    if (updatedNotes === '') {
        notesContent.innerText = "You haven't written any notes yet.";
        notesContent.classList.add('empty');
    }
    else {
        notesContent.innerText = updatedNotes;

        notesContent.classList.remove('empty');
    }

    notesEditor.classList.remove('open');
    notesContent.style.display = 'block';
    editNotesButton.style.display = 'block';
})

//fill score entry with options from 0 to 10 in 0.5 increments
for (let score = 0; score <= 10; score += 0.5) {
    const option = document.createElement('option');

    option.value = score.toFixed(1);
    option.innerText =  score.toFixed(1);

    entryScore.appendChild(option);
}

//edit entry button, opens entry editing window
editEntryButton.addEventListener('click', function() {
    if (userHasEntry) {
        entryScore.value = displayScore.dataset.score;
        entryStatus.value = displayStatus.dataset.status;
        entryProgress.value = displayProgress.dataset.progress;

        entryHeading.innerText = 'Edit Entry';
        saveEntryButton.innerText = 'Save Changes';
    }
    else {
        entryScore.value = "";
        entryStatus.value = currentMediaConfig.statuses[0].value;
        entryProgress.value = 0;

        entryHeading.innerText = 'Add New Entry';
        saveEntryButton.innerText = 'Add to List';
    }

    entryEditor.classList.add('open');

    userEntryStats.style.display = 'none';
    entryEmptyState.style.display = 'none';
    editEntryButton.style.display = 'none';
});

//cancel entry editting button, closes entry editor
cancelEntryButton.addEventListener("click", function() {
    entryEditor.classList.remove("open");

    editEntryButton.style.display = "block";

    updateEntryDisplay();
});

//save entry editing button, updates entry info, closes editor
saveEntryButton.addEventListener('click', async function() {
    const newScore = entryScore.value;
    const newStatus = entryStatus.value;
    const newProgress = entryProgress.value;

    if(
        newProgress < 0 ||
        (totalProgress !== null && newProgress > totalProgress)
    ) {
        return;
    }

    const requestMethod = userHasEntry ? "PUT" : "POST";

    const response = await fetch(`/api/entries/${anilistId}`, {
        method: requestMethod, 

        headers: {
            "Content-Type": "application/json"
        },
    
        body: JSON.stringify({
            status: newStatus,
            score: newScore === "" ? null : Number(newScore),
            progress: Number(newProgress),
            media_type: mediaType
        })
    });

    if (!response.ok) {
        console.error("Failed to update entry");
        return;
    }

    displayScore.innerText = newScore === "" ? "Unrated" : newScore;
    displayScore.dataset.score = newScore;

    displayProgress.innerText = newProgress + " / " + totalProgressDisplay + " " + currentMediaConfig.progressUnit;
    displayProgress.dataset.progress = newProgress;

    const selectedStatus = currentMediaConfig.statuses.find(function(status) {
        return status.value === newStatus;
    })

    displayStatus.innerText = selectedStatus.label;
    displayStatus.dataset.status = newStatus;

    userHasEntry = true;

    entryEditor.classList.remove("open");
    editEntryButton.style.display = "block";

    updateEntryDisplay();
});

//remove entry button, removes entry from user table
removeEntryButton.addEventListener('click', async function() {
    const response = await fetch(`/api/entries/${anilistId}`, {
        method: "DELETE"
    });

    if (!response.ok) {
        console.error("Failed to remove entry");
        return;
    }

    displayStatus.innerText = "";
    displayStatus.dataset.status = "";

    displayScore.innerText = "";
    displayScore.dataset.score = "";

    displayProgress.innerText = "";
    displayProgress.dataset.progress = "0";

    notesContent.innerText = "";
    notesInput.value = "";

    userHasEntry = false;

    updateEntryDisplay();
});

//updates entry display based on whether the series already in user's library.
function updateEntryDisplay() {
    if (userHasEntry) {
        userEntryStats.style.display = 'grid';
        entryEmptyState.style.display = 'none';

        editEntryButton.innerText = 'Edit Entry';

        notesSection.style.display = 'block';

        removeEntryButton.style.display = 'block';
    }
    else {
        userEntryStats.style.display = 'none';
        entryEmptyState.style.display = 'block';

        editEntryButton.innerText = 'Add to List';

        notesSection.style.display = 'none';

        removeEntryButton.style.display = 'none';
    }

    entryHeading.innerText = 'On Your List';
}

updateEntryDisplay();