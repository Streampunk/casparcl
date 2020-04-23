"use strict";
/* Copyright 2020 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const net = __importStar(require("net"));
const cmdResponses_1 = require("./cmdResponses");
let cmds;
let ccgResponses = cmdResponses_1.responses218;
function processCommand(command, token = '') {
    var _a;
    if (!command) {
        return '400 ERROR';
    }
    if (command[0] === 'REQ') {
        if (command[2] !== 'PING') {
            return processCommand(command.slice(2), command[1]);
        }
        else {
            token = command[1];
        }
    }
    if (command[0] === 'SWITCH') {
        if (command[1] === '207') {
            ccgResponses = cmdResponses_1.responses207;
            return '202 SWITCH 207 OK';
        }
        if (command[1] === '218') {
            ccgResponses = cmdResponses_1.responses218;
            return '202 SWITCH 218 OK';
        }
        if (command[1] === '220') {
            ccgResponses = cmdResponses_1.responses220;
            return '202 SWITCH 220 OK';
        }
        return '400 SWITCH ERROR';
    }
    if (command[0] === 'BYE') {
        return '***BYE***';
    }
    if (ccgResponses[command[0]]) {
        if (!((_a = cmds) === null || _a === void 0 ? void 0 : _a.process(command))) {
            return `400 ERROR\r\n${command.join(' ')} NOT IMPLEMENTED`;
        }
        const responseFn = ccgResponses[command[0]];
        let response = null;
        if (typeof responseFn === 'function') {
            response = responseFn(command);
        }
        else {
            if (responseFn.none && command.length === 1) {
                response = responseFn.none(command);
            }
            else if (responseFn.number && command.length >= 2) {
                response = responseFn.number(command);
            }
            else if (responseFn.layer && command.length >= 3) {
                response = responseFn.layer[command[2]](command);
            }
            else if (command.length >= 2 && responseFn[command[1]]) {
                response = responseFn[command[1]](command);
            }
            if (response === null && responseFn.string && command.length >= 2) {
                response = responseFn.string(command);
            }
        }
        if (response)
            return token ? `RES ${token} ${response}` : response;
    }
    return token
        ? `RES ${token} 400 ERROR\r\n${command.join(' ')}`
        : `400 ERROR\r\n${command.join(' ')}`;
}
exports.processCommand = processCommand;
const server = net.createServer((c) => {
    console.log('client connected');
    c.on('end', () => {
        console.log('client disconnected');
    });
});
server.on('error', (err) => {
    throw err;
});
async function start(commands) {
    if (commands)
        cmds = commands;
    return new Promise((resolve, reject) => {
        let resolved = false;
        server.once('error', (e) => {
            if (!resolved)
                reject(e);
        });
        server.listen(5250, () => {
            resolved = true;
            resolve('CasparCL server AMCP protocol running on port 5250');
        });
    });
}
exports.start = start;
async function stop() {
    return new Promise((resolve, reject) => {
        let resolved = false;
        server.once('error', (err) => {
            if (!resolved)
                reject(err);
        });
        server.close((e) => {
            if (e)
                return reject(e);
            resolved = true;
            resolve('CasparCL server closed');
        });
    });
}
exports.stop = stop;
server.on('listening', () => {
    // console.log('CasparCL server AMCP protocol running on port 5250')
});
server.on('connection', (sock) => {
    let chunk = '';
    sock.on('data', (input) => {
        chunk += input.toString();
        let eol = chunk.indexOf('\r\n');
        while (eol > -1) {
            const command = chunk.substring(0, eol);
            console.log(command);
            const result = processCommand(command.toUpperCase().match(/"[^"]+"|""|\S+/g));
            if (result === '***BYE***') {
                sock.destroy();
                break;
            }
            sock.write(result.toString() + '\r\n');
            console.log(result);
            if (result === '202 KILL OK') {
                sock.destroy();
                stop().catch(console.error);
                break;
            }
            chunk = chunk.substring(eol + 2);
            eol = chunk.indexOf('\r\n');
        }
    });
    sock.on('error', console.error);
    sock.on('close', () => {
        console.log('client disconnect');
    });
});
function version(version) {
    if (version === '207') {
        ccgResponses = cmdResponses_1.responses207;
    }
    if (version === '218') {
        ccgResponses = cmdResponses_1.responses218;
    }
    if (version === '220') {
        ccgResponses = cmdResponses_1.responses220;
    }
}
exports.version = version;
if (!module.parent) {
    start().then(console.log, console.error);
}
