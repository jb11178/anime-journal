

function initializeThemePicker() {
    const pickerButton = document.getElementById("theme-picker-button");
    const pickerMenu = document.getElementById("theme-picker-menu");

    if (!pickerButton || !pickerMenu) {
        return;
    }

    const themeOptions = pickerMenu.querySelectorAll(".nav-theme-option");

    function closeMenu() {
        pickerMenu.hidden = true;
        pickerButton.setAttribute("aria-expanded", "false");
    }

    function updateSelectedTheme(theme) {
        themeOptions.forEach(option => {
            const isSelected = option.dataset.theme === theme;

            option.classList.toggle("active", isSelected);
            option.setAttribute("aria-pressed", String(isSelected));
        });
    }

    // Show or hide the dropdown
    pickerButton.addEventListener("click", () => {
        const isOpen = !pickerMenu.hidden;

        pickerMenu.hidden = isOpen;
        pickerButton.setAttribute("aria-expanded", String(!isOpen));
    });

    // Switch themes when an option is clicked
    themeOptions.forEach(option => {
        option.addEventListener("click", async () => {
            const selectedTheme = option.dataset.theme;

            // Apply the theme immediately
            document.documentElement.dataset.theme = selectedTheme;

            // Remember the theme for logged-out pages
            localStorage.setItem("selectedTheme", selectedTheme);

            updateSelectedTheme(selectedTheme);
            closeMenu();
            pickerButton.focus();

            // Save the preference to the user's account
            try {
                const response = await fetch("/settings/theme", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        theme: selectedTheme
                    })
                });

                if (!response.ok) {
                    throw new Error("Failed to save theme");
                }
            } catch (error) {
                console.error("Theme preference could not be saved:", error);
            }
        });
    });

    // Close the dropdown when clicking elsewhere
    document.addEventListener("click", event => {
        if (!event.target.closest(".nav-theme-picker")) {
            closeMenu();
        }
    });

    // Close with Escape
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !pickerMenu.hidden) {
            closeMenu();
            pickerButton.focus();
        }
    });

    // Highlight the default theme
    updateSelectedTheme(document.documentElement.dataset.theme || "midnight");
}

initializeThemePicker();