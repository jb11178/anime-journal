function getThemeColor(variableName) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();
}

function refreshChartThemes() {
    const accent = getThemeColor("--accent");
    const primary = getThemeColor("--text-primary");
    const secondary = getThemeColor("--text-secondary");
    const border = getThemeColor("--border");

    Object.values(Chart.instances).forEach(chart => {
        if (chart.config.type === "bar") {
            chart.data.datasets.forEach(dataset => {
                dataset.backgroundColor = accent;
                dataset.hoverBackgroundColor = accent;
            });

            chart.options.scales.x.ticks.color = secondary;
            chart.options.scales.y.ticks.color = secondary;

            if (chart.canvas.id === "popular-genres-chart") {
                chart.options.scales.y.ticks.color = primary;
            }

            if (chart.options.scales.x.grid.display !== false) {
                chart.options.scales.x.grid.color = border;
            }

            if (chart.options.scales.y.grid.display !== false) {
                chart.options.scales.y.grid.color = border;
            }
        }

        if (chart.config.type === "doughnut") {
            chart.options.plugins.legend.labels.color = secondary;
        }

        if (chart.config.type === "line") {
            chart.data.datasets.forEach(dataset => {
                dataset.borderColor = accent;
                dataset.backgroundColor = accent + "26";
                dataset.pointBackgroundColor = accent;
                dataset.pointBorderColor = getThemeColor("--surface");
            });

            chart.options.scales.x.ticks.color = secondary;
            chart.options.scales.y.ticks.color = secondary;
            chart.options.scales.y.grid.color = border;
        }

        chart.update();
    });
}

const themeObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
        if (mutation.attributeName === "data-theme") {
            refreshChartThemes();
            break;
        }
    }
});

themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"]
});

const centerTextPlugin = {
    id: "centerText",

    afterDraw(chart, args, options) {
        const { ctx, chartArea } = chart;

        if (!chartArea) {
            return;
        }

        const centerX = (chartArea.left + chartArea.right) / 2;
        const centerY = (chartArea.top + chartArea.bottom) / 2;

        ctx.save();

        // Draw the total
        ctx.font = "600 28px Arial";
        ctx.fillStyle = getThemeColor("--text-primary");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(options.total, centerX, centerY - 10);

        // Draw the label
        ctx.font = "12px Arial";
        ctx.fillStyle = getThemeColor("--text-secondary");

        ctx.fillText(options.label, centerX, centerY + 16);

        ctx.restore();
    }
};

const statusColors = {
    watching: "#8b5cf6",
    reading: "#8b5cf6",
    completed: "#22c55e",
    "plan-to-watch": "#afd1ff",
    "plan-to-read": "#afd1ff",
    "on-hold": "#f59e0b",
    dropped: "#ef4444",
};

const statusLabels = {
    watching: "Watching",
    reading: "Reading",
    completed: "Completed",
    "plan-to-watch": "Plan to Watch",
    "plan-to-read": "Plan to Read",
    "on-hold": "On Hold",
    dropped: "Dropped",
};



// Load saved card order
function restoreDashboardOrder() {
    const dashboard = document.querySelector(".stats-dashboard");

    const orderElement = document.getElementById(
        "stats-card-order-data"
    );

    if (!dashboard || !orderElement) {
        return;
    }

    const savedOrder = JSON.parse(orderElement.textContent);

    if (!Array.isArray(savedOrder) || savedOrder.length === 0) {
        return;
    }

    const cards = Array.from(
        dashboard.querySelectorAll(".stats-card")
    );

    const cardMap = new Map(
        cards.map(card => [card.dataset.cardId, card])
    );

    for (const cardId of savedOrder) {
        const card = cardMap.get(cardId);

        if (card) {
            dashboard.appendChild(card);
        }
    }
}

restoreDashboardOrder();



// Load saved visibility settings
function restoreDashboardVisibility() {
    const dashboard = document.querySelector(".stats-dashboard");

    const hiddenDataElement = document.getElementById(
        "stats-hidden-cards-data"
    );

    const panel = document.getElementById(
        "dashboard-customization-panel"
    );

    if (!dashboard || !hiddenDataElement || !panel) {
        return;
    }

    const hiddenCards = JSON.parse(hiddenDataElement.textContent);

    if (!Array.isArray(hiddenCards)) {
        return;
    }

    const hiddenCardIds = new Set(hiddenCards);

    const cards = dashboard.querySelectorAll(".stats-card");

    cards.forEach(card => {
        const isHidden = hiddenCardIds.has(card.dataset.cardId);

        card.hidden = isHidden;
    });

    const checkboxes = panel.querySelectorAll(
        'input[type="checkbox"]'
    );

    checkboxes.forEach(checkbox => {
        checkbox.checked = !hiddenCardIds.has(checkbox.value);
    });
}

restoreDashboardVisibility();



// Create both status count charts
function createStatusChart(canvasId, statusCounts, mediaType) {
    const canvas = document.getElementById(canvasId);

    if (!canvas) {
        return;
    }

    const statuses = Object.keys(statusCounts);
    const counts = Object.values(statusCounts);

    const total = counts.reduce((sum, count) => sum + count, 0);

    const labels = statuses.map(status => {
        return statusLabels[status] || status;
    });

    const colors = statuses.map(status => {
        return statusColors[status] || "#a1a1aa";
    });

    new Chart(canvas, {
        type: "doughnut",

        plugins: [centerTextPlugin],

        data: {
            labels: labels,

            datasets: [{
                data: counts,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 8
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "70%",

            plugins: {
                centerText: {
                    total: String(total),
                    label: mediaType === "anime" ? "Total Anime" : "Total Manga"
                },

                legend: {
                    position: "bottom",

                    labels: {
                        color: getThemeColor("--text-secondary"),
                        padding: 16,
                        usePointStyle: true,
                        pointStyle: "circle"
                    }
                }
            }
        }
    });
}

createStatusChart("anime-status-chart", animeStatusCounts, 'anime');
createStatusChart("manga-status-chart", mangaStatusCounts, 'manga');



// Create score distribution chart
function createScoreDistributionChart() {
    const canvas = document.getElementById("score-distribution-chart");

    if (!canvas) {
        return;
    }

    const emptyMessage = document.getElementById(
        "score-distribution-empty"
    );

    const toggleButtons = document.querySelectorAll(
        "#score-toggle .stats-toggle-button"
    );

    // Generate every score from 0 to 10 in increments of 0.5
    const scores = Array.from(
        { length: 21 },
        (_, index) => index * 0.5
    );

    const chart = new Chart(canvas, {
        type: "bar",

        data: {
            labels: scores.map(score => score.toFixed(1)),

            datasets: [{
                label: "Entries",
                data: [],
                backgroundColor: getThemeColor("--accent"),
                borderRadius: 4,
                maxBarThickness: 28
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    callbacks: {
                        title: context => {
                            return `Score: ${context[0].label}`;
                        }
                    }
                }
            },

            scales: {
                x: {
                    ticks: {
                        color: getThemeColor("--text-secondary"),
                        maxRotation: 0,
                        autoSkip: true
                    },

                    grid: {
                        display: false
                    }
                },

                y: {
                    beginAtZero: true,

                    ticks: {
                        color: getThemeColor("--text-secondary"),
                        precision: 0,
                        stepSize: 1
                    },

                    grid: {
                        color: getThemeColor("--border")
                    }
                }
            }
        }
    });

    function updateChart(mediaType) {
        const distribution = scoreDistribution[mediaType] || {};

        const counts = scores.map(score => {
            return distribution[score.toFixed(1)] || 0;
        });

        const hasRatings = Object.values(distribution).some(
            count => count > 0
        );

        chart.data.datasets[0].data = counts;
        chart.update();

        canvas.parentElement.hidden = !hasRatings;
        emptyMessage.hidden = hasRatings;

        toggleButtons.forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.media === mediaType
            );
        });

        emptyMessage.textContent =
            `Rate some ${mediaType} to see your score distribution.`;
    }

    toggleButtons.forEach(button => {
        button.addEventListener("click", () => {
            updateChart(button.dataset.media);
        });
    });

    updateChart("anime");
}

createScoreDistributionChart();



// Create popular genres chart
function createPopularGenresChart() {
    const canvas = document.getElementById("popular-genres-chart");

    if (!canvas) {
        return;
    }

    const emptyMessage = document.getElementById(
        "popular-genres-empty"
    );

    const toggleButtons = document.querySelectorAll(
        "#genre-toggle .stats-toggle-button"
    );

    const chart = new Chart(canvas, {
        type: "bar",

        data: {
            labels: [],
            datasets: [{
                label: "Entries",
                data: [],
                backgroundColor: getThemeColor("--accent"),
                borderRadius: 4,
                maxBarThickness: 22
            }]
        },

        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    callbacks: {
                        label: context => {
                            return `${context.parsed.x} entries`;
                        }
                    }
                }
            },

            scales: {
                x: {
                    beginAtZero: true,

                    ticks: {
                        color: getThemeColor("--text-secondary"),
                        precision: 0,
                        stepSize: 1
                    },

                    grid: {
                        color: getThemeColor("--border")
                    }
                },

                y: {
                    ticks: {
                        color: getThemeColor("--text-primary"),
                        font: {
                            size: 12
                        }
                    },

                    grid: {
                        display: false
                    }
                }
            }
        }
    });

    function updateChart(mediaType) {
        const genres = popularGenres[mediaType] || {};

        const sortedGenres = Object.entries(genres).sort(
            (a, b) => b[1] - a[1]
        );

        const labels = sortedGenres.map(entry => entry[0]);
        const counts = sortedGenres.map(entry => entry[1]);

        const hasGenres = labels.length > 0;

        chart.data.labels = labels;
        chart.data.datasets[0].data = counts;

        canvas.parentElement.hidden = !hasGenres;
        emptyMessage.hidden = hasGenres;

        toggleButtons.forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.media === mediaType
            );
        });

        emptyMessage.textContent =
            `Add ${mediaType} to your library to see your popular genres.`;

        chart.update();
    }

    toggleButtons.forEach(button => {
        button.addEventListener("click", () => {
            updateChart(button.dataset.media);
        });
    });

    updateChart("anime");
}

createPopularGenresChart();



// Create the highest rated by release year chart
function createYearlyRatingChart() {
    const canvas = document.getElementById("yearly-rating-chart");

    if (!canvas) {
        return;
    }

    const emptyMessage = document.getElementById(
        "yearly-rating-empty"
    );

    const toggleButtons = document.querySelectorAll(
        "#yearly-rating-toggle .stats-toggle-button"
    );

    const chart = new Chart(canvas, {
        type: "line",

        data: {
            labels: [],

            datasets: [{
                label: "Highest Score",
                data: [],
                borderColor: getThemeColor("--accent"),
                backgroundColor: getThemeColor("--accent") + "26",
                borderWidth: 3,
                pointBackgroundColor: getThemeColor("--accent"),
                pointBorderColor: getThemeColor("--surface"),
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                tension: 0.25,
                fill: true,
                spanGaps: false,
                clip: false
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                mode: "nearest",
                intersect: false
            },

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    callbacks: {
                        title: context => {
                            return `Release Year: ${context[0].label}`;
                        },

                        label: context => {
                            return `Highest Score: ${context.parsed.y}/10`;
                        },

                        afterLabel: context => {
                            const year = context.label;
                            const mediaType = canvas.dataset.media;
                            const yearData =
                                highestRatedByYear[mediaType]?.[year];

                            if (!yearData) {
                                return [];
                            }

                            return yearData.titles;
                        }
                    }
                }
            },

            scales: {
                x: {
                    ticks: {
                        color: getThemeColor("--text-secondary"),
                        maxRotation: 0,
                        autoSkip: true
                    },

                    grid: {
                        display: false
                    }
                },

                y: {
                    min: 0,
                    max: 10,

                    ticks: {
                        color: getThemeColor("--text-secondary"),
                        stepSize: 2
                    },

                    grid: {
                        color: getThemeColor("--border")
                    }
                }
            }
        }
    });

    function updateChart(mediaType) {
        const yearlyData = highestRatedByYear[mediaType] || {};

        // Sort release years numerically
        const years = Object.keys(yearlyData).sort(
            (a, b) => Number(a) - Number(b)
        );

        const scores = years.map(year => yearlyData[year].score);

        const hasRatings = years.length > 0;

        chart.data.labels = years;
        chart.data.datasets[0].data = scores;

        // Used by the tooltip to find the correct titles
        canvas.dataset.media = mediaType;

        canvas.parentElement.hidden = !hasRatings;
        emptyMessage.hidden = hasRatings;

        toggleButtons.forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.media === mediaType
            );
        });

        emptyMessage.textContent =
            `Rate some ${mediaType} to see your highest scores by release year.`;

        chart.update();
    }

    toggleButtons.forEach(button => {
        button.addEventListener("click", () => {
            updateChart(button.dataset.media);
        });
    });

    updateChart("anime");
}

createYearlyRatingChart();



// Toggle top highest rated
function initializeTopRatedToggle() {
    const toggleButtons = document.querySelectorAll(
        "#top-rated-toggle .stats-toggle-button"
    );

    const lists = document.querySelectorAll(
        ".stats-top-rated-list"
    );

    toggleButtons.forEach(button => {
        button.addEventListener("click", () => {
            const selectedMedia = button.dataset.media;

            toggleButtons.forEach(toggleButton => {
                toggleButton.classList.toggle(
                    "active",
                    toggleButton.dataset.media === selectedMedia
                );
            });

            lists.forEach(list => {
                list.hidden = list.dataset.media !== selectedMedia;
            });
        });
    });
}

initializeTopRatedToggle();



// Create entries by release decade chart
function createDecadeChart() {
    const canvas = document.getElementById("decade-chart");

    if (!canvas) {
        return;
    }

    const emptyMessage = document.getElementById("decade-empty");

    const toggleButtons = document.querySelectorAll(
        "#decade-toggle .stats-toggle-button"
    );

    const chart = new Chart(canvas, {
        type: "bar",

        data: {
            labels: [],

            datasets: [{
                label: "Series",
                data: [],
                backgroundColor: getThemeColor("--accent"),
                borderRadius: 5,
                maxBarThickness: 55
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    callbacks: {
                        title: context => {
                            return context[0].label;
                        },

                        label: context => {
                            return `${context.parsed.y} series`;
                        }
                    }
                }
            },

            scales: {
                x: {
                    ticks: {
                        color: getThemeColor("--text-secondary"),
                    },

                    grid: {
                        display: false
                    }
                },

                y: {
                    beginAtZero: true,

                    ticks: {
                        color: getThemeColor("--text-secondary"),
                        precision: 0,
                        stepSize: 1
                    },

                    grid: {
                        color: getThemeColor("--border")
                    }
                }
            }
        }
    });

    function updateChart(mediaType) {
        const decades = releaseDecades[mediaType] || {};

        const sortedDecades = Object.keys(decades).sort(
            (a, b) => Number(a) - Number(b)
        );

        const labels = sortedDecades.map(decade => `${decade}s`);
        const counts = sortedDecades.map(decade => decades[decade]);

        const hasData = sortedDecades.length > 0;

        chart.data.labels = labels;
        chart.data.datasets[0].data = counts;

        canvas.parentElement.hidden = !hasData;
        emptyMessage.hidden = hasData;

        emptyMessage.textContent =
            `Add some ${mediaType} to see your release decade breakdown.`;

        toggleButtons.forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.media === mediaType
            );
        });

        chart.update();
    }

    toggleButtons.forEach(button => {
        button.addEventListener("click", () => {
            updateChart(button.dataset.media);
        });
    });

    updateChart("anime");
}

createDecadeChart();



// Profile picture uploading
function initializeProfilePictureUpload() {
    const fileInput = document.getElementById(
        "profile-picture-input"
    );

    if (!fileInput) {
        return;
    }

    fileInput.addEventListener("change", () => {
        if (fileInput.files.length === 0) {
            return;
        }

        fileInput.form.requestSubmit();
    });
}

initializeProfilePictureUpload();



// Function for opening the favorites editor
function initializeFavoritesEditor() {
    const editButton = document.getElementById("edit-favorites-button");

    const cancelButton = document.getElementById("cancel-favorites-button");

    const modal = document.getElementById("favorites-modal");

    const form = document.getElementById("stats-favorites-form");

    if (
        !editButton ||
        !cancelButton ||
        !modal ||
        !form
    ) {
        return;
    }

    let previousFocus = null;

    function openModal() {
        previousFocus = document.activeElement;
        modal.hidden = false;
        document.body.style.overflow = "hidden";
        const firstSelect = form.querySelector("select");

        if (firstSelect) {
            firstSelect.focus();
        } else {
            cancelButton.focus();
        }
    }

    function closeModal() {
        modal.hidden = true;
        document.body.style.overflow = "";
        form.reset();

        if (previousFocus && previousFocus.isConnected) {
            previousFocus.focus();
        }
    }

    editButton.addEventListener("click", openModal);

    cancelButton.addEventListener("click", closeModal);

    // Close when clicking outside the dialog.
    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeModal();
        }
    });

    // Close with Escape and keep keyboard focus inside.
    modal.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeModal();
            return;
        }

        if (event.key !== "Tab") {
            return;
        }

        const focusable = Array.from(
            modal.querySelectorAll(
                'button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href]'
            )
        ).filter(element => element.getClientRects().length > 0);

        if (focusable.length === 0) {
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (
            !event.shiftKey &&
            document.activeElement === last
        ) {
            event.preventDefault();
            first.focus();
        }
    });
}

initializeFavoritesEditor();



// Function for initializing drag functionality
function initializeDashboardDragging() {
    const dashboard = document.querySelector(".stats-dashboard");

    if (!dashboard || typeof Sortable === "undefined") {
        return;
    }

    Sortable.create(dashboard, {
        animation: 150,

        draggable: ".stats-card:not([hidden])",

        handle: ".stats-drag-handle",

        ghostClass: "stats-card-ghost",

        chosenClass: "stats-card-chosen",

        onEnd: async function () {
            const cards = dashboard.querySelectorAll(".stats-card");

            const cardOrder = Array.from(cards).map(
                card => card.dataset.cardId
            );

            try {
                const response = await fetch("/api/stats/card-order", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        card_order: cardOrder
                    })
                });

                if (!response.ok) {
                    throw new Error("Failed to save dashboard order");
                }

                console.log("Dashboard order saved successfully");

            } catch (error) {
                console.error("Error saving dashboard order:", error);
            }
        }
    });
}

initializeDashboardDragging();



// Dashboard visibility customization
function initializeDashboardCustomization() {
    const customizeButton = document.getElementById(
        "customize-dashboard-button"
    );

    const panel = document.getElementById(
        "dashboard-customization-panel"
    );

    const dashboard = document.querySelector(".stats-dashboard");

    if (!customizeButton || !panel || !dashboard) {
        return;
    }

    customizeButton.addEventListener("click", () => {
        const isOpen = !panel.hidden;

        panel.hidden = isOpen;

        customizeButton.setAttribute(
            "aria-expanded",
            String(!isOpen)
        );

        customizeButton.textContent = isOpen
            ? "Customize Dashboard"
            : "Done";
    });

    const checkboxes = panel.querySelectorAll(
        'input[type="checkbox"]'
    );

    checkboxes.forEach(checkbox => {
        checkbox.addEventListener("change", async () => {
            const cardId = checkbox.value;

            const card = dashboard.querySelector(
                `.stats-card[data-card-id="${cardId}"]`
            );

            if (!card) {
                return;
            }

            const visible = checkbox.checked;

            card.hidden = !visible;
            checkbox.disabled = true;

            try {
                const response = await fetch(
                    "/api/stats/card-visibility",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            card_id: cardId,
                            visible: visible
                        })
                    }
                );

                if (!response.ok) {
                throw new Error("Failed to save card visibility");
                }

                console.log(`Visibility saved for ${cardId}`);

            } catch (error) {
                console.error(error);

                // Restore the previous state if saving failed.
                checkbox.checked = !visible;
                card.hidden = visible;

            } finally {
                checkbox.disabled = false;
            }
        });
    });
}

initializeDashboardCustomization();