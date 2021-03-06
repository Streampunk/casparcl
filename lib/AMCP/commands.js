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
Object.defineProperty(exports, "__esModule", { value: true });
function chanLayerFromString(chanLayStr) {
    let valid = false;
    let channel = 0;
    let layer = 0;
    const match = chanLayStr === null || chanLayStr === void 0 ? void 0 : chanLayStr.match('(?<channel>\\d+)-?(?<layer>\\d*)');
    if (match === null || match === void 0 ? void 0 : match.groups) {
        valid = true;
        const chanLay = match.groups;
        channel = parseInt(chanLay.channel);
        if (chanLay.layer !== '') {
            layer = parseInt(chanLay.layer);
        }
    }
    return { valid: valid, channel: channel, layer: layer };
}
class Commands {
    constructor() {
        this.map = [];
    }
    add(entry) {
        this.map.push(entry);
    }
    async process(command) {
        let result = false;
        const entry = this.map.find(({ cmd }) => cmd === command[0]);
        if (entry) {
            const chanLayer = chanLayerFromString(command[1]);
            result = await entry.fn(chanLayer, command.slice(chanLayer ? 2 : 1));
        }
        return result;
    }
}
exports.Commands = Commands;
