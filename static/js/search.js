const mediaTypeButtons = document.querySelectorAll('.media-type-button');

const mediaTypeInput = document.querySelector('#search-media-type');

for (let button of mediaTypeButtons) {
    button.addEventListener('click', function() {

        for (let otherButton of mediaTypeButtons) {
            otherButton.classList.remove('active');
        }

        button.classList.add('active');

        mediaTypeInput.value = button.dataset.mediaType;
    });
}