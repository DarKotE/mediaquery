import { get as httpGet } from 'http';
import { get as httpsGet } from 'https';

const DEFAULT_OPTS = {
    timeout: 30000
};

// Browser-like headers (required for Google Drive /get_video_info)
const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Connection': 'close'
};

export async function request(url, opts = {}) {
    const options = {};
    Object.assign(options, DEFAULT_OPTS, opts);

    // Merge default headers (user can override if needed)
    options.headers = { ...DEFAULT_HEADERS, ...options.headers };

    return new Promise((resolve, reject) => {
        const link = new URL(url);
        if (!/^https?:$/.test(link.protocol)) {
            return reject(new Error(
                `Unacceptable protocol "${link.protocol}"`
            ));
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
                res.data = buffer;
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
