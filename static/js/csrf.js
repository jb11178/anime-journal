async function csrfFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();

    const headers = new Headers(options.headers || {});

    if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
        const csrfToken = document.querySelector(
            'meta[name="csrf-token"]'
        )?.content;

        if (!csrfToken) {
            throw new Error('CSRF token not found');
        }

        headers.set('X-CSRFToken', csrfToken);
    }

    return fetch(url, {
        ...options,
        headers
    });
}