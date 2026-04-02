import { get as httpGet } from 'http';
import { get as httpsGet } from 'https';

const DEFAULT_OPTS = {
    timeout: 30000
};

// Default browser-like headers 
const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',           // we don't support gzip yet
    'Connection': 'close'
};

export async function request(url, opts = {}) {
    const options = {};
    Object.assign(options, DEFAULT_OPTS, opts);

    // Merge headers (user can override if they want)
    options.headers = { ...DEFAULT_HEADERS, ...options.headers };

    const startTime = Date.now();
    const link = new URL(url);

    // === IMPROVED REQUEST LOGGING (shows real headers being sent) ===
    console.log(`[REQUEST] ${link.protocol}//${link.host}${link.pathname}${link.search}`);
    console.log('[REQUEST HEADERS]');
    console.dir(options.headers, { depth: 1 });

    return new Promise((resolve, reject) => {
        if (!/^https?:$/.test(link.protocol)) {
            return reject(new Error(`Unacceptable protocol "${link.protocol}"`));
        }

        const get = link.protocol === 'https:' ? httpsGet : httpGet;
        const req = get(link, options);

        // ... (your existing timeout + error handlers stay the same)

        req.on('error', error => {
            console.error(`[REQUEST ERROR] ${url} →`, error);
            reject(error);
        });

        req.on('response', res => {
            let buffer = '';
            res.setEncoding('utf8');

            res.on('data', data => {
                buffer += data;
                if (options.maxResponseSize && buffer.length > options.maxResponseSize) {
                    req.abort();
                    reject(new Error('Response size limit exceeded'));
                }
            });

            res.on('end', () => {
                const duration = Date.now() - startTime;
                res.data = buffer;

                // === RESPONSE LOGGING ===
                console.log(`[RESPONSE] ${res.statusCode} ${res.statusMessage} (${duration}ms)`);
                console.log('[RESPONSE HEADERS]');
                console.dir(res.headers, { depth: 1 });

                if (buffer.length < 8000) {
                    console.log('[RESPONSE BODY]');
                    console.log(buffer);
                } else {
                    console.log(`[RESPONSE BODY] (${buffer.length} bytes - truncated)`);
                    console.log(buffer.substring(0, 1500) + '\n...');
                }

                resolve(res);
            });
        });
    });
}

export async function getJSON(url, options = {}) {
    const res = await request(url, options);

    switch (res.statusCode) {
        // TODO: replace with generic 4xx/5xx detector, remove logic from here
        case 400:
        case 403:
        case 404:
        case 500:
        case 503:
            if (!options.skipStatusCheck
                    || !options.skipStatusCheck.includes(res.statusCode)) {
                throw new Error(res.statusMessage);
            }
            break;
    }

    try {
        return JSON.parse(res.data);
    } catch (e) {
        throw new Error('Response could not be decoded as JSON');
    }
}
