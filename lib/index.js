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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const nodencl_1 = require("nodencl");
const server_1 = require("./AMCP/server");
const commands_1 = require("./AMCP/commands");
const basic_1 = require("./AMCP/basic");
const koa_1 = __importDefault(require("koa"));
const cors_1 = __importDefault(require("@koa/cors"));
const readline_1 = __importDefault(require("readline"));
const initialiseOpenCL = async () => {
    const platformIndex = 0;
    const deviceIndex = 0;
    const clContext = new nodencl_1.clContext({
        platformIndex: platformIndex,
        deviceIndex: deviceIndex,
        overlapping: true
    });
    await clContext.initialise();
    const platformInfo = clContext.getPlatformInfo();
    console.log(`OpenCL accelerator running on device from vendor '${platformInfo.vendor}', type '${platformInfo.devices[deviceIndex].type}'`);
    return clContext;
};
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'AMCP> '
});
rl.on('line', async (input) => {
    if (input === 'q') {
        process.kill(process.pid, 'SIGTERM');
    }
    if (input !== '') {
        console.log(`AMCP received: ${input}`);
        await server_1.processCommand(input.toUpperCase().match(/"[^"]+"|""|\S+/g));
    }
    rl.prompt();
});
rl.on('SIGINT', () => {
    process.kill(process.pid, 'SIGTERM');
});
// 960 * 540 RGBA 8-bit
const lastWeb = Buffer.alloc(1920 * 1080);
const kapp = new koa_1.default();
kapp.use(cors_1.default());
kapp.use((ctx) => {
    ctx.body = lastWeb;
});
const server = kapp.listen(3001);
process.on('SIGHUP', () => server.close);
const commands = new commands_1.Commands();
initialiseOpenCL().then((context) => {
    const basic = new basic_1.Basic(context);
    basic.addCmds(commands);
});
server_1.start(commands).then((fulfilled) => console.log('Command:', fulfilled), console.error);
