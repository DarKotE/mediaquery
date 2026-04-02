import { get as httpGet } from 'http';
import { get as httpsGet } from 'https';

const DEFAULT_OPTS = {
    timeout: 30000
};

export async function request(url, opts = {}) {
    const options = {};
    Object.assign(options, DEFAULT_OPTS, opts);

    // === REQUEST LOGGING ===
    const startTime = Date.now();
    const link = new URL(url);
    console.log(`[REQUEST] ${link.protocol}//${link.host}${link.pathname}${link.search}`);
    if (Object.keys(options).length > 0) {
        console.dir(options, { depth: 2 });   // shows headers, timeout, etc.
    }

    return new Promise((resolve, reject) => {
        if (!/^https?:$/.test(link.protocol)) {
            return reject(new Error(`Unacceptable protocol "${link.protocol}"`));
        }

        const get = link.protocol === 'https:' ? httpsGet : httpGet;
        const req = get(link, options);

        req.setTimeout(options.timeout, () => {
            const error = new Error('Request timed out');
            error.code = 'ETIMEDOUT';
            req.abort();
            reject(error);
        });

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
                console.dir(res.headers, { depth: 1 });

                // Only log body if it's not huge (you can adjust the limit)
                if (buffer.length < 5000) {
                    console.log('[RESPONSE BODY]\n', buffer);
                } else {
                    console.log(`[RESPONSE BODY] (${buffer.length} bytes) - too large to log fully`);
                    console.log(buffer.substring(0, 1000) + '\n...');
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
