"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const responses = __importStar(require("./testResponses"));
exports.responses218 = {
    LOADBG: () => '202 LOADBG OK',
    LOAD: () => '202 LOAD OK',
    PLAY: () => '202 PLAY OK',
    PAUSE: () => '202 PAUSE OK',
    RESUME: () => '202 RESUME OK',
    STOP: () => '202 STOP OK',
    CLEAR: () => '202 CLEAR OK',
    CALL: () => 'CALL',
    SWAP: () => 'SWAP',
    ADD: () => '202 ADD OK',
    REMOVE: () => '202 REMOVE OK',
    PRINT: () => '202 PRINT OK',
    LOG: {
        LEVEL: (c) => c &&
            c.length === 3 &&
            c[2].toLowerCase() in ['trace', 'debug', 'info', 'warning', 'error', 'fatal']
            ? '202 LOG OK'
            : '400 ERROR',
        CATEGORY: (c) => (c && c.length === 4 ? '202 LOG OK' : '400 ERROR') // TODO
    },
    SET: () => 'SET',
    LOCK: () => 'LOCK',
    DATA: {
        STORE: () => 'DATA STORE',
        RETRIEVE: () => 'DATA RETRIEVE',
        LIST: () => 'DATA LIST',
        REMOVE: () => 'DATA REMOVE'
    },
    CG: {
        layer: {
            ADD: () => 'CG ADD',
            PLAY: () => 'CG PLAY',
            STOP: () => 'CG STOP',
            NEXT: () => 'CG NEXT',
            REMOVE: () => 'CG REMOVE',
            CLEAR: () => 'CG CLEAR',
            UPDATE: () => 'CG UPDATE',
            INVOKE: () => 'CG INVOKE',
            INFO: () => 'CG INFO'
        }
    },
    MIXER: {
        layer: {
            KEYER: () => 'MIXER KEYER',
            CHROMA: () => 'MIXER CHROMA',
            BLEND: () => 'MIXER BLEND',
            INVERT: () => 'MIXER_INVERT',
            OPACITY: () => 'MIXER OPACITY',
            BRIGHTNESS: () => 'MIXER BRIGHTNESS',
            SATURATION: () => 'MIXER SATURATION',
            CONTRAST: () => 'MIXER CONTRAST',
            LEVELS: () => 'MIXER LEVELS',
            FILL: () => 'MIXER FILL',
            CLIP: () => 'MIXER CLIP',
            ANCHOR: () => 'MIXER ANCHOR',
            CROP: () => 'MIXER CROP',
            ROTATION: () => 'MIXER ROTATION',
            PERSPECTIVE: () => 'MIXER PERSPECTIVE',
            MIPMAP: () => 'MIXER MIPMAP',
            VOLUME: () => 'MIXER VOLUME',
            MASTERVOLUME: () => 'MIXER MASTERVOLUME',
            STRAIGHT_ALPHA_OUTPUT: () => 'MIXER STRAIGHT_ALPHA_OUTPUT',
            GRID: () => 'MIXER GRID',
            COMMIT: () => 'MIXER COMMIT',
            CLEAR: () => 'MIXER CLEAR'
        }
    },
    CHANNEL_GRID: () => '202 CHANNEL_GRID OK',
    THUMBNAIL: {
        LIST: () => 'THUMBNAIL LIST',
        RETRIEVE: () => 'THUMBNAIL RETRIEVE',
        GENERATE: () => 'THUMBNAIL GENERATE',
        GENERATE_ALL: () => 'THUMBNAIL GENERATE_ALL'
    },
    CINF: () => 'CINF',
    CLS: () => responses.clsResponse218,
    FLS: () => responses.flsResponse218,
    TLS: () => responses.tlsResponse218,
    VERSION: () => '201 VERSION OK\r\n2.1.8.12205 62ea2b24d NRK',
    INFO: {
        none: () => 'INFO',
        number: () => 'INFO channel',
        TEMPLATE: () => 'INFO TEMPLATE',
        CONFIG: () => 'INFO CONFIG',
        PATHS: () => 'INFO PATHS',
        SYSTEM: () => 'INFO SYSTEM',
        SERVER: () => 'INFO SERVER',
        THREADS: () => 'INFO THREADS',
        DELAY: () => 'INFO DELAY'
    },
    DIAG: () => '202 DIAG OK',
    // BYE: () => 'BYE',
    KILL: () => '202 KILL OK',
    RESTART: () => '202 RESTART OK',
    PING: (c) => (c && c.length > 1 ? 'PONG ' + c.slice(1).join(' ') : 'PONG'),
    HELP: {
        none: () => 'HELP',
        string: () => 'HELP command',
        PRODUCER: () => 'HELP PRODUCER',
        CONSUMER: () => 'HELP CONSUMER'
    },
    TIME: () => 'TIME',
    SCHEDULE: {
        SET: () => 'SCHEDULE_SET',
        LIST: () => 'SCHEDULE_LIST',
        CLEAR: () => 'SCHEDULE_CLEAR',
        REMOVE: () => 'SCHEDULE_REMOVE',
        INFO: () => 'SCHEDULE_INFO'
    },
    TIMECODE: {
        layer: {
            SOURCE: () => 'TIMECODE_SOURCE'
        }
    }
};
exports.responses207 = Object.assign({}, exports.responses218, {
    VERSION: () => '201 VERSION OK\r\n2.0.7.e9fc25a Stable',
    ROUTE: () => 'ROUTE',
    GL_INFO: () => 'GL INFO',
    GL_GC: () => 'GL GC',
    CLS: () => responses.clsResponse207,
    TLS: () => responses.tlsResponse207
});
exports.responses207.LOG = Object.assign({}, exports.responses218.LOG);
delete exports.responses207.LOG.CATEGORY;
let mixerLayer = Object.assign({}, exports.responses218.MIXER.layer);
delete mixerLayer.INVERT;
exports.responses207.MIXER = Object.assign({}, { layer: mixerLayer });
delete exports.responses207.FLS;
delete exports.responses207.HELP;
delete exports.responses207.TIME;
delete exports.responses207.PING;
delete exports.responses207.SCHEDULE;
delete exports.responses207.TIMECODE;
const info = Object.assign({}, exports.responses218.INFO);
info.QUEUES = () => 'INFO QUEUES';
exports.responses207.INFO = info;
exports.responses220 = Object.assign({}, exports.responses218, {
    VERSION: () => '201 VERSION OK\r\n2.2.0 66a9e3e2 Stable'
});
exports.responses220.LOG = Object.assign({}, exports.responses218.LOG, {
    CLS: () => responses.clsResponse220,
    FLS: () => responses.flsResponse220,
    TLS: () => responses.tlsResponse220
});
delete exports.responses220.LOG.CATEGORY;
const cgLayer = Object.assign({}, exports.responses218.CG.layer);
delete cgLayer.INFO;
exports.responses220.CG = Object.assign({}, { layer: cgLayer });
delete exports.responses220.CG.layer.INFO;
mixerLayer = Object.assign({}, exports.responses218.MIXER.layer);
delete mixerLayer.INVERT;
delete mixerLayer.STRAIGHT_ALPHA_OUTPUT;
exports.responses220.MIXER = Object.assign({}, { layer: mixerLayer });
exports.responses220.INFO = {
    none: exports.responses218.INFO.none,
    number: exports.responses218.INFO.number
};
delete exports.responses220.HELP;
delete exports.responses220.TIME;
delete exports.responses220.SCHEDULE;
delete exports.responses220.TIMECODE;
